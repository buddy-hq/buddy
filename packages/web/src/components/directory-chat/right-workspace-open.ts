import type { BenchTarget } from "@/lib/bench-navigation"
import type {
  ResourceOpenOptions,
  ResourceReadingTarget,
} from "@/state/resources-query"

export type RightWorkspaceResourceTarget = ResourceReadingTarget

export type RightWorkspaceOpenOutcome = "opened" | "focused" | "blocked" | "failed"

export type RightWorkspaceOpenRequest =
  | { type: "object"; directory: string; target: BenchTarget }
  | {
      type: "resource"
      directory: string
      resource: RightWorkspaceResourceTarget
      options?: ResourceOpenOptions
    }
