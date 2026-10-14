import { UPDATE_DISTRIBUTION } from "./update-common"
import type { MacInstallerResult } from "./custom-mac-updater"

const productName = UPDATE_DISTRIBUTION.productName

export const MAC_INSTALLER_FAILURE_BUTTONS = [`Continue to ${productName}`, "Open Diagnostic Log"] as const

export const MAC_INSTALLER_FAILURE_TITLE = `${productName} Is Ready to Continue`
export const MAC_INSTALLER_FAILURE_MESSAGE =
  `${productName} reopened after the previous update attempt reported a problem.`

export function macInstallerFailureDetail(result: MacInstallerResult, logPath: string): string {
  const exitCode =
    result.exitCode === undefined ? "" : `\n\nInstaller exit code: ${result.exitCode}`
  return `You can continue working normally while ${productName} checks for another available update.${exitCode}\n\nDiagnostic log: ${logPath}`
}
