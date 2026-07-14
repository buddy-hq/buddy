import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import {
  CHEMFIG_RENDER_TIMEOUT_MS,
  CHEMFIG_RENDER_CACHE_MAX_ENTRY_BYTES,
  chemfigRenderCacheDirectory,
  chemfigRenderCacheFile,
  chemistryChildFailureError,
  enforceChemfigCacheLimits,
  renderChemfig,
  runInSerializedRenderQueue,
  validateChemfigSource,
} from "../../src/chemistry/chemfig-renderer"
import { tmpdir } from "../helpers/tmpdir"

const LARGE_CACHE_LIMIT = Number.MAX_SAFE_INTEGER

describe("chemfig renderer reliability", () => {
  test("maps structured child stages without blaming backend failures on source syntax", () => {
    const sourceHash = "a".repeat(64)
    expect(
      chemistryChildFailureError({
        sourceHash,
        detail: JSON.stringify({
          stage: "tex_compilation",
          message: "TeX engine render failed. Set options.showConsole to true.",
        }),
      }),
    ).toMatchObject({
      code: "chemfig_tex_compile_failed",
      message: "The chemfig source could not be compiled by the TeX renderer.",
    })
    expect(
      chemistryChildFailureError({
        sourceHash,
        detail: JSON.stringify({
          stage: "dvi_conversion",
          message: "Cannot read properties of null (reading 'outerHTML')",
        }),
      }),
    ).toMatchObject({
      code: "chemfig_dvi_conversion_failed",
      message: "The chemfig backend could not convert the compiled TeX output to SVG.",
    })
  })

  test("validates TeX control tokens instead of substring matching", () => {
    expect(() => validateChemfigSource(String.raw`\chemfig{C-C}`)).not.toThrow()
    expect(() =>
      validateChemfigSource(String.raw`\chemfig{C}\%\input{outside}`),
    ).toThrow("control sequence")
    expect(() => validateChemfigSource(String.raw`\chemfig{C}\InPuT{outside}`)).toThrow(
      "control sequence",
    )
    expect(() =>
      validateChemfigSource(String.raw`\chemfig{C}\InputIfFileExists{outside}{}{}`),
    ).toThrow("control sequence")
    expect(() =>
      validateChemfigSource(String.raw`\chemfig{C}\csname input\endcsname`),
    ).toThrow("control sequence")
    expect(() => validateChemfigSource(String.raw`\chemfig{C}\in^^70ut{outside}`)).toThrow(
      "control sequence",
    )
  })

  test("self-heals cache records whose identity or JSON is corrupt", async () => {
    await using project = await tmpdir({ git: true })
    const source = String.raw`\chemfig{C-C-O}% cache-self-heal`
    const first = await renderChemfig({ directory: project.path, source })
    const cacheFile = chemfigRenderCacheFile(project.path, first.renderKey)

    await fs.writeFile(
      cacheFile,
      `${JSON.stringify({
        ...first,
        sourceHash: "0".repeat(64),
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="corrupt"/></svg>',
        renderedAt: "2000-01-01T00:00:00.000Z",
      })}\n`,
      "utf8",
    )
    const identityHealed = await renderChemfig({ directory: project.path, source })
    expect(identityHealed.sourceHash).toBe(first.sourceHash)
    expect(identityHealed.svg).not.toContain("corrupt")
    expect(identityHealed.renderedAt).not.toBe("2000-01-01T00:00:00.000Z")

    await fs.writeFile(cacheFile, "{not-json", "utf8")
    const jsonHealed = await renderChemfig({ directory: project.path, source })
    expect(jsonHealed.sourceHash).toBe(first.sourceHash)
    expect(JSON.parse(await fs.readFile(cacheFile, "utf8"))).toMatchObject({
      renderKey: first.renderKey,
      sourceHash: first.sourceHash,
    })

    await fs.writeFile(cacheFile, "x".repeat(CHEMFIG_RENDER_CACHE_MAX_ENTRY_BYTES + 1), "utf8")
    const oversizedEntryHealed = await renderChemfig({ directory: project.path, source })
    expect(oversizedEntryHealed.sourceHash).toBe(first.sourceHash)
    expect((await fs.stat(cacheFile)).size).toBeLessThan(CHEMFIG_RENDER_CACHE_MAX_ENTRY_BYTES)
  }, 20_000)

  test("evicts a directory cache deterministically by entry count and bytes", async () => {
    await using project = await tmpdir({ git: true })
    const cacheDirectory = chemfigRenderCacheDirectory(project.path)
    await fs.mkdir(cacheDirectory, { recursive: true })
    const filenames = ["0", "1", "2"].map((digit) => `${digit.repeat(64)}.json`)
    const commonTime = new Date("2020-01-01T00:00:00.000Z")
    for (const filename of filenames) {
      const filePath = path.join(cacheDirectory, filename)
      await fs.writeFile(filePath, "0123456789", "utf8")
      await fs.utimes(filePath, commonTime, commonTime)
    }

    await enforceChemfigCacheLimits(project.path, {
      maxEntries: 2,
      maxBytes: LARGE_CACHE_LIMIT,
    })
    expect((await fs.readdir(cacheDirectory)).toSorted()).toEqual(filenames.slice(1))

    await enforceChemfigCacheLimits(project.path, {
      maxEntries: 2,
      maxBytes: 10,
    })
    expect(await fs.readdir(cacheDirectory)).toEqual([filenames[2]])
  })

  test("expires queued work from its enqueue deadline without invoking it", async () => {
    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const firstController = new AbortController()
    const first = runInSerializedRenderQueue({
      deadlineAt: Date.now() + CHEMFIG_RENDER_TIMEOUT_MS,
      signal: firstController.signal,
      operation: async () => firstGate,
    })
    await Bun.sleep(10)

    let secondInvoked = false
    const secondController = new AbortController()
    const second = runInSerializedRenderQueue({
      deadlineAt: Date.now() + 10,
      signal: secondController.signal,
      operation: async () => {
        secondInvoked = true
      },
    })
    await Bun.sleep(25)
    releaseFirst?.()

    await first
    await expect(second).rejects.toMatchObject({ code: "chemfig_render_timeout" })
    expect(secondInvoked).toBe(false)
  })

  test("keeps a deduplicated render alive while one subscriber remains", async () => {
    await using project = await tmpdir({ git: true })
    const source = String.raw`\chemfig{C(-[2]O)-C}% ref-counted-dedupe`
    const firstController = new AbortController()
    const cancelledSubscriber = renderChemfig({
      directory: project.path,
      source,
      signal: firstController.signal,
    })
    const survivingSubscriber = renderChemfig({ directory: project.path, source })
    firstController.abort()

    await expect(cancelledSubscriber).rejects.toMatchObject({ code: "chemfig_render_failed" })
    const rendered = await survivingSubscriber
    expect(rendered.svg).toStartWith("<svg")
  }, 20_000)

  test("terminates abandoned child work and recovers the serialized queue", async () => {
    await using project = await tmpdir({ git: true })
    const controller = new AbortController()
    const abandoned = renderChemfig({
      directory: project.path,
      source: String.raw`\chemfig{*6(-=-=-=)}% abandoned-child`,
      signal: controller.signal,
    })
    await Bun.sleep(50)
    controller.abort()
    await expect(abandoned).rejects.toMatchObject({ code: "chemfig_render_failed" })

    const recovered = await renderChemfig({
      directory: project.path,
      source: String.raw`\chemfig{C=C}% queue-recovery`,
    })
    expect(recovered.svg).toStartWith("<svg")
  }, 20_000)

  test("does not attach a new subscriber to an abandoned render", async () => {
    await using project = await tmpdir({ git: true })
    const source = String.raw`\chemfig{C(-[2]O)-C}% abandoned-dedupe`
    const controller = new AbortController()
    const abandoned = renderChemfig({ directory: project.path, source, signal: controller.signal })
    controller.abort()
    await expect(abandoned).rejects.toMatchObject({ code: "chemfig_render_failed" })

    const recovered = await renderChemfig({ directory: project.path, source })
    expect(recovered.svg).toStartWith("<svg")
  }, 20_000)
})
