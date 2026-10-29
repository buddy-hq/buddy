import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import {
  createSvgAutoRepairRequest,
  exhaustSvgAutoRepairRequest,
  findSvgAutoRepairRequest,
  readSvgAutoRepairRequest,
  svgAutoRepairScratchFile,
} from "../../src/learning/features/svg-rendering/service/auto-repair"
import { sha256Text } from "../../src/learning/features/svg-rendering/service/render-source"
import { tmpdir } from "../helpers/tmpdir"

function repairInput(directory: string) {
  return {
    directory,
    sessionID: "ses_imported_svg",
    assistantMessageID: "msg_imported_svg",
    partID: "prt_01JV1PARTIDFROMV1",
    segmentIndex: 0,
    format: "smiles" as const,
    source: "invalid structure",
    sourceHash: sha256Text("invalid structure"),
  }
}

function recordFile(directory: string, requestID: string) {
  return path.join(path.dirname(svgAutoRepairScratchFile(directory, requestID)), `${requestID}.json`)
}

describe("SVG auto-repair lookup after import", () => {
  test("finds an exhausted v1 record by its projected part ID only when the other fields match", async () => {
    await using project = await tmpdir()
    const input = repairInput(project.path)
    const projected = { ...input, partID: "prt_msg_imported_svg_0_text" }
    expect(await findSvgAutoRepairRequest(projected)).toBeUndefined()
    const { request } = await createSvgAutoRepairRequest(input)
    await exhaustSvgAutoRepairRequest({
      directory: project.path,
      requestID: request.repairRequestID,
      errorMessage: "Repair attempts exhausted.",
    })

    expect(await findSvgAutoRepairRequest(projected)).toMatchObject({
      repairRequestID: request.repairRequestID,
      partID: input.partID,
      status: "exhausted",
    })
    for (const mismatch of [
      { sourceHash: sha256Text("different source") },
      { sessionID: "ses_another_chat" },
      { assistantMessageID: "msg_another_message" },
      { format: "cxsmiles" as const },
    ]) {
      expect(await findSvgAutoRepairRequest({ ...projected, ...mismatch })).toBeUndefined()
    }
  })

  test("prefers the newest fallback while keeping an exact hit first", async () => {
    await using project = await tmpdir()
    const input = repairInput(project.path)
    const older = (await createSvgAutoRepairRequest(input)).request
    const newer = (await createSvgAutoRepairRequest({ ...input, partID: "prt_second_v1_part" })).request
    await fs.utimes(recordFile(project.path, older.repairRequestID), new Date("2020-01-01"), new Date("2020-01-01"))
    await fs.utimes(recordFile(project.path, newer.repairRequestID), new Date("2021-01-01"), new Date("2021-01-01"))

    expect(await findSvgAutoRepairRequest({ ...input, partID: "prt_msg_imported_svg_0_text" })).toMatchObject({
      repairRequestID: newer.repairRequestID,
    })
    expect(await findSvgAutoRepairRequest(input)).toMatchObject({
      repairRequestID: older.repairRequestID,
    })
  })

  test("exhausts a fallback record that was running in another runtime", async () => {
    await using project = await tmpdir()
    const input = repairInput(project.path)
    const { request } = await createSvgAutoRepairRequest(input)
    await fs.writeFile(recordFile(project.path, request.repairRequestID), JSON.stringify({
      ...request,
      runtimeID: randomUUID(),
    }))

    expect(await findSvgAutoRepairRequest({ ...input, partID: "prt_msg_imported_svg_0_text" })).toMatchObject({
      repairRequestID: request.repairRequestID,
      status: "exhausted",
      lastErrorMessage: "Automatic SVG repair was interrupted by a backend restart.",
    })
    expect(await readSvgAutoRepairRequest(project.path, request.repairRequestID)).toMatchObject({
      status: "exhausted",
    })
  })
})
