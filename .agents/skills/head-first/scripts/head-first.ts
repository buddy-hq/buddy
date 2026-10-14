#!/usr/bin/env bun
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

type Label = "focus" | "parked" | "abandoned"
type SignalName = "recency" | "atRisk" | "unshipped" | "momentum"
type Weights = Record<SignalName, number>
type AgentName = "claude" | "codex" | "grok"

type ItemMemory = {
  intent?: string
  label?: Label
  labelledAt?: string
  paths: string[]
  updatedAt: string
}

type WeightChange = {
  at: string
  winner: string
  loser: string
  reason?: string
  before: Weights
  after: Weights
}

type TodoSource = { path: string; unit?: string; note?: string; addedAt: string }

type State = {
  version: 1
  weights: Weights
  weightLog: WeightChange[]
  items: Record<string, ItemMemory>
  todoSources: TodoSource[]
  knownPaths: string[]
}

type Worktree = { path: string; head: string; branch?: string; prunable: boolean; isMain: boolean }
type Branch = { name: string; tip: string; tipTime: number; upstream?: string }

type PullRequest = {
  number: number
  state: "OPEN" | "MERGED" | "CLOSED"
  url: string
  title: string
  updatedAt: string
  mergedAt: string | null
  headRefName: string
  isDraft: boolean
}

type AgentSession = {
  agent: AgentName
  file: string
  cwd: string
  branch?: string
  lastActivity: number
  lastPrompt?: string
}

type DocTouched = { path: string; openTodos: number; entries: number }

type Unit = {
  id: string
  branch?: string
  worktree?: Worktree
  tip: string
  tipTime: number
  ahead: number
  behind: number
  aheadLines: number
  unpushed: number
  unpushedLines: number
  remoteRef?: string
  absorbed: boolean
  dirtyFiles: string[]
  dirtyLines: number
  dirtyMtime: number
  docs: DocTouched[]
  pr?: PullRequest
  sessions: AgentSession[]
  lastTouch: number
  activeDays: number
  signals: Weights
  score: number
  label?: Label
  intent?: string
  rank?: number
  previousRank?: number
}

type Cleanup = { id: string; reason: string; tip: string; commands: string[] }

type Snapshot = {
  at: string
  base: string
  weights: Weights
  ranked: { id: string; rank: number; score: number; signals: Weights }[]
}

type Repo = {
  cwdRoot: string
  commonDir: string
  storeDir: string
  base: string
  baseBranch: string
}

type Scan = {
  repo: Repo
  state: State
  now: number
  ranked: Unit[]
  cleanup: Cleanup[]
  units: Unit[]
  mainWorktree: string
}

const SIGNALS: readonly SignalName[] = ["recency", "atRisk", "unshipped", "momentum"]
const DEFAULT_WEIGHTS: Weights = { recency: 0.4, atRisk: 0.25, unshipped: 0.2, momentum: 0.15 }
const LABELS: readonly Label[] = ["focus", "parked", "abandoned"]
const HOME = os.homedir()
const DAY = 86_400_000
const SESSION_WINDOW_DAYS = 45
const RECENCY_TAU_DAYS = 3
const FOCUS_DECAY_DAYS = 10
const PARKED_MULTIPLIER = 0.3
const LEARNING_RATE = 0.1
const MIN_WEIGHT = 0.02
const PREFERENCE_MARGIN = 0.05
const STALE_DAYS = 30
const BACKUP_STALE_DAYS = 14
const IDLE_PR_DAYS = 14
const HEAD_BYTES = 1_048_576
const TAIL_BYTES = 262_144
const MAX_UNTRACKED_BYTES = 1_048_576
const MAX_DOCS_IN_SCAN = 5
const TODO_LINE = /^\s*[-*] \[ \]/
const TODO_HEADING = /^#{2,4}\s+(issue|todo|task|bug|finding)\b/i
const MAX_PREFERENCE_STEPS = 10
const MAX_PREFERENCE_SHIFT = 0.1
const TODO_DOC = /(todo|backlog|feedback|dogfood|findings|ledger|plan)/i

function fail(message: string): never {
  console.error(`head-first: ${message}`)
  process.exit(1)
}

function run(command: string[], cwd: string): { ok: boolean; out: string } {
  const result = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" })
  return { ok: result.exitCode === 0, out: result.stdout.toString() }
}

function git(cwd: string, ...args: string[]) {
  return run(["git", ...args], cwd)
}

function lines(text: string): string[] {
  return text.split("\n").filter((line) => line.length > 0)
}

function isoDate(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

function ago(ms: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

function tilde(p: string): string {
  return p.startsWith(HOME) ? `~${p.slice(HOME.length)}` : p
}

function within(child: string, parent: string): boolean {
  return child === parent || child.startsWith(`${parent}/`)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function logScale(value: number, decades: number): number {
  return Math.min(1, Math.log10(1 + value) / decades)
}

function openRepo(): Repo {
  const cwd = process.cwd()
  const top = git(cwd, "rev-parse", "--show-toplevel")
  if (!top.ok) fail("run inside a Buddy checkout or worktree")
  const commonDir = git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir").out.trim()
  const originHead = git(cwd, "symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD")
  const hasOriginMain = git(cwd, "rev-parse", "--verify", "--quiet", "refs/remotes/origin/main").ok
  const base = originHead.ok ? originHead.out.trim() : hasOriginMain ? "origin/main" : "main"
  return {
    cwdRoot: top.out.trim(),
    commonDir,
    storeDir: path.join(commonDir, "head-first"),
    base,
    baseBranch: base.replace(/^origin\//, ""),
  }
}

function defaultState(): State {
  return { version: 1, weights: { ...DEFAULT_WEIGHTS }, weightLog: [], items: {}, todoSources: [], knownPaths: [] }
}

function loadState(repo: Repo): State {
  const file = path.join(repo.storeDir, "state.json")
  if (!fs.existsSync(file)) return defaultState()
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<State>
  return { ...defaultState(), ...parsed, weights: { ...DEFAULT_WEIGHTS, ...parsed.weights } }
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(temporary, file)
}

function saveState(repo: Repo, state: State) {
  writeJson(path.join(repo.storeDir, "state.json"), state)
}

function memoryFor(state: State, id: string): ItemMemory {
  const existing = state.items[id]
  if (existing) return existing
  const created: ItemMemory = { paths: [], updatedAt: new Date().toISOString() }
  state.items[id] = created
  return created
}

function listWorktrees(repo: Repo): Worktree[] {
  const blocks = git(repo.cwdRoot, "worktree", "list", "--porcelain").out.split("\n\n")
  const worktrees: Worktree[] = []
  for (const block of blocks) {
    const fields = lines(block)
    const pathLine = fields.find((field) => field.startsWith("worktree "))
    if (!pathLine) continue
    const branchLine = fields.find((field) => field.startsWith("branch "))
    worktrees.push({
      path: pathLine.slice("worktree ".length),
      head: fields.find((field) => field.startsWith("HEAD "))?.slice("HEAD ".length) ?? "",
      branch: branchLine?.slice("branch refs/heads/".length),
      prunable: fields.some((field) => field.startsWith("prunable")),
      isMain: worktrees.length === 0,
    })
  }
  return worktrees
}

function listBranches(repo: Repo): Branch[] {
  const format = "%(refname:short)%09%(objectname)%09%(committerdate:unix)%09%(upstream:short)"
  return lines(git(repo.cwdRoot, "for-each-ref", "refs/heads", `--format=${format}`).out).map((line) => {
    const [name = "", tip = "", time = "0", upstream = ""] = line.split("\t")
    return { name, tip, tipTime: Number(time) * 1000, upstream: upstream || undefined }
  })
}

function listPullRequests(repo: Repo): Map<string, PullRequest> {
  const fields = "number,state,url,title,updatedAt,mergedAt,headRefName,isDraft"
  const result = run(["gh", "pr", "list", "--state", "all", "--limit", "300", "--json", fields], repo.cwdRoot)
  const byBranch = new Map<string, PullRequest>()
  if (!result.ok) return byBranch
  const prs = JSON.parse(result.out) as PullRequest[]
  for (const pr of prs) {
    const current = byBranch.get(pr.headRefName)
    if (!current || pr.state === "OPEN" || (current.state !== "OPEN" && pr.updatedAt > current.updatedAt)) {
      byBranch.set(pr.headRefName, pr)
    }
  }
  return byBranch
}

function count(repo: Repo, range: string): number {
  return Number(git(repo.cwdRoot, "rev-list", "--count", range).out.trim() || 0)
}

function numstatLines(output: string): number {
  let total = 0
  for (const line of lines(output)) {
    const [added = "0", deleted = "0"] = line.split("\t")
    total += (Number(added) || 0) + (Number(deleted) || 0)
  }
  return total
}

function refExists(repo: Repo, ref: string): boolean {
  return git(repo.cwdRoot, "rev-parse", "--verify", "--quiet", ref).ok
}

function readSlice(file: string, fromEnd: boolean, bytes: number): string {
  const descriptor = fs.openSync(file, "r")
  try {
    const size = fs.fstatSync(descriptor).size
    const length = Math.min(size, bytes)
    const buffer = Buffer.alloc(length)
    fs.readSync(descriptor, buffer, 0, length, fromEnd ? size - length : 0)
    return buffer.toString("utf8")
  } finally {
    fs.closeSync(descriptor)
  }
}

function parseJsonLines(text: string): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = []
  for (const line of text.split("\n")) {
    if (!line.startsWith("{")) continue
    try {
      entries.push(JSON.parse(line) as Record<string, unknown>)
    } catch {
      continue
    }
  }
  return entries
}

function field(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined
}

function humanText(content: unknown): string | undefined {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return undefined
  if (content.some((part) => field(part, "type") === "tool_result")) return undefined
  const texts = content
    .filter((part) => field(part, "type") === "text" || field(part, "type") === "input_text")
    .map((part) => field(part, "text"))
    .filter((text): text is string => typeof text === "string")
  return texts.length > 0 ? texts.join("\n") : undefined
}

function promptPreview(text: string | undefined): string | undefined {
  if (!text) return undefined
  const trimmed = text.trim()
  if (trimmed.length === 0 || trimmed.startsWith("<")) return undefined
  const flat = trimmed.replace(/\s+/g, " ")
  return flat.length > 200 ? `${flat.slice(0, 200)}…` : flat
}

function recentFiles(directory: string, cutoff: number, extension: string): string[] {
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.join(directory, entry.name))
    .filter((file) => fs.statSync(file).mtimeMs >= cutoff)
}

function claudeSessions(cutoff: number): AgentSession[] {
  const root = path.join(HOME, ".claude", "projects")
  if (!fs.existsSync(root)) return []
  const sessions: AgentSession[] = []
  for (const project of fs.readdirSync(root)) {
    for (const file of recentFiles(path.join(root, project), cutoff, ".jsonl")) {
      const entries = parseJsonLines(readSlice(file, true, TAIL_BYTES)).reverse()
      const located = entries.find((entry) => typeof entry.cwd === "string")
      if (!located) continue
      const prompt = entries.find(
        (entry) =>
          entry.type === "user" &&
          entry.isSidechain !== true &&
          entry.isMeta !== true &&
          promptPreview(humanText(field(entry.message, "content"))) !== undefined,
      )
      sessions.push({
        agent: "claude",
        file,
        cwd: located.cwd as string,
        branch: typeof located.gitBranch === "string" ? located.gitBranch : undefined,
        lastActivity: fs.statSync(file).mtimeMs,
        lastPrompt: prompt ? promptPreview(humanText(field(prompt.message, "content"))) : undefined,
      })
    }
  }
  return sessions
}

function codexSessions(cutoff: number, now: number): AgentSession[] {
  const root = path.join(HOME, ".codex", "sessions")
  const sessions: AgentSession[] = []
  for (let day = 0; day <= SESSION_WINDOW_DAYS; day += 1) {
    const [year, month, date] = isoDate(now - day * DAY).split("-")
    for (const file of recentFiles(path.join(root, year ?? "", month ?? "", date ?? ""), cutoff, ".jsonl")) {
      const head = readSlice(file, false, HEAD_BYTES)
      const meta = parseJsonLines(head.slice(0, head.indexOf("\n") + 1))[0]
      const payload = field(meta, "payload")
      const cwd = field(payload, "cwd")
      if (typeof cwd !== "string") continue
      const branch = field(field(payload, "git"), "branch")
      const prompt = parseJsonLines(readSlice(file, true, TAIL_BYTES))
        .reverse()
        .map((entry) => field(entry, "payload"))
        .filter((item) => field(item, "type") === "message" && field(item, "role") === "user")
        .map((item) => promptPreview(humanText(field(item, "content"))))
        .find((text) => text !== undefined)
      sessions.push({
        agent: "codex",
        file,
        cwd,
        branch: typeof branch === "string" ? branch : undefined,
        lastActivity: fs.statSync(file).mtimeMs,
        lastPrompt: prompt,
      })
    }
  }
  return sessions
}

function grokSessions(cutoff: number): AgentSession[] {
  const root = path.join(HOME, ".grok", "sessions")
  if (!fs.existsSync(root)) return []
  const sessions: AgentSession[] = []
  for (const encoded of fs.readdirSync(root)) {
    const cwd = decodeURIComponent(encoded)
    const projectDir = path.join(root, encoded)
    if (!fs.statSync(projectDir).isDirectory()) continue
    for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const sessionDir = path.join(projectDir, entry.name)
      const mtimes = fs
        .readdirSync(sessionDir)
        .map((name) => fs.statSync(path.join(sessionDir, name)).mtimeMs)
      const lastActivity = Math.max(fs.statSync(sessionDir).mtimeMs, ...mtimes)
      if (lastActivity < cutoff) continue
      sessions.push({ agent: "grok", file: sessionDir, cwd, lastActivity })
    }
  }
  return sessions
}

function parseStatus(output: string): { path: string; untracked: boolean }[] {
  const tokens = output.split("\0")
  const entries: { path: string; untracked: boolean }[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? ""
    if (token.length < 4) continue
    const code = token.slice(0, 2)
    entries.push({ path: token.slice(3), untracked: code === "??" })
    if (code.startsWith("R") || code.startsWith("C")) index += 1
  }
  return entries
}

function countFileLines(file: string): number {
  try {
    const stat = fs.statSync(file)
    if (!stat.isFile() || stat.size > MAX_UNTRACKED_BYTES) return 0
    return fs.readFileSync(file, "utf8").split("\n").length
  } catch {
    return 0
  }
}

function openTodosInText(text: string): number {
  return text.split("\n").filter((line) => TODO_LINE.test(line)).length
}

function todoEntriesInText(text: string): number {
  return text.split("\n").filter((line) => TODO_HEADING.test(line)).length
}

function describeDoc(doc: DocTouched): string {
  const counts = [doc.openTodos > 0 ? `${doc.openTodos} open` : "", doc.entries > 0 ? `${doc.entries} entries` : ""].filter(Boolean)
  return counts.length > 0 ? `${doc.path} (${counts.join(", ")})` : doc.path
}

function localStamp(ms: number): string {
  const date = new Date(ms)
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
  return `${isoDate(ms)} ${time}`
}

function isTodoDoc(file: string): boolean {
  return file.endsWith(".md") && (file.startsWith("docs/") || TODO_DOC.test(path.basename(file)))
}

function readDoc(repo: Repo, unit: Pick<Unit, "worktree" | "tip">, file: string): string | undefined {
  if (unit.worktree) {
    const absolute = path.join(unit.worktree.path, file)
    return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : undefined
  }
  const shown = git(repo.cwdRoot, "show", `${unit.tip}:${file}`)
  return shown.ok ? shown.out : undefined
}

function buildUnit(
  repo: Repo,
  state: State,
  id: string,
  tip: string,
  tipTime: number,
  branch: Branch | undefined,
  worktree: Worktree | undefined,
  pr: PullRequest | undefined,
): Unit {
  const [behind = 0, ahead = 0] = git(repo.cwdRoot, "rev-list", "--left-right", "--count", `${repo.base}...${tip}`)
    .out.trim()
    .split(/\s+/)
    .map(Number)
  const aheadFiles = ahead > 0 ? lines(git(repo.cwdRoot, "diff", "--name-only", `${repo.base}...${tip}`).out) : []
  const aheadLines = ahead > 0 ? numstatLines(git(repo.cwdRoot, "diff", "--numstat", `${repo.base}...${tip}`).out) : 0
  const contentInBase =
    ahead === 0 ||
    aheadFiles.length === 0 ||
    git(repo.cwdRoot, "diff", "--quiet", repo.base, tip, "--", ...aheadFiles).ok
  const mergedBeforeTip = pr?.state === "MERGED" && pr.mergedAt !== null && Date.parse(pr.mergedAt) >= tipTime
  const remoteRef =
    branch?.upstream ?? (branch && refExists(repo, `refs/remotes/origin/${branch.name}`) ? `origin/${branch.name}` : undefined)
  const unpushed = remoteRef ? count(repo, `${remoteRef}..${tip}`) : ahead
  const unpushedLines =
    unpushed === 0
      ? 0
      : remoteRef
        ? numstatLines(git(repo.cwdRoot, "diff", "--numstat", `${remoteRef}...${tip}`).out)
        : aheadLines

  let dirtyFiles: string[] = []
  let dirtyLines = 0
  let dirtyMtime = 0
  if (worktree && !worktree.prunable) {
    const status = parseStatus(git(worktree.path, "status", "--porcelain=v1", "-z", "--untracked-files=all").out)
    dirtyFiles = status.map((entry) => entry.path)
    dirtyLines = numstatLines(git(worktree.path, "diff", "HEAD", "--numstat").out)
    for (const entry of status) {
      const absolute = path.join(worktree.path, entry.path)
      if (entry.untracked) dirtyLines += countFileLines(absolute)
      if (fs.existsSync(absolute)) dirtyMtime = Math.max(dirtyMtime, fs.statSync(absolute).mtimeMs)
    }
  }

  const unit: Unit = {
    id,
    branch: branch?.name,
    worktree,
    tip,
    tipTime,
    ahead,
    behind,
    aheadLines,
    unpushed,
    unpushedLines,
    remoteRef,
    absorbed: contentInBase || mergedBeforeTip,
    dirtyFiles,
    dirtyLines,
    dirtyMtime,
    docs: [],
    pr,
    sessions: [],
    lastTouch: 0,
    activeDays: 0,
    signals: { recency: 0, atRisk: 0, unshipped: 0, momentum: 0 },
    score: 0,
    label: state.items[id]?.label,
    intent: state.items[id]?.intent,
  }
  const docFiles = [...new Set([...aheadFiles, ...dirtyFiles])].filter(isTodoDoc)
  unit.docs = docFiles.map((file) => {
    const text = readDoc(repo, unit, file) ?? ""
    return { path: file, openTodos: openTodosInText(text), entries: todoEntriesInText(text) }
  })
  return unit
}

function commitDays(repo: Repo, unit: Unit, since: number): string[] {
  if (unit.ahead === 0) return []
  const output = git(repo.cwdRoot, "log", "--format=%ct", `--since=${Math.floor(since / 1000)}`, `${repo.base}..${unit.tip}`)
  return lines(output.out).map((seconds) => isoDate(Number(seconds) * 1000))
}

function scoreUnit(repo: Repo, state: State, unit: Unit, now: number) {
  const sessionTouch = unit.sessions.reduce((latest, session) => Math.max(latest, session.lastActivity), 0)
  const commitTouch = unit.ahead > 0 ? unit.tipTime : 0
  unit.lastTouch = Math.max(commitTouch, unit.dirtyMtime, sessionTouch) || unit.tipTime
  const weekAgo = now - 7 * DAY
  const days = new Set<string>(commitDays(repo, unit, weekAgo))
  for (const session of unit.sessions) if (session.lastActivity >= weekAgo) days.add(isoDate(session.lastActivity))
  if (unit.dirtyMtime >= weekAgo) days.add(isoDate(unit.dirtyMtime))
  unit.activeDays = days.size

  const openOrMerged = unit.pr && (unit.pr.state === "OPEN" || (unit.pr.state === "MERGED" && unit.absorbed))
  unit.signals = {
    recency: round2(Math.exp(-(now - unit.lastTouch) / DAY / RECENCY_TAU_DAYS)),
    atRisk: round2(logScale(unit.dirtyLines + unit.unpushedLines, 3)),
    unshipped: round2(openOrMerged || unit.absorbed ? 0 : logScale(unit.aheadLines, 3)),
    momentum: round2(Math.min(1, unit.activeDays / 7)),
  }
  let score = SIGNALS.reduce((total, signal) => total + state.weights[signal] * unit.signals[signal], 0)
  const memory = state.items[unit.id]
  if (unit.label === "focus") {
    const labelledAt = memory?.labelledAt ? Date.parse(memory.labelledAt) : now
    score += Math.exp(-(now - labelledAt) / DAY / FOCUS_DECAY_DAYS)
  }
  if (unit.label === "parked") score *= PARKED_MULTIPLIER
  unit.score = round2(score)
}

function sessionOwner(
  session: AgentSession,
  units: Unit[],
  branchNames: Set<string>,
  siblingParents: Set<string>,
  knownPaths: string[],
): Unit | undefined {
  const byWorktree = units
    .filter((unit) => unit.worktree && within(session.cwd, unit.worktree.path))
    .sort((left, right) => (right.worktree?.path.length ?? 0) - (left.worktree?.path.length ?? 0))[0]
  const branchKnown = session.branch !== undefined && branchNames.has(session.branch)
  if (byWorktree) {
    if (session.branch === undefined || session.branch === "HEAD") return byWorktree
    return branchKnown ? units.find((unit) => unit.branch === session.branch) : undefined
  }
  if (!branchKnown) return undefined
  const nearRepo =
    knownPaths.some((known) => within(session.cwd, known)) ||
    [...siblingParents].some((parent) => path.dirname(session.cwd) === parent || within(session.cwd, parent))
  return nearRepo ? units.find((unit) => unit.branch === session.branch) : undefined
}

function cleanupFor(unit: Unit, reason: string, repo: Repo): Cleanup {
  const commands: string[] = []
  const worktree = unit.worktree
  if (worktree && !worktree.isMain && worktree.path !== repo.cwdRoot) {
    commands.push(
      unit.dirtyFiles.length === 0
        ? `git worktree remove ${JSON.stringify(worktree.path)}`
        : `# ${unit.dirtyFiles.length} dirty files in ${tilde(worktree.path)}: resolve before removing`,
    )
  }
  if (unit.branch && worktree?.path !== repo.cwdRoot && !worktree?.isMain) commands.push(`git branch -D ${unit.branch}`)
  return { id: unit.id, reason, tip: unit.tip, commands }
}

function readSnapshots(repo: Repo): string[] {
  const directory = path.join(repo.storeDir, "snapshots")
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
}

function loadSnapshot(repo: Repo, name: string): Snapshot {
  return JSON.parse(fs.readFileSync(path.join(repo.storeDir, "snapshots", name), "utf8")) as Snapshot
}

function previousSnapshot(repo: Repo, today: string): Snapshot | undefined {
  const earlier = readSnapshots(repo).filter((name) => name < `${today}.json`)
  const latest = earlier.at(-1)
  return latest ? loadSnapshot(repo, latest) : undefined
}

function scan(repo: Repo): Scan {
  const now = Date.now()
  const state = loadState(repo)
  const worktrees = listWorktrees(repo)
  const branches = listBranches(repo)
  const prs = listPullRequests(repo)
  const worktreeByBranch = new Map(worktrees.filter((w) => w.branch).map((w) => [w.branch as string, w]))

  const units: Unit[] = branches.map((branch) =>
    buildUnit(repo, state, branch.name, branch.tip, branch.tipTime, branch, worktreeByBranch.get(branch.name), prs.get(branch.name)),
  )
  for (const worktree of worktrees.filter((w) => !w.branch && !w.prunable)) {
    const tipTime = Number(git(repo.cwdRoot, "show", "-s", "--format=%ct", worktree.head).out.trim()) * 1000
    units.push(buildUnit(repo, state, `detached:${tilde(worktree.path)}`, worktree.head, tipTime, undefined, worktree, undefined))
  }

  const cutoff = now - SESSION_WINDOW_DAYS * DAY
  const branchNames = new Set(branches.map((branch) => branch.name))
  const livePaths = worktrees.filter((w) => !w.prunable).map((w) => w.path)
  const siblingParents = new Set(livePaths.filter((p) => p !== worktrees[0]?.path).map((p) => path.dirname(p)))
  const knownPaths = [...new Set([...state.knownPaths, ...livePaths])]
  for (const session of [...claudeSessions(cutoff), ...codexSessions(cutoff, now), ...grokSessions(cutoff)]) {
    sessionOwner(session, units, branchNames, siblingParents, knownPaths)?.sessions.push(session)
  }
  for (const unit of units) {
    unit.sessions.sort((left, right) => right.lastActivity - left.lastActivity)
    scoreUnit(repo, state, unit, now)
  }

  const cleanup: Cleanup[] = []
  const ranked: Unit[] = []
  for (const unit of units) {
    const dirty = unit.dirtyFiles.length > 0
    const age = (now - unit.lastTouch) / DAY
    if (unit.branch === repo.baseBranch) {
      if (dirty) ranked.push(unit)
      continue
    }
    if (unit.label === "abandoned") {
      cleanup.push(cleanupFor(unit, "you marked it abandoned", repo))
      continue
    }
    if (unit.absorbed && !dirty) {
      const merged = unit.pr?.state === "MERGED" ? ` (PR #${unit.pr.number} merged)` : ""
      const reason =
        unit.ahead === 0
          ? `no commits beyond ${repo.base} and a clean tree; last touch ${ago(unit.lastTouch, now)} ago`
          : `content already in ${repo.base}${merged}`
      cleanup.push(cleanupFor(unit, reason, repo))
      continue
    }
    if (unit.branch?.startsWith("backup/")) {
      if (age > BACKUP_STALE_DAYS) cleanup.push(cleanupFor(unit, `backup untouched for ${Math.round(age)}d`, repo))
      continue
    }
    if (!unit.worktree && age > STALE_DAYS && unit.label !== "parked" && unit.label !== "focus") {
      cleanup.push(cleanupFor(unit, `no worktree and no activity for ${Math.round(age)}d`, repo))
      continue
    }
    if (unit.pr?.state === "OPEN" && (now - Date.parse(unit.pr.updatedAt)) / DAY > IDLE_PR_DAYS) {
      const idle = Math.round((now - Date.parse(unit.pr.updatedAt)) / DAY)
      cleanup.push({
        id: unit.id,
        reason: `PR #${unit.pr.number} idle for ${idle}d`,
        tip: unit.tip,
        commands: [`gh pr close ${unit.pr.number}`],
      })
    }
    ranked.push(unit)
  }
  for (const worktree of worktrees.filter((w) => w.prunable)) {
    cleanup.push({ id: `worktree:${tilde(worktree.path)}`, reason: "worktree directory is gone", tip: worktree.head, commands: ["git worktree prune"] })
  }

  ranked.sort((left, right) => right.score - left.score)
  const previous = previousSnapshot(repo, isoDate(now))
  ranked.forEach((unit, index) => {
    unit.rank = index + 1
    unit.previousRank = previous?.ranked.find((entry) => entry.id === unit.id)?.rank
  })

  state.knownPaths = knownPaths
  for (const unit of units) {
    if (!unit.worktree || unit.worktree.prunable) continue
    const memory = state.items[unit.id]
    if (memory && !memory.paths.includes(unit.worktree.path)) memory.paths.push(unit.worktree.path)
  }
  return { repo, state, now, ranked, cleanup, units, mainWorktree: worktrees[0]?.path ?? repo.cwdRoot }
}

function persistScan(result: Scan) {
  const snapshot: Snapshot = {
    at: new Date(result.now).toISOString(),
    base: result.repo.base,
    weights: result.state.weights,
    ranked: result.ranked.map((unit) => ({ id: unit.id, rank: unit.rank ?? 0, score: unit.score, signals: unit.signals })),
  }
  writeJson(path.join(result.repo.storeDir, "snapshots", `${isoDate(result.now)}.json`), snapshot)
  saveState(result.repo, result.state)
}

function describeState(unit: Unit): string {
  const parts: string[] = []
  if (unit.dirtyFiles.length > 0) parts.push(`${unit.dirtyFiles.length} dirty files (${unit.dirtyLines} lines)`)
  parts.push(`ahead ${unit.ahead} / behind ${unit.behind}`)
  if (unit.unpushed > 0) parts.push(unit.remoteRef ? `${unit.unpushed} unpushed` : "never pushed")
  if (unit.pr) parts.push(`PR #${unit.pr.number} ${unit.pr.isDraft ? "draft" : unit.pr.state.toLowerCase()}`)
  if (unit.absorbed && unit.ahead > 0) parts.push("committed work already in base")
  return parts.join(" · ")
}

function rankMove(unit: Unit): string {
  if (unit.previousRank === undefined) return "new"
  const delta = unit.previousRank - (unit.rank ?? 0)
  if (delta === 0) return "="
  return delta > 0 ? `↑${delta}` : `↓${-delta}`
}

function todoSourceLines(result: Scan): string[] {
  return result.state.todoSources.map((source) => {
    const owner = source.unit ? result.units.find((unit) => unit.id === source.unit) : undefined
    const text = owner
      ? readDoc(result.repo, owner, source.path)
      : fs.existsSync(path.join(result.mainWorktree, source.path))
        ? fs.readFileSync(path.join(result.mainWorktree, source.path), "utf8")
        : undefined
    const status =
      text === undefined
        ? "missing"
        : `${openTodosInText(text)} open checkboxes, ${todoEntriesInText(text)} issue/task headings`
    const where = source.unit ? ` @ ${source.unit}` : ""
    const note = source.note ? ` — ${source.note}` : ""
    return `- ${source.path}${where}: ${status}${note}`
  })
}

function printScan(result: Scan) {
  const { repo, state, now } = result
  const weights = SIGNALS.map((signal) => `${signal} ${state.weights[signal].toFixed(2)}`).join(" · ")
  const out: string[] = [`# head-first ${isoDate(now)} · base ${repo.base}`, `weights: ${weights}`, "", "## Ranked"]
  for (const unit of result.ranked) {
    const label = unit.label ? ` [${unit.label}]` : ""
    const where = unit.worktree ? tilde(unit.worktree.path) : "no worktree"
    const agents = [...new Set(unit.sessions.map((session) => session.agent))].join(", ") || "none"
    const signals = SIGNALS.map((signal) => `${signal} ${unit.signals[signal].toFixed(2)}`).join(" ")
    out.push(`${unit.rank}. **${unit.id}** ${unit.score.toFixed(2)} (${rankMove(unit)})${label}`)
    out.push(`   where: ${where} · last touch ${ago(unit.lastTouch, now)} ago · active ${unit.activeDays}/7d · agents: ${agents}`)
    out.push(`   state: ${describeState(unit)}`)
    out.push(`   signals: ${signals}`)
    out.push(`   intent: ${unit.intent ?? "UNKNOWN"}`)
    const prompt = unit.sessions.find((session) => session.lastPrompt)
    if (prompt) out.push(`   last prompt (${prompt.agent}, ${ago(prompt.lastActivity, now)} ago): ${prompt.lastPrompt}`)
    if (unit.docs.length > 0) {
      const byTodos = [...unit.docs].sort((left, right) => right.openTodos + right.entries - (left.openTodos + left.entries))
      const shown = byTodos.slice(0, MAX_DOCS_IN_SCAN).map(describeDoc)
      const more = unit.docs.length > MAX_DOCS_IN_SCAN ? ` +${unit.docs.length - MAX_DOCS_IN_SCAN} more` : ""
      out.push(`   docs: ${shown.join(", ")}${more}`)
    }
  }
  out.push("", "## Cleanup candidates")
  if (result.cleanup.length === 0) out.push("- none")
  for (const item of result.cleanup) {
    out.push(`- **${item.id}**: ${item.reason} · tip ${item.tip.slice(0, 9)}`)
    for (const command of item.commands) out.push(`  - \`${command}\``)
  }
  out.push("", "## To-do sources")
  const sources = todoSourceLines(result)
  out.push(...(sources.length > 0 ? sources : ["- none recorded yet"]))
  console.log(out.join("\n"))
}

function resolveUnit(result: Scan, query: string): Unit {
  const exact = result.units.find((unit) => unit.id === query)
  if (exact) return exact
  const matches = result.units.filter(
    (unit) =>
      unit.id.includes(query) ||
      (unit.worktree && (path.basename(unit.worktree.path) === query || path.basename(path.dirname(unit.worktree.path)) === query)),
  )
  if (matches.length === 1 && matches[0]) return matches[0]
  if (matches.length === 0) fail(`no unit matches "${query}"`)
  fail(`"${query}" is ambiguous: ${matches.map((unit) => unit.id).join(", ")}`)
}

function printShow(result: Scan, unit: Unit) {
  const { repo, now } = result
  const out: string[] = [`# ${unit.id}`, `state: ${describeState(unit)}`]
  if (unit.worktree) out.push(`worktree: ${unit.worktree.path}`)
  if (unit.pr) out.push(`pr: ${unit.pr.url} — ${unit.pr.title}`)
  out.push(`label: ${unit.label ?? "none"} · intent: ${unit.intent ?? "UNKNOWN"}`)
  out.push("", "## Commits ahead of base")
  const log = git(repo.cwdRoot, "log", "--format=%h %cs %s", "-n", "30", `${repo.base}..${unit.tip}`).out
  out.push(...(lines(log).length > 0 ? lines(log).map((line) => `- ${line}`) : ["- none"]))
  out.push("", "## Dirty files")
  out.push(...(unit.dirtyFiles.length > 0 ? unit.dirtyFiles.slice(0, 60).map((file) => `- ${file}`) : ["- none"]))
  if (unit.dirtyFiles.length > 60) out.push(`- … ${unit.dirtyFiles.length - 60} more`)
  out.push("", "## Docs")
  out.push(...(unit.docs.length > 0 ? unit.docs.map((doc) => `- ${describeDoc(doc)}`) : ["- none"]))
  out.push("", "## Agent sessions (newest first; read whole files when intent is unclear)")
  if (unit.sessions.length === 0) out.push("- none found")
  for (const session of unit.sessions) {
    const prompt = session.lastPrompt ? ` — ${session.lastPrompt}` : ""
    out.push(`- ${session.agent} · ${ago(session.lastActivity, now)} ago · ${session.file}${prompt}`)
  }
  const memory = result.state.items[unit.id]
  if (memory && memory.paths.length > 0) out.push("", `known paths: ${memory.paths.map(tilde).join(", ")}`)
  console.log(out.join("\n"))
}

function prefer(repo: Repo, state: State, winnerQuery: string, loserQuery: string, reason: string | undefined) {
  const names = readSnapshots(repo)
  const latest = names.at(-1)
  if (!latest) fail("run `scan` before recording preferences")
  const snapshot = loadSnapshot(repo, latest)
  const find = (query: string) => {
    const matches = snapshot.ranked.filter((entry) => entry.id === query || entry.id.includes(query))
    const exact = matches.find((entry) => entry.id === query)
    if (exact) return exact
    if (matches.length === 1 && matches[0]) return matches[0]
    fail(`"${query}" must match exactly one ranked unit in the latest snapshot`)
  }
  const winner = find(winnerQuery)
  const loser = find(loserQuery)
  const before = { ...state.weights }
  const dot = (signals: Weights) => SIGNALS.reduce((total, signal) => total + state.weights[signal] * signals[signal], 0)
  const shift = () => SIGNALS.reduce((total, signal) => total + Math.abs(state.weights[signal] - before[signal]), 0)
  for (
    let step = 0;
    step < MAX_PREFERENCE_STEPS && shift() < MAX_PREFERENCE_SHIFT && dot(winner.signals) - dot(loser.signals) < PREFERENCE_MARGIN;
    step += 1
  ) {
    for (const signal of SIGNALS) {
      const delta = LEARNING_RATE * (winner.signals[signal] - loser.signals[signal])
      state.weights[signal] = Math.max(MIN_WEIGHT, state.weights[signal] + delta)
    }
    const total = SIGNALS.reduce((sum, signal) => sum + state.weights[signal], 0)
    for (const signal of SIGNALS) state.weights[signal] = state.weights[signal] / total
  }
  const overshoot = shift()
  if (overshoot > MAX_PREFERENCE_SHIFT) {
    const scale = MAX_PREFERENCE_SHIFT / overshoot
    for (const signal of SIGNALS) {
      state.weights[signal] = before[signal] + (state.weights[signal] - before[signal]) * scale
    }
  }
  const flipped = dot(winner.signals) > dot(loser.signals)
  state.weightLog.push({ at: new Date().toISOString(), winner: winner.id, loser: loser.id, reason, before, after: { ...state.weights } })
  saveState(repo, state)
  const describe = (weights: Weights) => SIGNALS.map((signal) => `${signal} ${weights[signal].toFixed(2)}`).join(" · ")
  console.log(`before: ${describe(before)}\nafter:  ${describe(state.weights)}`)
  if (!flipped) {
    console.log(`signals cannot put ${winner.id} above ${loser.id}; use \`label ${winner.id} focus\` or \`label ${loser.id} parked\``)
  }
}

function appendJournal(repo: Repo, text: string) {
  const file = path.join(repo.storeDir, "journal.md")
  fs.mkdirSync(repo.storeDir, { recursive: true })
  const stamp = localStamp(Date.now())
  fs.appendFileSync(file, `\n## ${stamp} · ${path.basename(repo.cwdRoot)}\n\n${text.trim()}\n`)
}

function printJournal(repo: Repo, entries: number) {
  const file = path.join(repo.storeDir, "journal.md")
  if (!fs.existsSync(file)) {
    console.log("journal is empty")
    return
  }
  const sections = fs.readFileSync(file, "utf8").split(/\n(?=## )/).filter((section) => section.trim().length > 0)
  console.log(sections.slice(-entries).join("\n").trim())
}

function printWeights(state: State) {
  const out = [SIGNALS.map((signal) => `${signal} ${state.weights[signal].toFixed(2)}`).join(" · "), "", "## History"]
  for (const change of state.weightLog.slice(-20)) {
    const reason = change.reason ? ` — ${change.reason}` : ""
    out.push(`- ${localStamp(Date.parse(change.at))} ${change.winner} > ${change.loser}${reason}`)
  }
  console.log(out.join("\n"))
}

const USAGE = `usage: head-first.ts <command>
  scan [--json]                 rank all worktrees and branches, save today's snapshot
  show <unit>                   commits, dirty files, docs and agent session files for one unit
  note <unit> <intent...>       record what the work is about
  label <unit> <focus|parked|abandoned|clear>
  prefer <winner> <loser> [reason...]   learn from a ranking correction
  todo <path> [--unit <unit>] [note...] record where to-dos live
  log <text...>                 append to the shared journal
  journal [entries]             print the latest journal entries (default 5)
  weights                       show weights and correction history`

function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!command || command === "help" || command === "--help") {
    console.log(USAGE)
    return
  }
  const repo = openRepo()
  if (command === "scan") {
    const result = scan(repo)
    persistScan(result)
    if (args.includes("--json")) console.log(JSON.stringify({ ranked: result.ranked, cleanup: result.cleanup }, null, 2))
    else printScan(result)
    return
  }
  if (command === "show") {
    const result = scan(repo)
    printShow(result, resolveUnit(result, args[0] ?? fail("show needs a unit")))
    return
  }
  if (command === "note" || command === "label") {
    const result = scan(repo)
    const unit = resolveUnit(result, args[0] ?? fail(`${command} needs a unit`))
    const memory = memoryFor(result.state, unit.id)
    const now = new Date().toISOString()
    if (command === "note") {
      const intent = args.slice(1).join(" ").trim()
      if (!intent) fail("note needs intent text")
      memory.intent = intent
    } else {
      const value = args[1]
      if (value === "clear") {
        memory.label = undefined
        memory.labelledAt = undefined
      } else if (LABELS.includes(value as Label)) {
        memory.label = value as Label
        memory.labelledAt = now
      } else fail(`label must be one of ${LABELS.join(", ")}, clear`)
    }
    memory.updatedAt = now
    if (unit.worktree && !memory.paths.includes(unit.worktree.path)) memory.paths.push(unit.worktree.path)
    saveState(repo, result.state)
    console.log(`${unit.id}: label ${memory.label ?? "none"} · intent ${memory.intent ?? "UNKNOWN"}`)
    return
  }
  if (command === "prefer") {
    const [winner, loser, ...reason] = args
    if (!winner || !loser) fail("prefer needs <winner> <loser>")
    prefer(repo, loadState(repo), winner, loser, reason.join(" ") || undefined)
    return
  }
  if (command === "todo") {
    const [file, ...rest] = args
    if (!file) fail("todo needs a path")
    const unitFlag = rest.indexOf("--unit")
    const unit = unitFlag >= 0 ? rest[unitFlag + 1] : undefined
    const note = rest.filter((_, index) => unitFlag < 0 || (index !== unitFlag && index !== unitFlag + 1)).join(" ")
    const state = loadState(repo)
    const unitId = unit ? resolveUnit(scan(repo), unit).id : undefined
    state.todoSources = state.todoSources.filter((source) => !(source.path === file && source.unit === unitId))
    state.todoSources.push({ path: file, unit: unitId, note: note || undefined, addedAt: new Date().toISOString() })
    saveState(repo, state)
    console.log(`recorded ${file}${unitId ? ` @ ${unitId}` : ""}`)
    return
  }
  if (command === "log") {
    const text = args.join(" ")
    if (!text.trim()) fail("log needs text")
    appendJournal(repo, text)
    console.log("logged")
    return
  }
  if (command === "journal") {
    printJournal(repo, Number(args[0] ?? 5))
    return
  }
  if (command === "weights") {
    printWeights(loadState(repo))
    return
  }
  fail(`unknown command "${command}"\n${USAGE}`)
}

main()
