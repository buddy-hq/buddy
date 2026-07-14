import type { SessionSvgRepairAsyncResponses } from "@buddy/sdk"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import type { ChemistryDiagramRenderState } from "./chemistry-diagram"
import type { ChemistryFormat } from "./formats"

type ChemistryAutoRepairStartResponse = SessionSvgRepairAsyncResponses[200]
const CHEMISTRY_AUTO_REPAIR_REPORT_CACHE_LIMIT = 512

const REPAIRABLE_CHEMISTRY_RENDER_ERROR_CODES = new Set([
  "chemfig_tex_compile_failed",
  "invalid_source",
  "unsafe_source",
])

const pendingRepairReports = new Map<string, Promise<ChemistryAutoRepairStartResponse>>()
const acceptedRepairReports = new Map<string, ChemistryAutoRepairStartResponse>()

function shouldReportChemistryRenderFailure(state: ChemistryDiagramRenderState): boolean {
  return (
    state.status === "error" &&
    typeof state.code === "string" &&
    REPAIRABLE_CHEMISTRY_RENDER_ERROR_CODES.has(state.code)
  )
}

function repairReportKey(input: {
  directory: string
  sessionID: string
  assistantMessageID: string
  partID: string
  segmentIndex: number
  format: ChemistryFormat
}): string {
  return [
    input.directory,
    input.sessionID,
    input.assistantMessageID,
    input.partID,
    String(input.segmentIndex),
    input.format,
  ].join("\u0000")
}

function rememberAcceptedRepairReport(
  key: string,
  response: ChemistryAutoRepairStartResponse,
): void {
  acceptedRepairReports.delete(key)
  acceptedRepairReports.set(key, response)
  while (acceptedRepairReports.size > CHEMISTRY_AUTO_REPAIR_REPORT_CACHE_LIMIT) {
    const oldestKey = acceptedRepairReports.keys().next().value
    if (typeof oldestKey !== "string") return
    acceptedRepairReports.delete(oldestKey)
  }
}

async function reportChemistryRenderFailure(input: {
  directory: string
  sessionID: string
  assistantMessageID: string
  partID: string
  segmentIndex: number
  rawFence: string
  format: ChemistryFormat
  source: string
}): Promise<ChemistryAutoRepairStartResponse> {
  const key = repairReportKey(input)
  const accepted = acceptedRepairReports.get(key)
  if (accepted) return accepted
  const pending = pendingRepairReports.get(key)
  if (pending) return pending

  const request = getBuddyClient(input.directory)
    .session.svgRepairAsync({
      sessionID: input.sessionID,
      assistantMessageID: input.assistantMessageID,
      partID: input.partID,
      segmentIndex: input.segmentIndex,
      rawFence: input.rawFence,
      format: input.format,
      source: input.source,
    })
    .then((result) => requireBuddyData(result))
    .then((result) => {
      rememberAcceptedRepairReport(key, result)
      return result
    })
    .finally(() => {
      pendingRepairReports.delete(key)
    })
  pendingRepairReports.set(key, request)
  return request
}

function resetChemistryAutoRepairReportsForTests(): void {
  pendingRepairReports.clear()
  acceptedRepairReports.clear()
}

export {
  reportChemistryRenderFailure,
  resetChemistryAutoRepairReportsForTests,
  shouldReportChemistryRenderFailure,
}
export type { ChemistryAutoRepairStartResponse }
