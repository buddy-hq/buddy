import fs from "node:fs"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import z from "zod"
import {
  applyEdits,
  modify,
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError as JsoncParseError,
} from "jsonc-parser"
import { mergeDeep, unique } from "remeda"
import { GlobalBus } from "../bus/global.js"
import { Flag } from "../flag/flag.js"
import { Instance } from "../project/instance.js"
import { Global } from "../storage/global.js"
import { ConfigMarkdown } from "./markdown.js"
import { FrontmatterError } from "./markdown.js"

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function toObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {}
  return value
}

export class JsonError extends Error {
  readonly data: {
    path: string
    message?: string
  }

  constructor(data: { path: string; message?: string }, options?: { cause?: unknown }) {
    super(data.message ?? `Invalid JSONC in ${data.path}`)
    this.name = "ConfigJsonError"
    this.data = data
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

export class InvalidError extends Error {
  readonly data: {
    path: string
    issues?: z.ZodIssue[]
    message?: string
  }

  constructor(data: { path: string; issues?: z.ZodIssue[]; message?: string }, options?: { cause?: unknown }) {
    super(data.message ?? `Invalid config: ${data.path}`)
    this.name = "ConfigInvalidError"
    this.data = data
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

export class ConfigDirectoryTypoError extends Error {
  readonly data: {
    path: string
    dir: string
    suggestion: string
  }

  constructor(data: { path: string; dir: string; suggestion: string }, options?: { cause?: unknown }) {
    super(`Config directory typo at ${data.path}: ${data.dir}. Did you mean ${data.suggestion}?`)
    this.name = "ConfigDirectoryTypoError"
    this.data = data
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

export namespace Config {
  const ModelId = z.string()

  export const McpLocal = z
    .object({
      type: z.literal("local"),
      command: z.string().array(),
      environment: z.record(z.string(), z.string()).optional(),
      enabled: z.boolean().optional(),
      timeout: z.number().int().positive().optional(),
    })
    .strict()

  export const McpOAuth = z
    .object({
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      scope: z.string().optional(),
    })
    .strict()

  export const McpRemote = z
    .object({
      type: z.literal("remote"),
      url: z.string(),
      enabled: z.boolean().optional(),
      headers: z.record(z.string(), z.string()).optional(),
      oauth: z.union([McpOAuth, z.literal(false)]).optional(),
      timeout: z.number().int().positive().optional(),
    })
    .strict()

  export const Mcp = z.discriminatedUnion("type", [McpLocal, McpRemote])
  export type Mcp = z.infer<typeof Mcp>

  export const PermissionAction = z.enum(["ask", "allow", "deny"])
  export type PermissionAction = z.infer<typeof PermissionAction>

  export const PermissionObject = z.record(z.string(), PermissionAction)
  export type PermissionObject = z.infer<typeof PermissionObject>

  export const PermissionRule = z.union([PermissionAction, PermissionObject])
  export type PermissionRule = z.infer<typeof PermissionRule>

  const permissionPreprocess = (value: unknown) => {
    if (isRecord(value)) {
      return { __originalKeys: Object.keys(value), ...value }
    }
    return value
  }

  const permissionTransform = (value: unknown): Record<string, PermissionRule> => {
    if (typeof value === "string") return { "*": value as PermissionAction }
    const obj = (value ?? {}) as { __originalKeys?: string[] } & Record<string, unknown>
    const { __originalKeys, ...rest } = obj
    if (!__originalKeys) return rest as Record<string, PermissionRule>
    const result: Record<string, PermissionRule> = {}
    for (const key of __originalKeys) {
      if (key in rest) result[key] = rest[key] as PermissionRule
    }
    return result
  }

  export const Permission = z
    .preprocess(
      permissionPreprocess,
      z
        .object({
          __originalKeys: z.string().array().optional(),
          read: PermissionRule.optional(),
          edit: PermissionRule.optional(),
          glob: PermissionRule.optional(),
          grep: PermissionRule.optional(),
          list: PermissionRule.optional(),
          bash: PermissionRule.optional(),
          task: PermissionRule.optional(),
          external_directory: PermissionRule.optional(),
          todowrite: PermissionAction.optional(),
          todoread: PermissionAction.optional(),
          question: PermissionAction.optional(),
          webfetch: PermissionAction.optional(),
          websearch: PermissionAction.optional(),
          codesearch: PermissionAction.optional(),
          lsp: PermissionRule.optional(),
          doom_loop: PermissionAction.optional(),
          skill: PermissionRule.optional(),
          plan_enter: PermissionAction.optional(),
          plan_exit: PermissionAction.optional(),
          curriculum_read: PermissionRule.optional(),
          curriculum_update: PermissionRule.optional(),
        })
        .catchall(PermissionRule)
        .or(PermissionAction),
    )
    .transform(permissionTransform)
  export type Permission = z.infer<typeof Permission>

  export const Command = z.object({
    template: z.string(),
    description: z.string().optional(),
    agent: z.string().optional(),
    model: ModelId.optional(),
    subtask: z.boolean().optional(),
  })
  export type Command = z.infer<typeof Command>

  export const Skills = z.object({
    paths: z.array(z.string()).optional(),
    urls: z.array(z.string()).optional(),
  })
  export type Skills = z.infer<typeof Skills>

  export const Agent = z
    .object({
      name: z.string().optional(),
      model: ModelId.optional(),
      variant: z.string().optional(),
      temperature: z.number().optional(),
      top_p: z.number().optional(),
      prompt: z.string().optional(),
      tools: z.record(z.string(), z.boolean()).optional(),
      disable: z.boolean().optional(),
      description: z.string().optional(),
      mode: z.enum(["subagent", "primary", "all"]).optional(),
      hidden: z.boolean().optional(),
      options: z.record(z.string(), z.any()).optional(),
      color: z
        .union([
          z.string().regex(/^#[0-9a-fA-F]{6}$/),
          z.enum(["primary", "secondary", "accent", "success", "warning", "error", "info"]),
        ])
        .optional(),
      steps: z.number().int().positive().optional(),
      maxSteps: z.number().int().positive().optional(),
      permission: Permission.optional(),
    })
    .catchall(z.any())
    .transform((agent) => {
      const known = new Set([
        "name",
        "model",
        "variant",
        "prompt",
        "description",
        "temperature",
        "top_p",
        "mode",
        "hidden",
        "color",
        "steps",
        "maxSteps",
        "options",
        "permission",
        "disable",
        "tools",
      ])

      const options: Record<string, unknown> = { ...(agent.options ?? {}) }
      for (const [key, value] of Object.entries(agent)) {
        if (!known.has(key)) options[key] = value
      }

      const permission: Permission = {}
      for (const [tool, enabled] of Object.entries(agent.tools ?? {})) {
        const action: PermissionAction = enabled ? "allow" : "deny"
        if (tool === "write" || tool === "edit" || tool === "patch" || tool === "multiedit") {
          permission.edit = action
          continue
        }
        permission[tool] = action
      }
      Object.assign(permission, agent.permission)

      return {
        ...agent,
        options,
        permission,
        steps: agent.steps ?? agent.maxSteps,
      }
    })
  export type Agent = z.infer<typeof Agent>

  export const TUI = z
    .object({
      scroll_speed: z.number().min(0.001).optional(),
      scroll_acceleration: z
        .object({
          enabled: z.boolean(),
        })
        .optional(),
      diff_style: z.enum(["auto", "stacked"]).optional(),
    })
    .strict()

  export const Server = z
    .object({
      port: z.number().int().positive().optional(),
      hostname: z.string().optional(),
      mdns: z.boolean().optional(),
      mdnsDomain: z.string().optional(),
      cors: z.array(z.string()).optional(),
    })
    .strict()

  export const Provider = z
    .object({
      whitelist: z.array(z.string()).optional(),
      blacklist: z.array(z.string()).optional(),
      models: z.record(z.string(), z.record(z.string(), z.any())).optional(),
      options: z
        .object({
          apiKey: z.string().optional(),
          baseURL: z.string().optional(),
          enterpriseUrl: z.string().optional(),
          setCacheKey: z.boolean().optional(),
          timeout: z.union([z.number().int().positive(), z.literal(false)]).optional(),
        })
        .catchall(z.any())
        .optional(),
    })
    .catchall(z.any())

  export const Info = z
    .object({
      $schema: z.string().optional(),
      theme: z.string().optional(),
      keybinds: z.record(z.string(), z.string()).optional(),
      logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
      tui: TUI.optional(),
      server: Server.optional(),
      command: z.record(z.string(), Command).optional(),
      skills: Skills.optional(),
      watcher: z
        .object({
          ignore: z.array(z.string()).optional(),
        })
        .optional(),
      plugin: z.array(z.string()).optional(),
      snapshot: z.boolean().optional(),
      share: z.enum(["manual", "auto", "disabled"]).optional(),
      autoshare: z.boolean().optional(),
      autoupdate: z.union([z.boolean(), z.literal("notify")]).optional(),
      disabled_providers: z.array(z.string()).optional(),
      enabled_providers: z.array(z.string()).optional(),
      model: ModelId.optional(),
      small_model: ModelId.optional(),
      default_agent: z.string().optional(),
      username: z.string().optional(),
      mode: z.record(z.string(), Agent).optional(),
      agent: z.record(z.string(), Agent).optional(),
      provider: z.record(z.string(), Provider).optional(),
      mcp: z
        .record(
          z.string(),
          z.union([
            Mcp,
            z
              .object({
                enabled: z.boolean(),
              })
              .strict(),
          ]),
        )
        .optional(),
      formatter: z
        .union([
          z.literal(false),
          z.record(
            z.string(),
            z.object({
              disabled: z.boolean().optional(),
              command: z.array(z.string()).optional(),
              environment: z.record(z.string(), z.string()).optional(),
              extensions: z.array(z.string()).optional(),
            }),
          ),
        ])
        .optional(),
      lsp: z
        .union([
          z.literal(false),
          z.record(
            z.string(),
            z.union([
              z.object({
                disabled: z.literal(true),
              }),
              z.object({
                command: z.array(z.string()),
                extensions: z.array(z.string()).optional(),
                disabled: z.boolean().optional(),
                env: z.record(z.string(), z.string()).optional(),
                initialization: z.record(z.string(), z.any()).optional(),
              }),
            ]),
          ),
        ])
        .optional(),
      instructions: z.array(z.string()).optional(),
      layout: z.enum(["auto", "stretch"]).optional(),
      permission: Permission.optional(),
      tools: z.record(z.string(), z.boolean()).optional(),
      enterprise: z
        .object({
          url: z.string().optional(),
        })
        .optional(),
      compaction: z
        .object({
          auto: z.boolean().optional(),
          prune: z.boolean().optional(),
          reserved: z.number().int().min(0).optional(),
        })
        .optional(),
      experimental: z
        .object({
          disable_paste_summary: z.boolean().optional(),
          batch_tool: z.boolean().optional(),
          openTelemetry: z.boolean().optional(),
          primary_tools: z.array(z.string()).optional(),
          continue_loop_on_deny: z.boolean().optional(),
          mcp_timeout: z.number().int().positive().optional(),
        })
        .optional(),
    })
    .strict()

  export type Info = z.output<typeof Info>

  function merge(target: Info, source: Info): Info {
    const merged = mergeDeep(target, source)
    if (target.plugin && source.plugin) {
      merged.plugin = Array.from(new Set([...target.plugin, ...source.plugin]))
    }
    if (target.instructions && source.instructions) {
      merged.instructions = Array.from(new Set([...target.instructions, ...source.instructions]))
    }
    return merged
  }

  function rel(item: string, patterns: string[]) {
    for (const pattern of patterns) {
      const index = item.indexOf(pattern)
      if (index === -1) continue
      return item.slice(index + pattern.length)
    }
  }

  function trim(file: string) {
    const ext = path.extname(file)
    return ext.length ? file.slice(0, -ext.length) : file
  }

  async function scanGlob(pattern: string, cwd: string) {
    const glob = new Bun.Glob(pattern)
    const results: string[] = []
    for await (const item of glob.scan({ cwd, absolute: true })) {
      results.push(item)
    }
    return results
  }

  async function pathExists(filepath: string) {
    return fsp
      .access(filepath)
      .then(() => true)
      .catch(() => false)
  }

  async function findUp(filename: string, start: string, stop?: string) {
    const result: string[] = []
    let current = path.resolve(start)
    const last = stop ? path.resolve(stop) : undefined

    while (true) {
      const candidate = path.join(current, filename)
      if (await pathExists(candidate)) result.push(candidate)
      if (last && current === last) break
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }

    return result
  }

  async function up(target: string, start: string, stop: string) {
    const results: string[] = []
    let current = path.resolve(start)
    const end = path.resolve(stop)

    while (true) {
      const candidate = path.join(current, target)
      if (await pathExists(candidate)) {
        results.push(candidate)
      }
      if (current === end) break
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }

    return results
  }

  function overlayConfigDir(dir: string) {
    return path.basename(dir) === ".buddy" ? dir : path.join(dir, ".buddy")
  }

  async function loadCommand(dir: string) {
    const result: Record<string, Command> = {}

    for (const item of await scanGlob("{command,commands}/**/*.md", dir)) {
      const md = await ConfigMarkdown.parse(item).catch((err) => {
        if (err instanceof FrontmatterError) {
          throw new InvalidError({ path: item, message: err.data.message }, { cause: err })
        }
        throw new InvalidError({ path: item, message: `Failed to parse command ${item}` }, { cause: err })
      })

      const patterns = ["/.buddy/command/", "/.buddy/commands/", "/command/", "/commands/"]
      const file = rel(item, patterns) ?? path.basename(item)
      const name = trim(file)

      const config = {
        name,
        ...toObject(md.data),
        template: md.content.trim(),
      }

      const parsed = Command.safeParse(config)
      if (!parsed.success) {
        throw new InvalidError({ path: item, issues: parsed.error.issues }, { cause: parsed.error })
      }

      result[name] = parsed.data
    }

    return result
  }

  async function loadAgent(dir: string) {
    const result: Record<string, Agent> = {}

    for (const item of await scanGlob("{agent,agents}/**/*.md", dir)) {
      const md = await ConfigMarkdown.parse(item).catch((err) => {
        if (err instanceof FrontmatterError) {
          throw new InvalidError({ path: item, message: err.data.message }, { cause: err })
        }
        throw new InvalidError({ path: item, message: `Failed to parse agent ${item}` }, { cause: err })
      })

      const patterns = ["/.buddy/agent/", "/.buddy/agents/", "/agent/", "/agents/"]
      const file = rel(item, patterns) ?? path.basename(item)
      const name = trim(file)

      const config = {
        name,
        ...toObject(md.data),
        prompt: md.content.trim(),
      }

      const parsed = Agent.safeParse(config)
      if (!parsed.success) {
        throw new InvalidError({ path: item, issues: parsed.error.issues }, { cause: parsed.error })
      }

      result[name] = parsed.data
    }

    return result
  }

  async function loadMode(dir: string) {
    const result: Record<string, Agent> = {}

    for (const item of await scanGlob("{mode,modes}/*.md", dir)) {
      const md = await ConfigMarkdown.parse(item).catch((err) => {
        if (err instanceof FrontmatterError) {
          throw new InvalidError({ path: item, message: err.data.message }, { cause: err })
        }
        throw new InvalidError({ path: item, message: `Failed to parse mode ${item}` }, { cause: err })
      })

      const config = {
        name: path.basename(item, ".md"),
        ...toObject(md.data),
        prompt: md.content.trim(),
      }

      const parsed = Agent.safeParse(config)
      if (!parsed.success) {
        throw new InvalidError({ path: item, issues: parsed.error.issues }, { cause: parsed.error })
      }

      result[config.name] = {
        ...parsed.data,
        mode: "primary" as const,
      }
    }

    return result
  }

  async function loadPlugin(dir: string) {
    const result: string[] = []

    for (const item of await scanGlob("{plugin,plugins}/*.{ts,js}", dir)) {
      result.push(pathToFileURL(item).href)
    }

    return result
  }

  export function getPluginName(plugin: string): string {
    if (plugin.startsWith("file://")) {
      return path.parse(new URL(plugin).pathname).name
    }
    const lastAt = plugin.lastIndexOf("@")
    if (lastAt > 0) return plugin.substring(0, lastAt)
    return plugin
  }

  export function deduplicatePlugins(plugins: string[]) {
    const seen = new Set<string>()
    const uniqueSpecifiers: string[] = []

    for (const specifier of plugins.toReversed()) {
      const name = getPluginName(specifier)
      if (seen.has(name)) continue
      seen.add(name)
      uniqueSpecifiers.push(specifier)
    }

    return uniqueSpecifiers.toReversed()
  }

  function errorDetails(text: string, errors: JsoncParseError[]) {
    const lines = text.split("\n")
    return errors
      .map((item) => {
        const beforeOffset = text.substring(0, item.offset).split("\n")
        const line = beforeOffset.length
        const column = beforeOffset[beforeOffset.length - 1].length + 1
        const problemLine = lines[line - 1]
        const error = `${printParseErrorCode(item.error)} at line ${line}, column ${column}`

        if (!problemLine) return error
        return `${error}\n   Line ${line}: ${problemLine}\n${"".padStart(column + 9)}^`
      })
      .join("\n")
  }

  async function loadFile(filepath: string): Promise<Info> {
    const text = await fsp.readFile(filepath, "utf8").catch((err: unknown) => {
      const maybe = err as { code?: string }
      if (maybe.code === "ENOENT") return undefined
      throw new JsonError({ path: filepath }, { cause: err })
    })

    if (!text) return {}
    return load(text, { path: filepath })
  }

  async function load(text: string, options: { path: string } | { dir: string; source: string }) {
    const original = text
    const configDir = "path" in options ? path.dirname(options.path) : options.dir
    const source = "path" in options ? options.path : options.source
    const isFile = "path" in options

    text = text.replace(/\{env:([^}]+)\}/g, (_, varName: string) => process.env[varName] ?? "")

    const fileMatches = text.match(/\{file:[^}]+\}/g)
    if (fileMatches) {
      const lines = text.split("\n")

      for (const match of fileMatches) {
        const lineIndex = lines.findIndex((line) => line.includes(match))
        if (lineIndex !== -1 && lines[lineIndex].trim().startsWith("//")) continue

        let filePath = match.replace(/^\{file:/, "").replace(/\}$/, "")
        if (filePath.startsWith("~/")) {
          filePath = path.join(os.homedir(), filePath.slice(2))
        }

        const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(configDir, filePath)
        const content = await fsp.readFile(resolvedPath, "utf8").catch((error: unknown) => {
          const err = error as { code?: string }
          const base = `bad file reference: \"${match}\"`
          if (err.code === "ENOENT") {
            throw new InvalidError(
              { path: source, message: `${base} ${resolvedPath} does not exist` },
              { cause: error },
            )
          }
          throw new InvalidError({ path: source, message: base }, { cause: error })
        })

        text = text.replace(match, () => JSON.stringify(content.trim()).slice(1, -1))
      }
    }

    const errors: JsoncParseError[] = []
    const data = parseJsonc(text, errors, { allowTrailingComma: true })
    if (errors.length > 0) {
      throw new JsonError({
        path: source,
        message: `\n--- JSONC Input ---\n${text}\n--- Errors ---\n${errorDetails(text, errors)}\n--- End ---`,
      })
    }

    const parsed = Info.safeParse(data)
    if (!parsed.success) {
      throw new InvalidError({ path: source, issues: parsed.error.issues }, { cause: parsed.error })
    }

    const output = parsed.data

    if (!output.$schema && isFile) {
      output.$schema = "https://buddy/config.json"
      const updated = original.replace(/^\s*\{/, '{\n  "$schema": "https://buddy/config.json",')
      await fsp.writeFile(options.path, updated, "utf8").catch(() => undefined)
    }

    if (output.plugin && isFile) {
      output.plugin = output.plugin.map((plugin) => {
        if (plugin.startsWith("file://")) return plugin
        if (plugin.startsWith(".") || plugin.startsWith("/")) {
          const resolved = path.isAbsolute(plugin) ? plugin : path.resolve(path.dirname(options.path), plugin)
          return pathToFileURL(resolved).href
        }
        return plugin
      })
    }

    return output
  }

  let globalPromise: Promise<Info> | undefined

  export const global = async () => {
    if (!globalPromise) {
      globalPromise = (async () => {
        let result: Info = {}
        for (const file of ["buddy.json", "buddy.jsonc"]) {
          result = merge(result, await loadFile(path.join(Global.Path.config, file)))
        }
        return result
      })()
    }
    return globalPromise
  }

  function resetGlobal() {
    globalPromise = undefined
  }

  async function loadState() {
    let result: Info = {}

    result = merge(result, await global())

    if (Flag.BUDDY_CONFIG) {
      result = merge(result, await loadFile(Flag.BUDDY_CONFIG))
    }

    if (!Flag.BUDDY_DISABLE_PROJECT_CONFIG) {
      for (const file of ["buddy.jsonc", "buddy.json"]) {
        const found = await findUp(file, Instance.directory, Instance.worktree)
        for (const resolved of found.toReversed()) {
          result = merge(result, await loadFile(resolved))
        }
      }
    }

    result.agent = result.agent || {}
    result.mode = result.mode || {}
    result.plugin = result.plugin || []

    const directories = [
      ...(!Flag.BUDDY_DISABLE_PROJECT_CONFIG ? await up(".buddy", Instance.directory, Instance.worktree) : []),
      ...(await up(".buddy", Global.Path.home, Global.Path.home)),
    ]

    if (Flag.BUDDY_CONFIG_DIR) {
      const configDir = path.resolve(Flag.BUDDY_CONFIG_DIR)
      directories.push(configDir)

      const typo = path.join(configDir, ".buddy")
      if (path.basename(configDir) !== ".buddy" && fs.existsSync(typo)) {
        throw new ConfigDirectoryTypoError({
          path: configDir,
          dir: configDir,
          suggestion: typo,
        })
      }
    }

    for (const dir of unique(directories)) {
      const overlayDir = overlayConfigDir(dir)
      for (const file of ["buddy.jsonc", "buddy.json"]) {
        result = merge(result, await loadFile(path.join(overlayDir, file)))
      }

      result.command = mergeDeep(result.command ?? {}, await loadCommand(overlayDir))
      result.agent = mergeDeep(result.agent ?? {}, await loadAgent(overlayDir))
      result.agent = mergeDeep(result.agent ?? {}, await loadMode(overlayDir))
      ;(result.plugin ??= []).push(...(await loadPlugin(overlayDir)))
    }

    if (Flag.BUDDY_CONFIG_CONTENT) {
      result = merge(
        result,
        await load(Flag.BUDDY_CONFIG_CONTENT, {
          dir: Instance.directory,
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

    if (!result.username) {
      result.username = os.userInfo().username
    }

    if (result.autoshare === true && !result.share) {
      result.share = "auto"
    }

    if (Flag.BUDDY_DISABLE_AUTOCOMPACT) {
      result.compaction = {
        ...result.compaction,
        auto: false,
      }
    }

    if (Flag.BUDDY_DISABLE_PRUNE) {
      result.compaction = {
        ...result.compaction,
        prune: false,
      }
    }

    result.plugin = deduplicatePlugins(result.plugin ?? [])

    return {
      config: result,
      directories,
    }
  }

  const state = Instance.state("config.state", () => loadState())

  export async function get() {
    return state().then((value) => value.config)
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

  function parseConfig(text: string, filepath: string): Info {
    const errors: JsoncParseError[] = []
    const data = parseJsonc(text, errors, { allowTrailingComma: true })
    if (errors.length) {
      throw new JsonError({
        path: filepath,
        message: `\n--- JSONC Input ---\n${text}\n--- Errors ---\n${errorDetails(text, errors)}\n--- End ---`,
      })
    }

    const parsed = Info.safeParse(data)
    if (!parsed.success) {
      throw new InvalidError({ path: filepath, issues: parsed.error.issues }, { cause: parsed.error })
    }

    return parsed.data
  }

  function patchJsonc(input: string, patch: unknown, patchPath: string[] = []): string {
    if (!isRecord(patch)) {
      const edits = modify(input, patchPath, patch, {
        formattingOptions: {
          insertSpaces: true,
          tabSize: 2,
        },
      })
      return applyEdits(input, edits)
    }

    return Object.entries(patch).reduce((result, [key, value]) => {
      if (value === undefined) return result
      return patchJsonc(result, value, [...patchPath, key])
    }, input)
  }

  function nearestProjectConfigFile() {
    const candidates: string[] = []
    let current = path.resolve(Instance.directory)
    const stop = path.resolve(Instance.worktree)

    while (true) {
      for (const file of ["buddy.jsonc", "buddy.json"]) {
        const candidate = path.join(current, file)
        if (fs.existsSync(candidate)) return candidate
      }
      if (current === stop) break
      const parent = path.dirname(current)
      if (parent === current) break
      current = parent
    }

    return path.join(Instance.directory, "buddy.jsonc")
  }

  export async function update(config: Info) {
    const filepath = nearestProjectConfigFile()
    await fsp.mkdir(path.dirname(filepath), { recursive: true })

    const before = await fsp.readFile(filepath, "utf8").catch((err: unknown) => {
      const maybe = err as { code?: string }
      if (maybe.code === "ENOENT") return "{}"
      throw new JsonError({ path: filepath }, { cause: err })
    })

    if (!filepath.endsWith(".jsonc")) {
      const existing = parseConfig(before, filepath)
      const merged = mergeDeep(existing, config)
      await fsp.writeFile(filepath, JSON.stringify(merged, null, 2) + "\n", "utf8")
    } else {
      const updated = patchJsonc(before, config)
      parseConfig(updated, filepath)
      await fsp.writeFile(filepath, updated, "utf8")
    }

    Instance.dispose()
  }

  export async function setProjectMcp(name: string, mcp: Mcp) {
    const filepath = nearestProjectConfigFile()
    await fsp.mkdir(path.dirname(filepath), { recursive: true })

    const before = await fsp.readFile(filepath, "utf8").catch((err: unknown) => {
      const maybe = err as { code?: string }
      if (maybe.code === "ENOENT") return "{}"
      throw new JsonError({ path: filepath }, { cause: err })
    })

    if (!filepath.endsWith(".jsonc")) {
      const existing = parseConfig(before, filepath)
      const next = Info.parse({
        ...existing,
        mcp: {
          ...(existing.mcp ?? {}),
          [name]: mcp,
        },
      })
      await fsp.writeFile(filepath, JSON.stringify(next, null, 2) + "\n", "utf8")
    } else {
      const edits = modify(before, ["mcp", name], mcp, {
        formattingOptions: {
          insertSpaces: true,
          tabSize: 2,
        },
      })
      const updated = applyEdits(before, edits)
      parseConfig(updated, filepath)
      await fsp.writeFile(filepath, updated, "utf8")
    }

    Instance.dispose()
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
        const existing = parseConfig(before, filepath)
        const merged = mergeDeep(existing, config)
        await fsp.writeFile(filepath, JSON.stringify(merged, null, 2) + "\n", "utf8")
        return merged
      }

      const updated = patchJsonc(before, config)
      const merged = parseConfig(updated, filepath)
      await fsp.writeFile(filepath, updated, "utf8")
      return merged
    })()

    resetGlobal()

    await Instance.disposeAll()
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: "global.disposed",
        properties: {},
      },
    })
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: "global.config.updated",
        properties: {},
      },
    })

    return next
  }

  export async function directories() {
    return state().then((value) => value.directories)
  }
}
