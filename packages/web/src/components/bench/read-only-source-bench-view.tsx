import Editor from "@monaco-editor/react"
import type { ReactNode } from "react"
import type { BenchViewerAction } from "@/components/bench/bench-viewer-shell"
import { BenchSurfaceViewer } from "@/components/bench/bench-viewer-shell"
import { BenchMediaMessage } from "@/components/bench/bench-media-preview"
import { BenchSurfacePending } from "@/components/bench/bench-surface-pending"
import { monacoLanguageForWorkspacePath } from "@/lib/workspace-file-content"
import { useTheme } from "@/theme"

type ReadOnlySourceBenchViewProps = {
  title: string
  path: string
  content: string | undefined
  error: string | undefined
  loading: boolean
  actions?: BenchViewerAction[]
  banner?: ReactNode
}

export function ReadOnlySourceBenchView(props: ReadOnlySourceBenchViewProps) {
  const { mode: colorMode } = useTheme()

  return (
    <BenchSurfaceViewer
      title={props.title}
      subtitle={props.path}
      actions={props.actions}
      controlsPlacement="dock"
      hideHeader
    >
      {props.loading ? (
        <BenchSurfacePending />
      ) : props.error ? (
        <BenchMediaMessage title="File could not be opened" className="text-icon-critical-base">
          {props.error}
        </BenchMediaMessage>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {props.banner}
          <div className="min-h-0 flex-1 overflow-hidden bg-background-base">
            <Editor
              height="100%"
              path={props.path}
              language={monacoLanguageForWorkspacePath(props.path)}
              theme={colorMode === "dark" ? "vs-dark" : "light"}
              value={props.content ?? ""}
              options={{
                automaticLayout: true,
                domReadOnly: true,
                fontSize: 13,
                lineNumbers: "on",
                minimap: { enabled: false },
                readOnly: true,
                scrollBeyondLastLine: false,
                wordWrap: "off",
              }}
            />
          </div>
        </div>
      )}
    </BenchSurfaceViewer>
  )
}
