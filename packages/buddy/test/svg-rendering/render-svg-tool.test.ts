import { createHash } from "node:crypto"
import fsp from "node:fs/promises"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { browserSvgRenderRequests } from "../../src/learning/features/svg-rendering/service/browser-render-requests"
import {
  createSvgAutoRepairRequest,
  enforceSvgAutoRepairRecordLimits,
  exhaustSvgAutoRepairRequest,
  readSvgAutoRepairRequest,
  settleSvgAutoRepairTurn,
  svgAutoRepairScratchFile,
} from "../../src/learning/features/svg-rendering/service/auto-repair"
import { sha256Text } from "../../src/learning/features/svg-rendering/service/render-source"
import { renderSvgTool } from "../../src/learning/features/svg-rendering/tools/render-svg"
import type { BuddyToolContext } from "../../src/learning/runtime/create-buddy-tool"
import { resolveDirectory } from "../../src/project"
import { tmpdir } from "../helpers/tmpdir"
import { createBuddyToolContext } from "../helpers/tools"

const SOURCE = "CCO"
const SOURCE_HASH = createHash("sha256").update(SOURCE).digest("hex")
const SAFE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1"/></svg>'

afterEach(() => {
  browserSvgRenderRequests.reset()
})

async function nextPendingRequest(directory: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const request = browserSvgRenderRequests.listPending(directory)[0]
    if (request) return request
    await Bun.sleep(1)
  }
  throw new Error("Expected a pending browser SVG render request.")
}

describe("render_svg tool", () => {
  test("exposes the generic strict filePath, format, and source contract", () => {
    expect(renderSvgTool.jsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["filePath", "format", "source"],
      properties: {
        filePath: { type: "string" },
        format: {
          type: "string",
          enum: ["smiles", "cxsmiles", "reaction-smiles", "ket", "chemfig"],
        },
        source: { type: "string" },
      },
    })
    expect(renderSvgTool.description).toStartWith(
      "Render a supported textual source format into a standalone SVG file.",
    )
  })

  test("renders through the browser owner and writes only after exact-path permission", async () => {
    await using project = await tmpdir({ git: true })
    const filePath = path.join(project.path, "worksheet-assets", "ethanol.svg")
    const permissionRequests: Parameters<BuddyToolContext["ask"]>[0][] = []
    const context = createBuddyToolContext({
      directory: project.path,
      sessionID: "ses_render_svg",
      messageID: "msg_render_svg",
      agent: "buddy",
    })
    context.ask = async (input) => {
      permissionRequests.push(input)
    }

    const resultPromise = renderSvgTool.run(
      {
        filePath,
        format: "smiles",
        source: SOURCE,
      },
      context,
    )
    const request = await nextPendingRequest(project.path)
    expect(request).toMatchObject({
      directory: resolveDirectory(project.path),
      format: "smiles",
      source: SOURCE,
      sourceHash: SOURCE_HASH,
    })
    expect(request).not.toHaveProperty("filePath")

    expect(
      browserSvgRenderRequests.complete({
        directory: project.path,
        requestID: request.requestID,
        completion: {
          outcome: "rendered",
          sourceHash: SOURCE_HASH,
          svg: SAFE_SVG,
          warnings: ["One unspecified stereocenter."],
        },
      }),
    ).toEqual({ status: "completed" })

    const result = await resultPromise
    expect(permissionRequests).toEqual([
      {
        permission: "edit",
        patterns: [filePath],
        always: [filePath],
        metadata: {
          filePath,
          format: "smiles",
        },
      },
    ])
    expect(result.output).toBe(
      `Rendered SVG to ${filePath}.\nWarning: One unspecified stereocenter.`,
    )
    expect(result.output).not.toContain("<svg")
    expect(result.output).not.toContain(SOURCE_HASH)
    expect(await fsp.readFile(filePath, "utf8")).toStartWith("<svg")
  })

  test("preserves an existing file when the browser returns invalid SVG", async () => {
    await using project = await tmpdir({ git: true })
    const filePath = path.join(project.path, "existing.svg")
    const original = "existing file contents"
    await fsp.writeFile(filePath, original, "utf8")
    const context = createBuddyToolContext({
      directory: project.path,
      sessionID: "ses_render_svg_invalid",
      messageID: "msg_render_svg_invalid",
      agent: "buddy",
    })

    const resultPromise = renderSvgTool.run(
      {
        filePath,
        format: "smiles",
        source: SOURCE,
      },
      context,
    )
    const request = await nextPendingRequest(project.path)
    browserSvgRenderRequests.complete({
      directory: project.path,
      requestID: request.requestID,
      completion: {
        outcome: "rendered",
        sourceHash: SOURCE_HASH,
        svg: "not an svg",
        warnings: [],
      },
    })

    await expect(resultPromise).rejects.toThrow()
    expect(await fsp.readFile(filePath, "utf8")).toBe(original)
  })

  test("preserves a concurrent file change made while rendering", async () => {
    await using project = await tmpdir({ git: true })
    const filePath = path.join(project.path, "concurrent.svg")
    await fsp.writeFile(filePath, "original", "utf8")
    const resultPromise = renderSvgTool.run(
      {
        filePath,
        format: "smiles",
        source: SOURCE,
      },
      createBuddyToolContext({
        directory: project.path,
        sessionID: "ses_render_svg_concurrent_write",
        messageID: "msg_render_svg_concurrent_write",
        agent: "buddy",
      }),
    )
    const request = await nextPendingRequest(project.path)
    await fsp.writeFile(filePath, "concurrent change", "utf8")
    browserSvgRenderRequests.complete({
      directory: project.path,
      requestID: request.requestID,
      completion: {
        outcome: "rendered",
        sourceHash: SOURCE_HASH,
        svg: SAFE_SVG,
        warnings: [],
      },
    })

    await expect(resultPromise).rejects.toThrow("changed while the replacement was being rendered")
    expect(await fsp.readFile(filePath, "utf8")).toBe("concurrent change")
  })

  test("keeps Chemfig on its backend owner without creating a browser request", async () => {
    await using project = await tmpdir({ git: true })
    const filePath = path.join(project.path, "benzene.svg")
    const result = await renderSvgTool.run(
      {
        filePath,
        format: "chemfig",
        source: String.raw`\chemfig{*6(-=-=-=)}`,
      },
      createBuddyToolContext({
        directory: project.path,
        sessionID: "ses_render_svg_chemfig",
        messageID: "msg_render_svg_chemfig",
        agent: "buddy",
      }),
    )

    expect(browserSvgRenderRequests.listPending(project.path)).toEqual([])
    expect(result.output).toBe(`Rendered SVG to ${filePath}.`)
    expect(await fsp.readFile(filePath, "utf8")).toStartWith("<svg")
  }, 20_000)

  test("requires an absolute SVG destination", async () => {
    const context = createBuddyToolContext({
      directory: "/tmp",
      agent: "buddy",
    })
    await expect(
      renderSvgTool.run(
        {
          filePath: "relative.svg",
          format: "smiles",
          source: SOURCE,
        },
        context,
      ),
    ).rejects.toThrow("filePath must be an absolute path")
    await expect(
      renderSvgTool.run(
        {
          filePath: "/tmp/not-svg.png",
          format: "smiles",
          source: SOURCE,
        },
        context,
      ),
    ).rejects.toThrow("filePath must end in .svg")
  })

  test("reuses the unchanged render_svg contract for a bounded repair turn", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = "ses_svg_auto_repair"
    const request = await createSvgAutoRepairRequest({
      directory: project.path,
      sessionID,
      assistantMessageID: "msg_failed_chemistry",
      partID: "prt_failed_chemistry",
      segmentIndex: 1,
      format: "smiles",
      source: "invalid original",
      sourceHash: sha256Text("invalid original"),
    })
    const filePath = svgAutoRepairScratchFile(project.path, request.request.repairRequestID)
    const permissionRequests: Parameters<BuddyToolContext["ask"]>[0][] = []
    const context = createBuddyToolContext({
      directory: project.path,
      sessionID,
      messageID: request.request.repairRequestID,
      agent: "buddy",
    })
    context.ask = async (input) => {
      permissionRequests.push(input)
    }

    const resultPromise = renderSvgTool.run(
      {
        filePath,
        format: "smiles",
        source: SOURCE,
      },
      context,
    )
    const browserRequest = await nextPendingRequest(project.path)
    browserSvgRenderRequests.complete({
      directory: project.path,
      requestID: browserRequest.requestID,
      completion: {
        outcome: "rendered",
        sourceHash: SOURCE_HASH,
        svg: SAFE_SVG,
        warnings: [],
      },
    })

    const result = await resultPromise
    expect(result.output).toBe(`Rendered SVG to ${filePath}.`)
    expect(permissionRequests).toEqual([])
    expect(
      await readSvgAutoRepairRequest(project.path, request.request.repairRequestID),
    ).toMatchObject({
      status: "validated",
      renderAttempts: 1,
      validatedSourceHash: SOURCE_HASH,
    })
    expect(
      await readSvgAutoRepairRequest(project.path, request.request.repairRequestID),
    ).not.toHaveProperty("source")
  })

  test("refuses a repair scratch path redirected by a symbolic link", async () => {
    await using project = await tmpdir({ git: true })
    await using outside = await tmpdir()
    const sessionID = "ses_svg_auto_repair_symlink"
    const request = await createSvgAutoRepairRequest({
      directory: project.path,
      sessionID,
      assistantMessageID: "msg_failed_symlink",
      partID: "prt_failed_symlink",
      segmentIndex: 0,
      format: "smiles",
      source: "broken",
      sourceHash: sha256Text("broken"),
    })
    const filePath = svgAutoRepairScratchFile(project.path, request.request.repairRequestID)
    const outsidePath = path.join(outside.path, "outside-repair-target.svg")
    await fsp.writeFile(outsidePath, "outside content", "utf8")
    await fsp.symlink(outsidePath, filePath)

    await expect(
      renderSvgTool.run(
        { filePath, format: "smiles", source: SOURCE },
        createBuddyToolContext({
          directory: project.path,
          sessionID,
          messageID: request.request.repairRequestID,
          agent: "buddy",
        }),
      ),
    ).rejects.toThrow("redirected by a symbolic link")
    expect(await fsp.readFile(outsidePath, "utf8")).toBe("outside content")
    expect(
      await readSvgAutoRepairRequest(project.path, request.request.repairRequestID),
    ).toMatchObject({ status: "running", renderAttempts: 0 })
  })

  test("serializes repair renders so concurrent calls cannot overwrite terminal state", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = "ses_svg_auto_repair_concurrent"
    const request = await createSvgAutoRepairRequest({
      directory: project.path,
      sessionID,
      assistantMessageID: "msg_failed_concurrent",
      partID: "prt_failed_concurrent",
      segmentIndex: 0,
      format: "smiles",
      source: "broken",
      sourceHash: sha256Text("broken"),
    })
    const filePath = svgAutoRepairScratchFile(project.path, request.request.repairRequestID)
    const context = createBuddyToolContext({
      directory: project.path,
      sessionID,
      messageID: request.request.repairRequestID,
      agent: "buddy",
    })

    const firstResult = renderSvgTool.run({ filePath, format: "smiles", source: SOURCE }, context)
    const browserRequest = await nextPendingRequest(project.path)
    await expect(
      renderSvgTool.run({ filePath, format: "smiles", source: "CCC" }, context),
    ).rejects.toThrow("already evaluating this repair request")
    expect(browserSvgRenderRequests.listPending(project.path)).toHaveLength(1)

    browserSvgRenderRequests.complete({
      directory: project.path,
      requestID: browserRequest.requestID,
      completion: {
        outcome: "rendered",
        sourceHash: SOURCE_HASH,
        svg: SAFE_SVG,
        warnings: [],
      },
    })
    await firstResult
    expect(
      await readSvgAutoRepairRequest(project.path, request.request.repairRequestID),
    ).toMatchObject({
      status: "validated",
      renderAttempts: 1,
      validatedSourceHash: SOURCE_HASH,
    })
  })

  test("lets an in-flight render succeed after the repair turn settles", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = "ses_svg_auto_repair_settled_success"
    const request = await createSvgAutoRepairRequest({
      directory: project.path,
      sessionID,
      assistantMessageID: "msg_failed_settled_success",
      partID: "prt_failed_settled_success",
      segmentIndex: 0,
      format: "smiles",
      source: "broken",
      sourceHash: sha256Text("broken"),
    })
    const requestID = request.request.repairRequestID
    const filePath = svgAutoRepairScratchFile(project.path, requestID)
    const resultPromise = renderSvgTool.run(
      { filePath, format: "smiles", source: SOURCE },
      createBuddyToolContext({
        directory: project.path,
        sessionID,
        messageID: requestID,
        agent: "buddy",
      }),
    )
    const browserRequest = await nextPendingRequest(project.path)

    await settleSvgAutoRepairTurn({
      directory: project.path,
      requestID,
      errorMessage: "Repair turn settled.",
    })
    expect(await readSvgAutoRepairRequest(project.path, requestID)).toMatchObject({
      status: "running",
      turnSettled: true,
    })

    browserSvgRenderRequests.complete({
      directory: project.path,
      requestID: browserRequest.requestID,
      completion: {
        outcome: "rendered",
        sourceHash: SOURCE_HASH,
        svg: SAFE_SVG,
        warnings: [],
      },
    })

    await resultPromise
    const completed = await readSvgAutoRepairRequest(project.path, requestID)
    expect(completed).toMatchObject({
      status: "validated",
      renderAttempts: 1,
      validatedSourceHash: SOURCE_HASH,
    })
    expect(completed.turnSettled).toBeUndefined()
  })

  test("exhausts a failed in-flight render after the repair turn settles", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = "ses_svg_auto_repair_settled_failure"
    const request = await createSvgAutoRepairRequest({
      directory: project.path,
      sessionID,
      assistantMessageID: "msg_failed_settled_failure",
      partID: "prt_failed_settled_failure",
      segmentIndex: 0,
      format: "smiles",
      source: "broken",
      sourceHash: sha256Text("broken"),
    })
    const requestID = request.request.repairRequestID
    const filePath = svgAutoRepairScratchFile(project.path, requestID)
    const resultPromise = renderSvgTool.run(
      { filePath, format: "smiles", source: "still broken" },
      createBuddyToolContext({
        directory: project.path,
        sessionID,
        messageID: requestID,
        agent: "buddy",
      }),
    )
    const browserRequest = await nextPendingRequest(project.path)

    await settleSvgAutoRepairTurn({
      directory: project.path,
      requestID,
      errorMessage: "Repair turn settled.",
    })
    browserSvgRenderRequests.complete({
      directory: project.path,
      requestID: browserRequest.requestID,
      completion: {
        outcome: "failed",
        sourceHash: sha256Text("still broken"),
        error: "parse failure",
      },
    })

    await expect(resultPromise).rejects.toThrow("No render attempts remain")
    expect(await readSvgAutoRepairRequest(project.path, requestID)).toMatchObject({
      status: "exhausted",
      renderAttempts: 1,
      lastErrorMessage: "Browser SVG rendering failed: parse failure",
    })
    expect(await readSvgAutoRepairRequest(project.path, requestID)).not.toHaveProperty("source")
  })

  test("hard-stops the fifth render_svg call in one repair turn", async () => {
    await using project = await tmpdir({ git: true })
    const sessionID = "ses_svg_auto_repair_limit"
    const request = await createSvgAutoRepairRequest({
      directory: project.path,
      sessionID,
      assistantMessageID: "msg_failed_limit",
      partID: "prt_failed_limit",
      segmentIndex: 0,
      format: "smiles",
      source: "broken",
      sourceHash: sha256Text("broken"),
    })
    const filePath = svgAutoRepairScratchFile(project.path, request.request.repairRequestID)
    const context = createBuddyToolContext({
      directory: project.path,
      sessionID,
      messageID: request.request.repairRequestID,
      agent: "buddy",
    })

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const resultPromise = renderSvgTool.run(
        {
          filePath,
          format: "smiles",
          source: `invalid-${attempt}`,
        },
        context,
      )
      const browserRequest = await nextPendingRequest(project.path)
      browserSvgRenderRequests.complete({
        directory: project.path,
        requestID: browserRequest.requestID,
        completion: {
          outcome: "failed",
          sourceHash: sha256Text(`invalid-${attempt}`),
          error: `parse failure ${attempt}`,
        },
      })
      await expect(resultPromise).rejects.toThrow(`attempt ${attempt} of 4 failed`)
    }

    await expect(
      renderSvgTool.run(
        {
          filePath,
          format: "smiles",
          source: "invalid-5",
        },
        context,
      ),
    ).rejects.toThrow("used all 4 render attempts")
    expect(browserSvgRenderRequests.listPending(project.path)).toEqual([])
    expect(
      await readSvgAutoRepairRequest(project.path, request.request.repairRequestID),
    ).toMatchObject({
      status: "exhausted",
      renderAttempts: 4,
      lastErrorMessage: "Browser SVG rendering failed: parse failure 4",
    })
    expect(
      await readSvgAutoRepairRequest(project.path, request.request.repairRequestID),
    ).not.toHaveProperty("source")
  })

  test("prunes the oldest terminal repair records without deleting running work", async () => {
    await using project = await tmpdir({ git: true })
    const requests = await Promise.all(
      ["first", "second"].map(async (partID, segmentIndex) => {
        const created = await createSvgAutoRepairRequest({
          directory: project.path,
          sessionID: "ses_svg_auto_repair_retention",
          assistantMessageID: "msg_failed_retention",
          partID,
          segmentIndex,
          format: "smiles",
          source: `broken-${partID}`,
          sourceHash: sha256Text(`broken-${partID}`),
        })
        await exhaustSvgAutoRepairRequest({
          directory: project.path,
          requestID: created.request.repairRequestID,
          errorMessage: "Repair turn ended.",
        })
        return created.request.repairRequestID
      }),
    )
    const running = await createSvgAutoRepairRequest({
      directory: project.path,
      sessionID: "ses_svg_auto_repair_retention",
      assistantMessageID: "msg_failed_retention",
      partID: "running",
      segmentIndex: 2,
      format: "smiles",
      source: "broken-running",
      sourceHash: sha256Text("broken-running"),
    })

    await enforceSvgAutoRepairRecordLimits(project.path, {
      maxEntries: 2,
      maxBytes: Number.MAX_SAFE_INTEGER,
    })

    const retainedTerminalRequests = await Promise.allSettled(
      requests.map((requestID) => readSvgAutoRepairRequest(project.path, requestID)),
    )
    expect(retainedTerminalRequests.filter((result) => result.status === "fulfilled")).toHaveLength(
      1,
    )
    expect(
      await readSvgAutoRepairRequest(project.path, running.request.repairRequestID),
    ).toMatchObject({ status: "running", source: "broken-running" })
  })
})
