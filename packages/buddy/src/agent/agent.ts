import path from "node:path"
import { mergeDeep, sortBy, values } from "remeda"
import z from "zod"
import { Config } from "../config/config.js"
import { PermissionNext } from "../opencode/vendor.js"
import { Instance } from "../project/instance.js"
import { Global } from "../storage/global.js"
import { Truncate } from "../opencode/vendor.js"
import CURRICULUM_BUILDER_PROMPT from "./prompts/curriculum-builder.txt"
import CODE_TEACHER_PROMPT from "../session/prompts/code-teacher.txt"
import EXPLORE_PROMPT from "../../../../vendor/opencode/packages/opencode/src/agent/prompt/explore.txt"

function parseModelID(model: string) {
  const index = model.indexOf("/")
  if (index <= 0 || index >= model.length - 1) {
    throw new Error(`Invalid model format: ${model}. Expected provider/model.`)
  }
  return {
    providerID: model.slice(0, index),
    modelID: model.slice(index + 1),
  }
}

export namespace Agent {
  export const Info = z.object({
    name: z.string(),
    description: z.string().optional(),
    mode: z.enum(["subagent", "primary", "all"]),
    native: z.boolean().optional(),
    hidden: z.boolean().optional(),
    topP: z.number().optional(),
    temperature: z.number().optional(),
    color: z.string().optional(),
    permission: PermissionNext.Ruleset,
    model: z
      .object({
        modelID: z.string(),
        providerID: z.string(),
      })
      .optional(),
    variant: z.string().optional(),
    prompt: z.string().optional(),
    options: z.record(z.string(), z.any()),
    steps: z.number().int().positive().optional(),
  })

  export type Info = z.infer<typeof Info>

  const state = Instance.state("agent.catalog", async () => {
    const cfg = await Config.get()

    const defaults = PermissionNext.fromConfig({
      "*": "allow",
      doom_loop: "ask",
      question: "deny",
      plan_enter: "deny",
      plan_exit: "deny",
      external_directory: {
        "*": "ask",
        [Truncate.GLOB]: "allow",
        [path.join(Global.Path.data, "notebooks", "*")]: "allow",
      },
      read: {
        "*": "allow",
        "*.env": "ask",
        "*.env.*": "ask",
        "*.env.example": "allow",
      },
    })

    const user = PermissionNext.fromConfig(cfg.permission ?? {})

    const result: Record<string, Info> = {
      build: {
        name: "build",
        description: "The default Buddy agent. Executes tools based on configured permissions.",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            plan_enter: "allow",
          }),
          user,
        ),
        mode: "primary",
        native: true,
        options: {},
        steps: 8,
      },
      "code-teacher": {
        name: "code-teacher",
        description: "Interactive code teaching agent for the in-app lesson editor.",
        prompt: CODE_TEACHER_PROMPT,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            plan_enter: "allow",
            teaching_start_lesson: "allow",
            teaching_checkpoint: "allow",
            teaching_add_file: "allow",
            teaching_set_lesson: "allow",
            teaching_restore_checkpoint: "allow",
          }),
          user,
          PermissionNext.fromConfig({
            task: "deny",
            todoread: "deny",
            todowrite: "deny",
          }),
        ),
        mode: "primary",
        native: true,
        options: {},
        steps: 8,
      },
      plan: {
        name: "plan",
        description: "Plan mode. Disallows edit tools.",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            question: "allow",
            plan_exit: "allow",
            edit: {
              "*": "deny",
            },
          }),
          user,
        ),
        mode: "primary",
        native: true,
        options: {},
      },
      general: {
        name: "general",
        description:
          "General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel.",
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            todoread: "deny",
            todowrite: "deny",
          }),
          user,
        ),
        mode: "subagent",
        native: true,
        options: {},
      },
      explore: {
        name: "explore",
        description:
          'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.',
        prompt: EXPLORE_PROMPT,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            grep: "allow",
            glob: "allow",
            list: "allow",
            bash: "allow",
            webfetch: "allow",
            websearch: "allow",
            codesearch: "allow",
            read: "allow",
          }),
          user,
        ),
        mode: "subagent",
        native: true,
        options: {},
      },
      "curriculum-builder": {
        name: "curriculum-builder",
        description: "Builds and updates project curriculum markdown with actionable checklists.",
        prompt: CURRICULUM_BUILDER_PROMPT,
        permission: PermissionNext.merge(
          defaults,
          PermissionNext.fromConfig({
            "*": "deny",
            read: "allow",
            list: "allow",
            write: "allow",
            webfetch: "allow",
            curriculum_read: "allow",
            curriculum_update: "allow",
            task: "deny",
          }),
          user,
        ),
        mode: "subagent",
        native: true,
        options: {},
        steps: 8,
      },
    }

    for (const [key, value] of Object.entries(cfg.agent ?? {})) {
      if (value.disable) {
        delete result[key]
        continue
      }

      let item = result[key]
      if (!item) {
        item = result[key] = {
          name: key,
          mode: "all",
          permission: PermissionNext.merge(defaults, user),
          options: {},
          native: false,
        }
      }

      if (value.model) item.model = parseModelID(value.model)
      item.variant = value.variant ?? item.variant
      item.prompt = value.prompt ?? item.prompt
      item.description = value.description ?? item.description
      item.temperature = value.temperature ?? item.temperature
      item.topP = value.top_p ?? item.topP
      item.mode = value.mode ?? item.mode
      item.color = typeof value.color === "string" ? value.color : item.color
      item.hidden = value.hidden ?? item.hidden
      item.name = value.name ?? item.name
      item.steps = value.steps ?? item.steps
      item.options = mergeDeep(item.options, value.options ?? {})
      item.permission = PermissionNext.merge(item.permission, PermissionNext.fromConfig(value.permission))
    }

    for (const name in result) {
      const agent = result[name]
      const explicitDeny = agent.permission.some((rule: { permission: string; action: string; pattern: string }) => {
        if (rule.permission !== "external_directory") return false
        if (rule.action !== "deny") return false
        return rule.pattern === Truncate.GLOB
      })

      if (explicitDeny) continue

      result[name].permission = PermissionNext.merge(
        result[name].permission,
        PermissionNext.fromConfig({
          external_directory: {
            [Truncate.GLOB]: "allow",
          },
        }),
      )
    }

    return result
  })

  export async function get(name: string) {
    return state().then((catalog) => catalog[name])
  }

  export async function list() {
    const cfg = await Config.get()
    return sortBy(values(await state()), [
      (entry) => (cfg.default_agent ? entry.name === cfg.default_agent : entry.name === "build"),
      "desc",
    ])
  }

  export async function defaultAgent() {
    const cfg = await Config.get()
    const agents = await state()

    if (cfg.default_agent) {
      const agent = agents[cfg.default_agent]
      if (!agent) throw new Error(`default agent \"${cfg.default_agent}\" not found`)
      if (agent.mode === "subagent") throw new Error(`default agent \"${cfg.default_agent}\" is a subagent`)
      if (agent.hidden === true) throw new Error(`default agent \"${cfg.default_agent}\" is hidden`)
      return agent.name
    }

    const fallback = Object.values(agents).find((agent) => agent.mode !== "subagent" && agent.hidden !== true)
    if (!fallback) {
      throw new Error("no primary visible agent found")
    }

    return fallback.name
  }
}
