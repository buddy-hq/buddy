import { afterEach, describe, expect, test } from "bun:test"
import createIndigoRuntime from "indigo-ketcher"
import { IndigoWorkerClient, INDIGO_MAX_PENDING_RENDERS } from "../src/components/media/renderers/chemistry/indigo-worker-client"
import { renderWithIndigo } from "../src/components/media/renderers/chemistry/indigo-runtime"
import {
  clearChemistryRenderCacheForTests,
  readCachedChemistrySvg,
  renderChemistrySvg,
} from "../src/components/media/renderers/chemistry/render"
import {
  prepareChemistrySvg,
  scopeChemistrySvgIDs,
} from "../src/components/media/renderers/chemistry/svg"
import {
  indigoFormatForChemistry,
  MAX_SEMANTIC_CHEMISTRY_SOURCE_BYTES,
  validateChemistrySource,
} from "../src/components/media/renderers/chemistry/validation"
import {
  chemistryRenderOwner,
  CHEMISTRY_FORMATS,
  type ChemistryFormat,
} from "../src/components/media/renderers/chemistry/formats"

type SemanticChemistryFormat = Exclude<ChemistryFormat, "chemfig">
type SemanticFixture = {
  format: SemanticChemistryFormat
  source: string
}

const originalWorker = globalThis.Worker

async function createSemanticFixtures(): Promise<SemanticFixture[]> {
  const runtime = await createIndigoRuntime()
  const defaultOptions = new runtime.MapStringString()
  try {
    return [
      { format: "smiles", source: "CCO" },
      { format: "cxsmiles", source: "CCO |$;;$|" },
      { format: "reaction-smiles", source: "CCO>>CC=O" },
      { format: "ket", source: runtime.convert("CCO", "ket", defaultOptions) },
    ]
  } finally {
    defaultOptions.delete()
  }
}

afterEach(() => {
  clearChemistryRenderCacheForTests()
  globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__ = undefined
  Reflect.set(globalThis, "Worker", originalWorker)
})

describe("production chemistry renderer", () => {
  test("assigns every format to one rendering owner", () => {
    expect(
      CHEMISTRY_FORMATS.map((format) => [format, chemistryRenderOwner(format)]),
    ).toEqual([
      ["smiles", "browser"],
      ["cxsmiles", "browser"],
      ["reaction-smiles", "browser"],
      ["ket", "browser"],
      ["chemfig", "backend"],
    ])
  })

  test("leaves Chemfig identity and caching to the backend owner", async () => {
    let renderCount = 0
    globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__ = async () => {
      renderCount += 1
      return {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" />',
        rendererName: "authoritative-backend",
        rendererVersion: "backend-version",
        renderConfigVersion: 42,
      }
    }

    const input: { format: Extract<ChemistryFormat, "chemfig">; source: string } = {
      format: "chemfig",
      source: String.raw`\chemfig{C-C}`,
    }
    const first = await renderChemistrySvg(input)
    const second = await renderChemistrySvg(input)

    expect(renderCount).toBe(2)
    expect(readCachedChemistrySvg(input)).toBeUndefined()
    expect(first).toMatchObject({
      rendererName: "authoritative-backend",
      rendererVersion: "backend-version",
      renderConfigVersion: 42,
    })
    expect(second).toEqual(first)
  })

  test("renders every Indigo-backed format with the real WASM runtime", async () => {
    const fixtures = await createSemanticFixtures()
    for (const fixture of fixtures) {
      const validated = validateChemistrySource(fixture)
      const rendered = await renderWithIndigo({
        type: "render",
        requestID: `render-${fixture.format}`,
        source: validated.source,
        format: indigoFormatForChemistry(fixture.format),
      })
      expect(rendered.type).toBe("rendered")
      expect(rendered.requestID).toBe(`render-${fixture.format}`)
      expect(rendered.rendererVersion).not.toBeEmpty()
      expect(rendered.svg).toStartWith("<svg")
      expect(rendered.svg).not.toContain("<?xml")
    }
  }, 20_000)

  test("preserves Indigo glyph references, themes black strokes, and scopes IDs per instance", async () => {
    const rendered = await renderWithIndigo({
      type: "render",
      requestID: "render-glyphs",
      source: "CCO",
      format: "smiles",
    })
    expect(rendered.svg).toContain("<use")
    expect(rendered.svg).toContain("rgb(0%, 0%, 0%)")

    const prepared = prepareChemistrySvg(rendered.svg)
    expect(prepared).toContain("<use")
    expect(prepared).toContain("currentColor")
    expect(prepared).not.toContain("rgb(0%, 0%, 0%)")

    const first = scopeChemistrySvgIDs(prepared, "diagram:first")
    const second = scopeChemistrySvgIDs(prepared, "diagram:second")
    expect(first).not.toBe(second)
    expect(first).toContain("diagram_first-")
    expect(second).toContain("diagram_second-")
    expect(first).not.toContain('href="#glyph-')
    expect(second).not.toContain('href="#glyph-')
  }, 20_000)

  test("makes unspecified Chemfig text fills inherit the transcript color", () => {
    const prepared = prepareChemistrySvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><g stroke="#000"><text stroke="none">C</text><path fill="none" d="M0 0h10"/></g></svg>',
    )

    expect(prepared).toContain('color="currentColor"')
    expect(prepared).toContain('fill="currentColor"')
    expect(prepared).toContain('stroke="currentColor"')
    expect(prepared).toContain('<text stroke="none">C</text>')
  })

  test("removes external SVG resources while preserving defined local fragments", () => {
    const prepared = prepareChemistrySvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="local" d="M0 0h1"/></defs><use href="#local"/><use href="#missing"/><use href="https://example.com/shape"/><rect fill="url( '#local' )"/><rect style="fill:url('https://example.com/a b')"/><image href="data:image/png;base64,AAAA"/></svg>`,
    )
    expect(prepared).toContain('href="#local"')
    expect(prepared).toContain("fill=\"url( '#local' )\"")
    expect(prepared).not.toContain('href="#missing"')
    expect(prepared).not.toContain("example.com")
    expect(prepared).not.toContain("<image")
  })

  test("preserves exact authored source and rejects invalid input asynchronously", async () => {
    const exactSource = "C\uFEFFC"
    let renderedSource: string | undefined
    globalThis.__BUDDY_TEST_CHEMISTRY_RENDERER__ = async (input) => {
      renderedSource = input.source
      return { svg: '<svg xmlns="http://www.w3.org/2000/svg" />' }
    }

    const rendered = await renderChemistrySvg({ format: "smiles", source: exactSource })
    expect(renderedSource).toBe(exactSource)
    expect(rendered.sourceHash).not.toBeEmpty()

    const invalidRender = renderChemistrySvg({ format: "smiles", source: "" })
    expect(invalidRender).toBeInstanceOf(Promise)
    await expect(invalidRender).rejects.toThrow("Chemistry source is empty")
  })

  test("enforces the semantic chemistry source byte limit", () => {
    expect(
      validateChemistrySource({
        format: "smiles",
        source: "C".repeat(MAX_SEMANTIC_CHEMISTRY_SOURCE_BYTES),
      }).sourceBytes,
    ).toBe(MAX_SEMANTIC_CHEMISTRY_SOURCE_BYTES)
    expect(() =>
      validateChemistrySource({
        format: "smiles",
        source: "C".repeat(MAX_SEMANTIC_CHEMISTRY_SOURCE_BYTES + 1),
      }),
    ).toThrow("Chemistry source is too large")
  })

  test("validates KET structure and reports unsupported CXSMILES S-groups clearly", async () => {
    const runtime = await createIndigoRuntime()
    const options = new runtime.MapStringString()
    try {
      const ket = runtime.convert("CCO", "ket", options)
      expect(validateChemistrySource({ format: "ket", source: ket }).source).toBe(ket)
    } finally {
      options.delete()
    }

    expect(() =>
      validateChemistrySource({ format: "ket", source: '{"version":1}' }),
    ).toThrow('KET source must contain a "root.nodes" array')
    expect(() =>
      validateChemistrySource({
        format: "ket",
        source: '{"root":{"nodes":[{"$ref":"mol0"}]}}',
      }),
    ).toThrow("Every KET root node must reference an object")
    expect(() =>
      validateChemistrySource({
        format: "ket",
        source: '{"root":{"nodes":[{"$ref":"__proto__"}]}}',
      }),
    ).toThrow("Every KET root node must reference an object")
    expect(
      validateChemistrySource({
        format: "cxsmiles",
        source: "CCCC |Sg:n:0,1,2::ht|",
      }).source,
    ).toBe("CCCC |Sg:n:0,1,2::ht|")
    expect(() =>
      validateChemistrySource({
        format: "cxsmiles",
        source: "CCCC |Sg:SRU:0,1,2::ht|",
      }),
    ).toThrow('CXSMILES S-group type "SRU" is not supported')
  })

  test("bounds the worker queue and rejects excess work", async () => {
    class UnresponsiveWorker {
      addEventListener(): void {}
      postMessage(): void {}
      terminate(): void {}
    }
    Reflect.set(globalThis, "Worker", UnresponsiveWorker)
    const client = new IndigoWorkerClient()
    const pending = Array.from({ length: INDIGO_MAX_PENDING_RENDERS }, () =>
      client.render({ source: "CCO", format: "smiles" }),
    )
    for (const render of pending) {
      void render.catch(() => undefined)
    }
    await expect(client.render({ source: "CCC", format: "smiles" })).rejects.toThrow(
      "renderer is busy",
    )
    client.destroy()
    await Promise.allSettled(pending)
  })

  test("cancels superseded worker jobs and immediately advances the queue", async () => {
    class ControllableWorker {
      static instances: ControllableWorker[] = []
      listeners = new Map<string, EventListener>()
      messages: unknown[] = []
      terminated = false

      constructor() {
        ControllableWorker.instances.push(this)
      }

      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
      ): void {
        if (typeof listener === "function") {
          this.listeners.set(type, listener)
        }
      }

      postMessage(value: unknown): void {
        this.messages.push(value)
      }

      terminate(): void {
        this.terminated = true
      }
    }
    Reflect.set(globalThis, "Worker", ControllableWorker)
    const client = new IndigoWorkerClient()
    const firstController = new AbortController()
    const first = client.render({
      source: "CCO",
      format: "smiles",
      signal: firstController.signal,
    })
    const second = client.render({ source: "CCC", format: "smiles" })

    firstController.abort()
    await expect(first).rejects.toThrow("cancelled")
    expect(ControllableWorker.instances[0]?.terminated).toBe(true)
    const replacement = ControllableWorker.instances[1]
    const request = replacement?.messages[0]
    if (
      !replacement ||
      request === null ||
      typeof request !== "object" ||
      Array.isArray(request) ||
      !("requestID" in request) ||
      typeof request.requestID !== "string"
    ) {
      throw new Error("Expected the queued render to start on a replacement worker.")
    }
    replacement.listeners.get("message")?.(
      new MessageEvent("message", {
        data: {
          type: "rendered",
          requestID: request.requestID,
          rendererVersion: "test",
          svg: "<svg />",
          warnings: [],
        },
      }),
    )
    await expect(second).resolves.toMatchObject({ requestID: request.requestID })
    client.destroy()
  })

  test("starts a fresh render when an identical in-flight job was aborted", async () => {
    class StrictModeWorker {
      static instances: StrictModeWorker[] = []
      readonly instanceIndex: number
      listeners = new Map<string, EventListener>()
      terminated = false

      constructor() {
        this.instanceIndex = StrictModeWorker.instances.length
        StrictModeWorker.instances.push(this)
      }

      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
      ): void {
        if (typeof listener === "function") {
          this.listeners.set(type, listener)
        }
      }

      postMessage(value: unknown): void {
        if (this.instanceIndex !== 1 || value === null || typeof value !== "object") {
          return
        }
        if (Array.isArray(value) || !("requestID" in value)) return
        const requestID = value.requestID
        if (typeof requestID !== "string") return

        this.listeners.get("message")?.(
          new MessageEvent("message", {
            data: {
              type: "rendered",
              requestID,
              rendererVersion: "test",
              svg: '<svg xmlns="http://www.w3.org/2000/svg" />',
              warnings: [],
            },
          }),
        )
      }

      terminate(): void {
        this.terminated = true
      }
    }

    Reflect.set(globalThis, "Worker", StrictModeWorker)
    const firstController = new AbortController()
    const first = renderChemistrySvg({
      source: "CCO",
      format: "smiles",
      signal: firstController.signal,
    })
    firstController.abort()
    const replacement = renderChemistrySvg({ source: "CCO", format: "smiles" })
    const [firstResult, replacementResult] = await Promise.allSettled([first, replacement])

    expect(firstResult.status).toBe("rejected")
    if (firstResult.status !== "rejected") {
      throw new Error("Expected the aborted chemistry render to reject.")
    }
    const firstError: unknown = firstResult.reason
    expect(firstError).toBeInstanceOf(Error)
    if (!(firstError instanceof Error)) {
      throw new Error("Expected the aborted chemistry render to reject with an Error.")
    }
    expect(firstError.message).toContain("cancelled")
    expect(replacementResult.status).toBe("fulfilled")
    if (replacementResult.status !== "fulfilled") {
      throw new Error("Expected the replacement chemistry render to succeed.")
    }
    expect(replacementResult.value).toMatchObject({ rendererVersion: "test" })
    expect(StrictModeWorker.instances).toHaveLength(2)
    expect(StrictModeWorker.instances[0]?.terminated).toBe(true)
  })
})
