import { ToolCardWithDetails, ToolOutputPanel, ApplyPatchFileItem } from "../shared/tool-card"
import { isRecord, unwrapError } from "../shared/utils"
import type { ToolPartProps, ApplyPatchFile } from "./registry"

export function ApplyPatchTool({ part: _part, state, info, defaultOpen }: ToolPartProps) {
  const running = state.status === "pending" || state.status === "running"
  const showOutput =
    (state.output || (state.error ? unwrapError(state.error) : "")).trim().length > 0
  const output = state.output || (state.error ? unwrapError(state.error) : "")

  const applyPatchFiles: ApplyPatchFile[] = []
  const files = state.metadata.files
  if (Array.isArray(files)) {
    for (const entry of files) {
      if (!isRecord(entry)) continue
      if (typeof entry.filePath !== "string") continue
      if (typeof entry.relativePath !== "string") continue
      if (
        entry.type !== "add" &&
        entry.type !== "update" &&
        entry.type !== "delete" &&
        entry.type !== "move"
      )
        continue

      applyPatchFiles.push({
        filePath: entry.filePath,
        relativePath: entry.relativePath,
        type: entry.type,
        before: typeof entry.before === "string" ? entry.before : "",
        after: typeof entry.after === "string" ? entry.after : "",
        additions: typeof entry.additions === "number" ? entry.additions : 0,
        deletions: typeof entry.deletions === "number" ? entry.deletions : 0,
        movePath: typeof entry.movePath === "string" ? entry.movePath : undefined,
      })
    }
  }

  const patchedInfo = {
    ...info,
    subtitle:
      applyPatchFiles.length > 0
        ? `${applyPatchFiles.length} ${applyPatchFiles.length === 1 ? "file" : "files"}`
        : info.subtitle,
  }

  return (
    <ToolCardWithDetails
      info={patchedInfo}
      status={state.status}
      running={running}
      defaultOpen={defaultOpen}
    >
      <div>
        {applyPatchFiles.length > 0 ? (
          <div className="space-y-2">
            {applyPatchFiles.map((file) => (
              <ApplyPatchFileItem
                key={file.filePath}
                file={{
                  relativePath: file.relativePath,
                  type: file.type,
                  before: file.before,
                  after: file.after,
                  additions: file.additions,
                  deletions: file.deletions,
                }}
              />
            ))}
          </div>
        ) : null}
        {showOutput ? (
          <ToolOutputPanel output={output} status={state.status} copyLabel="Copy output" />
        ) : null}
      </div>
    </ToolCardWithDetails>
  )
}
