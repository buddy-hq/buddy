import type { QueryClient } from "@tanstack/react-query"
import {
  installStandardsRuntime,
  loadStandardsRuntimeStatus,
  type StandardsRuntimeStatus,
} from "@/state/standards-runtime"
import { localRuntimeQueryKeys } from "@/state/local-runtime-query"
import type { PrimaryUse } from "@/state/project-config-readers"

let teacherStandardsInstall: Promise<StandardsRuntimeStatus | undefined> | undefined

export function shouldAutoSetupTeacherStandards(input: {
  preferencesHydrated: boolean
  primaryUse: PrimaryUse | undefined
  setupComplete: boolean
}): boolean {
  return input.preferencesHydrated && input.primaryUse === "teach" && !input.setupComplete
}

export function teacherStandardsNeedInstall(status: StandardsRuntimeStatus): boolean {
  if (status.state === "removing") return false
  return !status.enabled || status.state === "not_installed" || status.state === "error"
}

async function installTeacherStandards(queryClient: QueryClient): Promise<StandardsRuntimeStatus> {
  const currentStatus = await loadStandardsRuntimeStatus()
  const nextStatus = teacherStandardsNeedInstall(currentStatus)
    ? await installStandardsRuntime()
    : currentStatus

  queryClient.setQueryData(localRuntimeQueryKeys.standardsStatus(), nextStatus)
  return nextStatus
}

export async function ensureTeacherStandards(input: {
  platform: "desktop" | "web"
  queryClient: QueryClient
}): Promise<StandardsRuntimeStatus | undefined> {
  if (input.platform !== "desktop") return undefined
  if (teacherStandardsInstall) return teacherStandardsInstall

  teacherStandardsInstall = installTeacherStandards(input.queryClient)
  try {
    return await teacherStandardsInstall
  } finally {
    teacherStandardsInstall = undefined
  }
}
