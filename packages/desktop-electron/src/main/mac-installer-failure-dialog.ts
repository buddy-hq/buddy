import type { MacInstallerResult } from "./custom-mac-updater"

export const MAC_INSTALLER_FAILURE_BUTTONS = ["Continue to Buddy", "Open Diagnostic Log"] as const

export const MAC_INSTALLER_FAILURE_TITLE = "Buddy Is Ready to Continue"
export const MAC_INSTALLER_FAILURE_MESSAGE =
  "Buddy reopened after the previous update attempt reported a problem."

export function macInstallerFailureDetail(result: MacInstallerResult, logPath: string): string {
  const exitCode =
    result.exitCode === undefined ? "" : `\n\nInstaller exit code: ${result.exitCode}`
  return `You can continue working normally while Buddy checks for another available update.${exitCode}\n\nDiagnostic log: ${logPath}`
}
