import { Effect } from "effect"
import { WorkspaceContext } from "opencode/control-plane/workspace-context"
import { attach, attachWith } from "opencode/effect/run-service"
import { Instance } from "./instance"

export function withCurrentInstance<A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  try {
    return attachWith(effect, {
      instance: Instance.current,
      workspace: WorkspaceContext.workspaceID,
    })
  } catch {
    return attach(effect)
  }
}
