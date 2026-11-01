import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import z from "zod"
import { createFreeModelControlIdentity } from "@buddy/opencode-adapter/request-identity"

type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: SmokeFailure }
type Launch = { readonly kind: "source" } | { readonly kind: "binary"; readonly binary: string }
type Options = { readonly launch: Launch; readonly model: string; readonly deadlineMs: number }
type CompletedText = { readonly text: string; readonly sessionID: string }
type Attempt = Result<CompletedText>
type BuddyAttempt = { readonly result: Attempt; readonly sessionID: string | undefined }
type ControlIdentity = { readonly sessionID: string; readonly userAgent: string }
type OwnedBackend = {
  readonly exitCode: number | null
  readonly exited: Promise<number>
  kill(signal?: NodeJS.Signals): void
}

class SmokeFailure extends Error {
  readonly _tag = "SmokeFailure" as const

  constructor(
    readonly stage: string,
    message: string,
    cause?: unknown,
  ) {
    super(`${stage}: ${message}`, { cause })
  }
}

const repository = path.resolve(import.meta.dir, "../../..")
const backendPackage = path.join(repository, "packages/buddy")
const prompt = "Reply with just: ok"
export function freeModelPrompt(modelID: string) {
  return { content: prompt, agent: "buddy", model: { providerID: "opencode", modelID } }
}
const controlEndpoint = "https://opencode.ai/zen/v1/chat/completions"
const username = "free-model-smoke"
const password = crypto.randomUUID()
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
const sessionSchema = z.object({ id: z.string().regex(/^ses_[0-9a-f]{12}[A-Za-z0-9]{14}$/) })
const statusesSchema = z.record(
  z.string(),
  z.object({
    type: z.enum(["idle", "busy", "retry"]),
    attempt: z.number().optional(),
    message: z.string().optional(),
  }),
)
const messagesSchema = z.array(
  z.object({
    info: z.object({
      role: z.string(),
      sessionID: z.string(),
      agent: z.string().optional(),
      providerID: z.string().optional(),
      modelID: z.string().optional(),
      time: z.object({ completed: z.number().optional() }),
      finish: z.string().nullable().optional(),
      error: z.object({ name: z.string(), message: z.string().optional() }).optional(),
    }),
    parts: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  }),
)
const streamChunkSchema = z.object({
  error: z.unknown().optional(),
  choices: z
    .array(
      z.object({
        index: z.number(),
        delta: z.object({ content: z.string().nullable().optional() }).optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .optional(),
})

function failure(stage: string, message: string, cause?: unknown): Result<never> {
  return { ok: false, error: new SmokeFailure(stage, message, cause) }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function parseOptions(args: readonly string[]): Result<Options> {
  let launch: Launch = { kind: "source" }
  let explicitSource = false
  let model = "beam-free"
  let deadlineMs = 120_000
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--source") {
      if (launch.kind === "binary")
        return failure("arguments", "Choose either --source or --binary")
      explicitSource = true
      continue
    }
    if (argument !== "--binary" && argument !== "--model" && argument !== "--deadline-ms")
      return failure("arguments", `Unknown argument ${argument ?? ""}`)
    const value = args[index + 1]
    if (!value || value.startsWith("--")) return failure("arguments", `${argument} needs a value`)
    index += 1
    if (argument === "--binary") {
      if (explicitSource) return failure("arguments", "Choose either --source or --binary")
      launch = { kind: "binary", binary: path.resolve(value) }
    } else if (argument === "--model") {
      model = value.startsWith("opencode/") ? value.slice("opencode/".length) : value
      if (!model.trim() || model.includes("/"))
        return failure("arguments", "--model must be an OpenCode model ID or opencode/model-ID")
    } else {
      const parsed = Number(value)
      if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 600_000)
        return failure("arguments", "--deadline-ms must be an integer from 1 to 600000")
      deadlineMs = parsed
    }
  }
  return { ok: true, value: { launch, model, deadlineMs } }
}

async function isolatedEnvironment(root: string): Promise<Record<string, string>> {
  const home = path.join(root, "home")
  const runtime = path.join(root, "runtime")
  const temporary = path.join(root, "tmp")
  const notebook = path.join(root, "notebook")
  const config = path.join(home, ".buddy")
  const environment: Record<string, string> = {}
  const inheritedNames = new Set([
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "SYSTEMDRIVE",
    "LANG",
    "LC_ALL",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ])
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && inheritedNames.has(key.toUpperCase())) environment[key] = value
  }
  Object.assign(environment, {
    HOME: home,
    USERPROFILE: home,
    HOMEDRIVE: path.parse(home).root.replace(/[\\/]$/, ""),
    HOMEPATH: home.slice(path.parse(home).root.replace(/[\\/]$/, "").length),
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    XDG_DATA_HOME: path.join(runtime, "data"),
    XDG_CONFIG_HOME: path.join(runtime, "config"),
    XDG_CACHE_HOME: path.join(runtime, "cache"),
    XDG_STATE_HOME: path.join(runtime, "state"),
    XDG_RUNTIME_DIR: path.join(runtime, "run"),
    BUDDY_RUNTIME_ROOT: runtime,
    BUDDY_DATA_DIR: path.join(runtime, "data", "buddy"),
    BUDDY_CACHE_DIR: path.join(runtime, "cache", "buddy"),
    BUDDY_STATE_DIR: path.join(runtime, "state", "buddy"),
    BUDDY_TEST_HOME: home,
    BUDDY_TEST_XDG_ROOT: runtime,
    BUDDY_MANAGED_HOME_DIR: home,
    BUDDY_GLOBAL_CONFIG_DIR: config,
    BUDDY_DEFAULT_NOTEBOOK_HOME: notebook,
    BUDDY_ALLOWED_DIRECTORY_ROOTS: notebook,
    BUDDY_DIRECTORY_BASE: notebook,
    BUDDY_SERVER_USERNAME: username,
    BUDDY_SERVER_PASSWORD: password,
    BUDDY_DISABLE_SKILL_ARTIFACT_FETCH: "1",
    BUDDY_EXIT_WITH_PARENT: "1",
    BUDDY_BACKEND_RESOURCES_DIR: path.join(backendPackage, "src"),
    BUDDY_MIGRATION_DIR: path.join(backendPackage, "migration"),
    BUDDY_TESSDATA_DIR: path.join(backendPackage, "resources", "tessdata"),
    BUDDY_STANDARDS_LOCAL_ASSET_DIR: path.join(backendPackage, "resources", "knowledge-graph"),
    OPENCODE_TEST_HOME: home,
    OPENCODE_CONFIG_DIR: config,
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_SERVER_USERNAME: username,
    OPENCODE_SERVER_PASSWORD: password,
    OPENCODE_CLIENT: "desktop",
    BUN_INSTALL_CACHE_DIR: path.join(runtime, "bun-cache"),
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: path.join(runtime, "bun-transpiler-cache"),
    BUN_TMPDIR: temporary,
  })
  await Promise.all(
    [
      home,
      config,
      notebook,
      temporary,
      environment.APPDATA,
      environment.LOCALAPPDATA,
      environment.XDG_DATA_HOME,
      environment.XDG_CONFIG_HOME,
      environment.XDG_CACHE_HOME,
      environment.XDG_STATE_HOME,
      environment.XDG_RUNTIME_DIR,
    ]
      .filter((entry): entry is string => entry !== undefined)
      .map((entry) => mkdir(entry, { recursive: true })),
  )
  return environment
}

function signalBefore(deadline: number): AbortSignal {
  return AbortSignal.timeout(Math.max(1, deadline - Date.now()))
}

async function request(
  url: URL | string,
  init: RequestInit,
  deadline: number,
): Promise<Result<Response>> {
  try {
    const response = await fetch(url, {
      ...init,
      signal: signalBefore(deadline),
      redirect: "error",
    })
    if (!response.ok) {
      const body = (await response.text()).slice(0, 2_000)
      return failure("request", `HTTP ${response.status}: ${body}`)
    }
    return { ok: true, value: response }
  } catch (cause) {
    return failure("request", errorMessage(cause), cause)
  }
}

async function readJson<T>(response: Response, schema: z.ZodType<T>): Promise<Result<T>> {
  try {
    const parsed = schema.safeParse(await response.json())
    return parsed.success
      ? { ok: true, value: parsed.data }
      : failure("response", parsed.error.message)
  } catch (cause) {
    return failure("response", errorMessage(cause), cause)
  }
}

function route(baseURL: string, pathname: string, directory: string): URL {
  const url = new URL(`/api/${pathname}`, baseURL)
  url.searchParams.set("directory", directory)
  return url
}

async function stopBackend(child: OwnedBackend, mode: "graceful" | "immediate"): Promise<void> {
  if (child.exitCode !== null) return
  if (mode === "immediate") {
    child.kill("SIGKILL")
    await child.exited
    return
  }
  child.kill("SIGTERM")
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const stopped = await Promise.race([
      child.exited.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), 5_000)
      }),
    ])
    if (!stopped) {
      child.kill("SIGKILL")
      await child.exited
    }
  } finally {
    clearTimeout(timer)
  }
}

async function buddyAttempt(
  options: Options,
  root: string,
  environment: Record<string, string>,
): Promise<BuddyAttempt> {
  let child: OwnedBackend | undefined
  let sessionID: string | undefined
  let stopMode: "graceful" | "immediate" = "immediate"
  try {
    const directory = await realpath(path.join(root, "notebook"))
    const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
    const port = reservation.port
    await reservation.stop(true)
    const baseURL = `http://127.0.0.1:${port}`
    const command =
      options.launch.kind === "binary"
        ? [options.launch.binary]
        : [
            process.execPath,
            "--no-env-file",
            "run",
            "--preload",
            path.join(backendPackage, "src/dev/opencode-branding-preload.ts"),
            path.join(backendPackage, "src/index.ts"),
          ]
    child = Bun.spawn([...command, "serve", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: directory,
      env: { ...environment, PORT: String(port) },
      stdin: "pipe",
      stdout: Bun.file(path.join(root, "backend.stdout")),
      stderr: Bun.file(path.join(root, "backend.stderr")),
      windowsHide: true,
    })
    const deadline = Date.now() + options.deadlineMs
    const startupDeadline = Math.min(deadline, Date.now() + 45_000)
    let healthy = false
    while (Date.now() < startupDeadline) {
      if (child.exitCode !== null)
        return { result: failure("startup", `Backend exited with ${child.exitCode}`), sessionID }
      const health = await request(
        new URL("/api/health", baseURL),
        { headers: { authorization } },
        Math.min(startupDeadline, Date.now() + 1_000),
      )
      if (health.ok) {
        const body = await readJson(health.value, z.object({ healthy: z.literal(true) }))
        if (body.ok) {
          healthy = true
          break
        }
      }
      await Bun.sleep(200)
    }
    if (!healthy)
      return { result: failure("startup", "Backend health deadline expired"), sessionID }
    const headers = { authorization, "content-type": "application/json" }
    const created = await request(
      route(baseURL, "session", directory),
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "Free model live smoke",
          agent: "buddy",
          model: { providerID: "opencode", modelID: options.model },
        }),
      },
      deadline,
    )
    if (!created.ok) return { result: created, sessionID }
    const session = await readJson(created.value, sessionSchema)
    if (!session.ok) return { result: session, sessionID }
    sessionID = session.value.id
    console.log(
      `Buddy session ${sessionID}; model opencode/${options.model}; ${options.launch.kind} mode`,
    )
    const queued = await request(
      route(baseURL, `session/${sessionID}/prompt_async`, directory),
      {
        method: "POST",
        headers,
        body: JSON.stringify(freeModelPrompt(options.model)),
      },
      deadline,
    )
    if (!queued.ok) return { result: queued, sessionID }
    await queued.value.body?.cancel()
    while (Date.now() < deadline) {
      if (child.exitCode !== null)
        return { result: failure("assistant", `Backend exited with ${child.exitCode}`), sessionID }
      const statusResponse = await request(
        route(baseURL, "session/status", directory),
        { headers },
        Math.min(deadline, Date.now() + 1_000),
      )
      if (!statusResponse.ok) return { result: statusResponse, sessionID }
      const statuses = await readJson(statusResponse.value, statusesSchema)
      if (!statuses.ok) return { result: statuses, sessionID }
      const status = statuses.value[sessionID]
      if (status?.type === "retry") {
        return {
          result: failure(
            "retry",
            `Stopped before retry ${status.attempt ?? ""}: ${status.message ?? "upstream request failed"}`,
          ),
          sessionID,
        }
      }
      const response = await request(
        route(baseURL, `session/${sessionID}/message`, directory),
        { headers },
        Math.min(deadline, Date.now() + 1_000),
      )
      if (!response.ok) return { result: response, sessionID }
      const messages = await readJson(response.value, messagesSchema)
      if (!messages.ok) return { result: messages, sessionID }
      for (const message of messages.value) {
        const info = message.info
        if (info.role !== "assistant" || info.sessionID !== sessionID) continue
        if (info.error)
          return { result: failure("assistant", info.error.message ?? info.error.name), sessionID }
        if (
          info.agent !== "buddy" ||
          info.providerID !== "opencode" ||
          info.modelID !== options.model
        )
          continue
        const text = message.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text ?? "")
          .join("")
          .trim()
        if (
          info.time.completed !== undefined &&
          info.finish &&
          !["tool-calls", "tool_calls"].includes(info.finish) &&
          text
        ) {
          stopMode = "graceful"
          return { result: { ok: true, value: { text, sessionID } }, sessionID }
        }
      }
      await Bun.sleep(100)
    }
    return {
      result: failure("assistant", `No completed assistant text within ${options.deadlineMs}ms`),
      sessionID,
    }
  } catch (cause) {
    return { result: failure("buddy", errorMessage(cause), cause), sessionID }
  } finally {
    if (child) await stopBackend(child, stopMode)
  }
}

async function controlIdentity(
  existingSessionID: string | undefined,
): Promise<Result<ControlIdentity>> {
  try {
    return { ok: true, value: createFreeModelControlIdentity(existingSessionID) }
  } catch (cause) {
    return failure("control", `Could not create a session ID: ${errorMessage(cause)}`, cause)
  }
}

async function controlAttempt(options: Options, sessionID: string | undefined): Promise<Attempt> {
  const identity = await controlIdentity(sessionID)
  if (!identity.ok) return identity
  const response = await request(
    controlEndpoint,
    {
      method: "POST",
      headers: {
        authorization: "Bearer public",
        "content-type": "application/json",
        "user-agent": identity.value.userAgent,
        "x-opencode-client": "buddy",
        "x-opencode-session-id": identity.value.sessionID,
        "x-opencode-session": identity.value.sessionID,
      },
      body: JSON.stringify({
        model: options.model,
        stream: true,
        messages: [
          { role: "system", content: "<env>\nWorking directory: /\n</env>" },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "read",
              description: "Read a file.",
              parameters: {
                type: "object",
                properties: { path: { type: "string" } },
                required: ["path"],
                additionalProperties: false,
              },
            },
          },
        ],
      }),
    },
    Date.now() + Math.min(options.deadlineMs, 45_000),
  )
  if (!response.ok) return response
  if (!response.value.headers.get("content-type")?.includes("text/event-stream")) {
    await response.value.body?.cancel()
    return failure("control", "Expected a streaming event response")
  }
  if (!response.value.body) return failure("control", "Streaming response has no body")
  const reader = response.value.body.getReader()
  const decoder = new TextDecoder()
  let pending = ""
  let text = ""
  let completed = false
  try {
    while (true) {
      const chunk = await reader.read()
      pending += decoder.decode(chunk.value, { stream: !chunk.done })
      const lines = pending.split("\n")
      pending = lines.pop() ?? ""
      if (chunk.done && pending) lines.push(pending)
      for (const line of lines) {
        if (!line.startsWith("data:")) continue
        const data = line.slice(5).trim()
        if (!data || data === "[DONE]") continue
        const parsed = streamChunkSchema.safeParse(JSON.parse(data))
        if (!parsed.success) return failure("control", "Malformed streaming completion")
        if (parsed.data.error !== undefined)
          return failure("control", `Provider error: ${JSON.stringify(parsed.data.error)}`)
        for (const choice of parsed.data.choices ?? []) {
          if (choice.index !== 0) continue
          text += choice.delta?.content ?? ""
          if (
            choice.finish_reason &&
            !["tool_calls", "function_call"].includes(choice.finish_reason)
          )
            completed = true
        }
      }
      if (completed && text.trim())
        return { ok: true, value: { text: text.trim(), sessionID: identity.value.sessionID } }
      if (chunk.done) return failure("control", "Stream ended without completed assistant text")
    }
  } catch (cause) {
    return failure("control", errorMessage(cause), cause)
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

async function reportBackendLogs(root: string): Promise<void> {
  for (const filename of ["backend.stdout", "backend.stderr"]) {
    const log = await readFile(path.join(root, filename), "utf8").catch(() => "")
    if (log.trim()) console.error(`${filename}:\n${log.slice(-12_000)}`)
  }
}

async function main(): Promise<number> {
  const parsed = parseOptions(process.argv.slice(2))
  if (!parsed.ok) {
    console.error(`INCONCLUSIVE: ${parsed.error.message}`)
    console.error(
      "Usage: bun smoke-free-models.ts [--source | --binary PATH] [--model beam-free] [--deadline-ms 120000]",
    )
    return 2
  }
  let root: string | undefined
  try {
    root = await mkdtemp(path.join(os.tmpdir(), "buddy-free-model-smoke-"))
    const environment = await isolatedEnvironment(root)
    process.env = environment
    const buddy = await buddyAttempt(parsed.value, root, environment)
    if (buddy.result.ok) {
      console.log(
        `PASS: Buddy completed assistant text: ${JSON.stringify(buddy.result.value.text)}`,
      )
      return 0
    }
    console.error(`Buddy failed: ${buddy.result.error.message}`)
    await reportBackendLogs(root)
    console.log("Running one direct Bun positive control")
    const control = await controlAttempt(parsed.value, buddy.sessionID)
    if (control.ok) {
      console.error(
        `FAIL: Buddy failed while the direct control passed: ${JSON.stringify(control.value.text)}`,
      )
      return 1
    }
    console.error(
      `INCONCLUSIVE: Buddy and the direct control both failed; ${control.error.message}`,
    )
    return 2
  } catch (cause) {
    console.error(`INCONCLUSIVE: ${errorMessage(cause)}`)
    return 2
  } finally {
    if (root) {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(
        (cause) => console.error(`Temporary smoke root cleanup failed: ${errorMessage(cause)}`),
      )
    }
  }
}

if (import.meta.main) process.exitCode = await main()
