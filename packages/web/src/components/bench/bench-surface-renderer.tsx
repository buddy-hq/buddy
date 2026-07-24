import { FileBenchSurface } from "@/components/bench/surfaces/file-bench-surface"
import { MarkdownBenchSurface } from "@/components/bench/surfaces/markdown-bench-surface"
import { ObjectBenchSurface } from "@/components/bench/surfaces/object-bench-surface"
import type { BenchTarget } from "@/lib/bench-navigation"

/**
 * Resolves a Bench target to its surface. Targets, not route matches, are the unit of surface
 * identity, which is what allows a surface to remain mounted while another target is active.
 */
export function BenchSurfaceRenderer(props: { directory: string; target: BenchTarget }) {
  if (props.target.type === "workspace-file") {
    if (props.target.viewer === "markdown") {
      return (
        <MarkdownBenchSurface
          directory={props.directory}
          path={props.target.path}
          {...(props.target.fragment ? { fragment: props.target.fragment } : {})}
        />
      )
    }
    return (
      <FileBenchSurface
        directory={props.directory}
        path={props.target.path}
        {...(props.target.fragment ? { fragment: props.target.fragment } : {})}
      />
    )
  }

  return (
    <ObjectBenchSurface
      directory={props.directory}
      kind={props.target.ref.kind}
      objectID={props.target.ref.objectID}
      viewID={props.target.viewID}
      {...(props.target.ref.revisionID ? { revisionID: props.target.ref.revisionID } : {})}
      {...(props.target.ref.itemID ? { itemID: props.target.ref.itemID } : {})}
    />
  )
}
