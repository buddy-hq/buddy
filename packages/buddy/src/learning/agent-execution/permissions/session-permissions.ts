import type { PermissionRuleset } from "@buddy/transcript-contract/permission-rules"
import { SUBAGENT_IDS } from "../../shared/teaching-vocabulary"
import type { RuntimePermissionAccess } from "./delegated-permissions"
import { managedBuddySkillNames } from "../../skill-management/managed-buddy-skills"
import { allDynamicLearningToolIds } from "../../runtime/dynamic-tool-catalog"
import { allLearningToolIds } from "../../runtime/tool-metadata"
import { buildRuntimeSessionPermissionRules } from "./session-policy"

export function buildBuddyRuntimeSessionPermissions(input: {
  existing?: PermissionRuleset
  sessionRuntime?: { access: RuntimePermissionAccess }
  hasParentSession?: boolean
  configured?: PermissionRuleset
}): PermissionRuleset {
  return buildRuntimeSessionPermissionRules({
    ...input,
    catalog: {
      toolIDs: allLearningToolIds(),
      subagentIDs: SUBAGENT_IDS,
      skillNames: managedBuddySkillNames(),
      dynamicToolIDs: allDynamicLearningToolIds(),
    },
    platform: process.platform === "win32" ? "win32" : "posix",
  })
}
