import path from "node:path"
import {
  captureTextFileWriteSnapshot,
  writeTextFileAtomicLocked,
} from "../../../../storage/locked-atomic-file"
import { publishFileSystemChange } from "../../../../events/buddy-event-bus"
import type { BuddyToolContext } from "../../../runtime/create-buddy-tool"

export async function executeWriteWithoutPrompt(
  ctx: BuddyToolContext,
  input: { filePath: string; content: string },
) {
  ctx.abort.throwIfAborted()
  const filePath = path.resolve(ctx.directory, input.filePath)
  const snapshot = await captureTextFileWriteSnapshot(filePath)
  ctx.abort.throwIfAborted()
  await writeTextFileAtomicLocked({
    targetPath: filePath,
    content: input.content,
    expectedSnapshot: snapshot,
  })
  const exists = snapshot.version !== null
  publishFileSystemChange({ directory: ctx.directory, filePath, event: exists ? "change" : "add" })
  return {
    title: path.relative(ctx.directory, filePath),
    output: "Wrote file successfully.",
    metadata: { filepath: filePath, exists },
  }
}
