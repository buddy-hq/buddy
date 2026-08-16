import { FileBenchSurface } from "@/components/bench/surfaces/file-bench-surface"
import { MarkdownBenchSurface } from "@/components/bench/surfaces/markdown-bench-surface"
import { ObjectBenchSurface } from "@/components/bench/surfaces/object-bench-surface"
import { SessionBenchSurface } from "@/components/bench/surfaces/session-bench-surface"
import type { BenchTabTarget } from "@/lib/bench-navigation"

/**
 * Resolves a Bench target to its surface. Targets, not route matches, are the unit of surface
 * identity, which is what allows a surface to remain mounted while another target is active.
 */
export function BenchSurfaceRenderer(props: {
  directory: string
  target: BenchTabTarget
  onOpenSession?: (sessionID: string) => void
}) {
  if (props.target.type === "session") {
    return (
      <SessionBenchSurface
        directory={props.directory}
        sessionID={props.target.sessionID}
        onOpenSession={props.onOpenSession}
      />
    )
  }
  if (props.target.type === "workspace-file") {
    if (props.target.viewer === "markdown") {
      return (
        <MarkdownBenchSurface
          {...Object.assign(
            {
              directory: props.directory,
              path: props.target.path,
            },
            props.target.fragment ? { fragment: props.target.fragment } : undefined,
          )}
        />
      )
    }
    return (
      <FileBenchSurface
        {...Object.assign(
          {
            directory: props.directory,
            path: props.target.path,
          },
          props.target.fragment ? { fragment: props.target.fragment } : undefined,
        )}
      />
    )
  }

  return (
    <ObjectBenchSurface
      {...Object.assign(
        {
          directory: props.directory,
          kind: props.target.ref.kind,
          objectID: props.target.ref.objectID,
          viewID: props.target.viewID,
        },
        props.target.ref.revisionID ? { revisionID: props.target.ref.revisionID } : undefined,
        props.target.ref.itemID ? { itemID: props.target.ref.itemID } : undefined,
      )}
    />
  )
}
