import { BasicTool } from "../../tools/basic-tool"
import { ToolOutputPanel } from "../../tools/tool-output-panel"
import { ApplyPatchFileItem } from "./apply-patch-item"
import { language } from "@/context/language"
import { isRecord } from "../../tools/types"
import type { ToolPartProps } from "../registry"
interface ApplyPatchFile {
  filePath: string
  relativePath: string
  type: "add" | "update" | "delete" | "move"
  before: string
  after: string
  additions: number
  deletions: number
  movePath?: string
}

export function renderApplyPatchTool({ state, defaultOpen }: ToolPartProps) {
  const output = state.output || (state.error ?? "")
  const running = state.status === "pending" || state.status === "running"

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

  const subtitle =
    applyPatchFiles.length > 0
      ? language.t(
          applyPatchFiles.length === 1 ? "chatTools.fileCount.one" : "chatTools.fileCount.other",
          { count: applyPatchFiles.length },
        )
      : undefined
  const runningMessage =
    state.status === "pending"
      ? language.t("chatTools.applyPatch.pending")
      : state.status === "running"
        ? language.t("chatTools.applyPatch.running")
        : undefined
  const visibleOutput = output.trim().length > 0 ? output : (runningMessage ?? "")
  const showOutput = visibleOutput.trim().length > 0

  return (
    <BasicTool
      trigger={{
        title: language.t("chatTools.applyPatch"),
        subtitle,
        trailing: runningMessage ? (
          <span className="ml-1 min-w-0 truncate text-xs animate-pulse text-text-weak/50">
            {runningMessage}
          </span>
        ) : undefined,
      }}
      status={state.status}
      defaultOpen={defaultOpen}
      hideDetails={running}
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
          <ToolOutputPanel
            output={visibleOutput}
            status={state.status}
            copyLabel={language.t("chatTools.copyOutput")}
          />
        ) : null}
      </div>
    </BasicTool>
  )
}
