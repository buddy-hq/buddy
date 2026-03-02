import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { mergeDeep } from "remeda"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { Flag } from "../flag/flag.js"
import { Global } from "../storage/global.js"
import { loadConfigFile, loadConfigText, parseConfigText, patchJsoncDocument } from "./document.js"
import { InvalidError, JsonError } from "./errors.js"
import { ConfigSchema } from "./schema.js"

export { InvalidError, JsonError } from "./errors.js"

export namespace Config {
  export const Mcp = ConfigSchema.Mcp
  export type Mcp = ConfigSchema.Mcp

  export type PermissionAction = ConfigSchema.PermissionAction

  export type PermissionRule = ConfigSchema.PermissionRule

  export const Permission = ConfigSchema.Permission
  export type Permission = ConfigSchema.Permission

  export const Agent = ConfigSchema.Agent
  export type Agent = ConfigSchema.Agent

  export const Info = ConfigSchema.Info
  export type Info = ConfigSchema.Info

  function merge(target: Info, source: Info): Info {
    return mergeDeep(target, source)
  }

  let globalPromise: Promise<Info> | undefined

  const global = async () => {
    if (!globalPromise) {
      globalPromise = (async () => {
        return loadConfigFile(globalConfigFile())
      })()
    }
    return globalPromise
  }

  function resetGlobal() {
    globalPromise = undefined
  }

  async function projectConfigContext(directory: string) {
    const normalized = path.resolve(directory)
    return OpenCodeInstance.provide({
      directory: normalized,
      fn: () => {
        const scopedDirectory = path.resolve(OpenCodeInstance.directory)
        const worktree = path.resolve(OpenCodeInstance.worktree)
        const configDirectory = worktree !== "/" ? worktree : scopedDirectory
        return {
          directory: scopedDirectory,
          configDirectory,
        }
      },
    })
  }

  function projectConfigFile(directory: string) {
    const jsonc = path.join(directory, "buddy.jsonc")
    if (fs.existsSync(jsonc)) return jsonc

    const json = path.join(directory, "buddy.json")
    if (fs.existsSync(json)) return json

    return jsonc
  }

  async function loadProjectState(directory: string): Promise<Info> {
    const context = await projectConfigContext(directory)
    let result: Info = {}

    result = merge(result, await global())

    if (Flag.BUDDY_CONFIG) {
      result = merge(result, await loadConfigFile(Flag.BUDDY_CONFIG))
    }

    if (!Flag.BUDDY_DISABLE_PROJECT_CONFIG) {
      result = merge(result, await loadConfigFile(projectConfigFile(context.configDirectory)))
    }

    result.agent = result.agent || {}
    result.mode = result.mode || {}

    if (Flag.BUDDY_CONFIG_CONTENT) {
      result = merge(
        result,
        await loadConfigText(Flag.BUDDY_CONFIG_CONTENT, {
          dir: context.directory,
          source: "BUDDY_CONFIG_CONTENT",
        }),
      )
    }

    for (const [name, mode] of Object.entries(result.mode ?? {})) {
      result.agent = mergeDeep(result.agent ?? {}, {
        [name]: {
          ...mode,
          mode: "primary" as const,
        },
      })
    }

    if (Flag.BUDDY_PERMISSION) {
      const raw = JSON.parse(Flag.BUDDY_PERMISSION) as unknown
      const parsed = Permission.safeParse(raw)
      if (!parsed.success) {
        throw new InvalidError({
          path: "BUDDY_PERMISSION",
          issues: parsed.error.issues,
        })
      }
      result.permission = mergeDeep(result.permission ?? {}, parsed.data)
    }

    if (result.tools) {
      const perms: Record<string, Config.PermissionAction> = {}
      for (const [tool, enabled] of Object.entries(result.tools)) {
        const action: Config.PermissionAction = enabled ? "allow" : "deny"
        if (tool === "write" || tool === "edit" || tool === "patch" || tool === "multiedit") {
          perms.edit = action
          continue
        }
        perms[tool] = action
      }
      result.permission = mergeDeep(perms, result.permission ?? {})
    }

    return result
  }

  export async function getProject(directory: string) {
    return loadProjectState(directory)
  }

  export async function getGlobal() {
    return global()
  }

  function globalConfigFile() {
    const candidates = ["buddy.jsonc", "buddy.json"].map((file) => path.join(Global.Path.config, file))
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate
    }
    return candidates[0]
  }

  export async function updateProject(directory: string, config: Info) {
    const { configDirectory } = await projectConfigContext(directory)
    const filepath = projectConfigFile(configDirectory)
    await fsp.mkdir(path.dirname(filepath), { recursive: true })

    const before = await fsp.readFile(filepath, "utf8").catch((err: unknown) => {
      const maybe = err as { code?: string }
      if (maybe.code === "ENOENT") return "{}"
      throw new JsonError({ path: filepath }, { cause: err })
    })

    if (!filepath.endsWith(".jsonc")) {
      const existing = parseConfigText(before, filepath)
      const merged = mergeDeep(existing, config)
      await fsp.writeFile(filepath, JSON.stringify(merged, null, 2) + "\n", "utf8")
    } else {
      const updated = patchJsoncDocument(before, config)
      parseConfigText(updated, filepath)
      await fsp.writeFile(filepath, updated, "utf8")
    }
  }

  export async function setProjectMcp(directory: string, name: string, mcp: Mcp) {
    const { configDirectory } = await projectConfigContext(directory)
    const filepath = projectConfigFile(configDirectory)
    await fsp.mkdir(path.dirname(filepath), { recursive: true })

    const before = await fsp.readFile(filepath, "utf8").catch((err: unknown) => {
      const maybe = err as { code?: string }
      if (maybe.code === "ENOENT") return "{}"
      throw new JsonError({ path: filepath }, { cause: err })
    })

    if (!filepath.endsWith(".jsonc")) {
      const existing = parseConfigText(before, filepath)
      const next = Info.parse({
        ...existing,
        mcp: {
          ...(existing.mcp ?? {}),
          [name]: mcp,
        },
      })
      await fsp.writeFile(filepath, JSON.stringify(next, null, 2) + "\n", "utf8")
    } else {
      const updated = patchJsoncDocument(before, {
        mcp: {
          [name]: mcp,
        },
      })
      parseConfigText(updated, filepath)
      await fsp.writeFile(filepath, updated, "utf8")
    }
  }

  export async function updateGlobal(config: Info) {
    const filepath = globalConfigFile()
    await fsp.mkdir(path.dirname(filepath), { recursive: true })

    const before = await fsp.readFile(filepath, "utf8").catch((err: unknown) => {
      const maybe = err as { code?: string }
      if (maybe.code === "ENOENT") return "{}"
      throw new JsonError({ path: filepath }, { cause: err })
    })

    const next = await (async () => {
      if (!filepath.endsWith(".jsonc")) {
        const existing = parseConfigText(before, filepath)
        const merged = mergeDeep(existing, config)
        await fsp.writeFile(filepath, JSON.stringify(merged, null, 2) + "\n", "utf8")
        return merged
      }

      const updated = patchJsoncDocument(before, config)
      const merged = parseConfigText(updated, filepath)
      await fsp.writeFile(filepath, updated, "utf8")
      return merged
    })()

    resetGlobal()

    await OpenCodeInstance.disposeAll()

    return next
  }
}
