import type { RuntimeExtension } from "@buddy/agent-runtime/extension"
import { createChatGPTAccountService } from "../chatgpt/account"
import { buildNotebookRuntimePlan } from "../config/runtime/notebook-runtime-plan"
import { readProjectConfig } from "../config/runtime/project-config"
import { createBuddyHooks } from "./buddy-hooks"
import { allBuddyRuntimeTools } from "./buddy-tools"

export function createBuddyRuntimeExtension(): RuntimeExtension {
  return {
    tools: (location) => allBuddyRuntimeTools(location.directory),
    notebookPlan: async (directory) => buildNotebookRuntimePlan({ config: await readProjectConfig(directory), directory }),
    hooks: createBuddyHooks,
    chatgpt: createChatGPTAccountService,
  }
}
