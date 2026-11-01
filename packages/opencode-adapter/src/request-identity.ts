import { SessionID } from "@opencode/schema/session-id"
import openCodeSdkPackage from "../../../vendor/opencode/packages/sdk/package.json"

export function createFreeModelControlIdentity(existingSessionID?: string) {
  return {
    sessionID: existingSessionID ?? SessionID.create(),
    userAgent: `opencode/latest/${openCodeSdkPackage.version}/buddy`,
  }
}
