import { describe, expect, test } from "bun:test"
import {
  MAC_INSTALLER_FAILURE_BUTTONS,
  MAC_INSTALLER_FAILURE_MESSAGE,
  MAC_INSTALLER_FAILURE_TITLE,
  macInstallerFailureDetail,
} from "../src/main/mac-installer-failure-dialog"

const INSTALLER_FAILURE_EXIT_CODE = 1
const INSTALLER_LOG_PATH = "/Users/example/Library/Logs/Buddy/update-installer.log"

describe("mac installer failure dialog", () => {
  test("explains that Buddy remains usable without claiming which version reopened", () => {
    expect(MAC_INSTALLER_FAILURE_TITLE).toBe("Buddy Is Ready to Continue")
    expect(MAC_INSTALLER_FAILURE_MESSAGE).toContain("update attempt reported a problem")
    expect(MAC_INSTALLER_FAILURE_MESSAGE).not.toContain("previous working version")
    expect(MAC_INSTALLER_FAILURE_BUTTONS[0]).toBe("Continue to Buddy")

    const detail = macInstallerFailureDetail(
      { exitCode: INSTALLER_FAILURE_EXIT_CODE, status: "failed" },
      INSTALLER_LOG_PATH,
    )
    expect(detail).toContain("continue working normally")
    expect(detail).not.toContain("were not changed")
    expect(detail).toContain(`Installer exit code: ${INSTALLER_FAILURE_EXIT_CODE}`)
    expect(detail).toContain(`Diagnostic log: ${INSTALLER_LOG_PATH}`)
  })
})
