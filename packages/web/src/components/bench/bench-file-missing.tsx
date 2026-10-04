import { TriangleAlertIcon } from "@/icons/app-icons"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
import { BenchSurfaceViewer } from "@/components/bench/bench-viewer-shell"
import { fileNameFromPath } from "@/lib/workspace-file-paths"

const MISSING_FILE_CONTEXT_METADATA = ["surface_status: unavailable", "exists: false"]
const MISSING_FILE_CONTEXT_HINTS = [
  "The file may have been moved or renamed. Search the notebook before assuming it still exists.",
]

export function BenchFileMissing(props: { path: string }) {
  return (
    <div
      data-component="bench-file-missing"
      className="flex h-full min-h-0 items-center justify-center p-6"
    >
      <div className="max-w-md rounded-2xl border border-border-base bg-surface-base px-5 py-4 text-center shadow-sm">
        <TriangleAlertIcon className="mx-auto mb-3 size-5 text-icon-warning-base" aria-hidden />
        <h2 className="text-sm font-medium text-text-base">File deleted or moved</h2>
        <p className="mt-2 text-sm text-text-weak">{props.path} no longer exists on disk.</p>
      </div>
    </div>
  )
}

export function BenchFileMissingSurface(props: { path: string }) {
  return (
    <BenchStaticContextProvider
      status="unavailable"
      metadata={MISSING_FILE_CONTEXT_METADATA}
      content={`The file at ${props.path} was deleted or moved. No verified file content is available.`}
      hints={MISSING_FILE_CONTEXT_HINTS}
    >
      <BenchSurfaceViewer title={fileNameFromPath(props.path) || props.path} subtitle={props.path}>
        <BenchFileMissing path={props.path} />
      </BenchSurfaceViewer>
    </BenchStaticContextProvider>
  )
}
