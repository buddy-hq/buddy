import { RuntimeError } from "@buddy/agent-runtime/errors"
import type { SessionClient } from "./client"

const PAGE_SIZE = 200
const ABSOLUTE_SNAPSHOT_PATH = /^(?:\/|\\\\|[A-Za-z]:[\\/])/u

export const IMPORTED_UNDO_UNAVAILABLE_MESSAGE =
  "Undo isn't available for turns brought over from the previous version."

export function isImportedSnapshotPath(file: string): boolean {
  return ABSOLUTE_SNAPSHOT_PATH.test(file)
}

function after(messageID: string) {
  return Buffer.from(JSON.stringify({ id: messageID, order: "asc", direction: "next" })).toString(
    "base64url",
  )
}

export async function revertTouchesImportedTurn(
  client: Pick<SessionClient, "session" | "message">,
  sessionID: string,
  messageID: string,
): Promise<boolean> {
  const target = await client.session.message.get({ sessionID, messageID })
  if (target.type === "assistant" && target.snapshot?.files?.some(isImportedSnapshotPath))
    return true
  let anchor = messageID
  while (true) {
    const page = await client.message.list({
      sessionID,
      type: "assistant",
      limit: PAGE_SIZE,
      cursor: after(anchor),
    })
    for (const message of page.data) {
      if (message.type === "assistant" && message.snapshot?.files?.some(isImportedSnapshotPath))
        return true
    }
    const last = page.data.at(-1)
    if (!last || page.data.length < PAGE_SIZE) return false
    anchor = last.id
  }
}

export async function refuseImportedTurnRevert(
  client: Pick<SessionClient, "session" | "message">,
  sessionID: string,
  messageID: string,
) {
  if (await revertTouchesImportedTurn(client, sessionID, messageID)) {
    throw new RuntimeError("conflict", IMPORTED_UNDO_UNAVAILABLE_MESSAGE, { subject: "session" })
  }
}
