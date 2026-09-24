import { createContext } from "react"
import type {
  DirectoryWorkspaceBlocker,
  DirectoryWorkspaceController,
} from "@/lib/directory-workspace-controller"
import type { DirectoryWorkspaceLifecycleService } from "@/lib/directory-workspace-lifecycle"
import type {
  BenchRouteSnapshot,
  DirectoryWorkspaceStore,
  EffectiveWorkspaceProjection,
} from "@/state/directory-workspace-store"

/** The workspace state shared by the directory route and its mounted surfaces. */
export type DirectoryWorkspaceContextValue = {
  directory: string
  store: DirectoryWorkspaceStore
  controller: DirectoryWorkspaceController
  blocker: DirectoryWorkspaceBlocker
  lifecycle: DirectoryWorkspaceLifecycleService
  route: BenchRouteSnapshot
  projection: EffectiveWorkspaceProjection
}

/** Keep the context identity stable when the provider implementation is hot reloaded. */
export const DirectoryWorkspaceContext = createContext<DirectoryWorkspaceContextValue | undefined>(
  undefined,
)
