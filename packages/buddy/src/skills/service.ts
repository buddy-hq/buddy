import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import matter from "gray-matter"
import { xdgCache } from "xdg-basedir"
import { Config as OpenCodeConfig } from "@buddy/opencode-adapter/config"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { PermissionNext, type PermissionAction } from "@buddy/opencode-adapter/permission"
import { ensureOpenCodeProjectOverlay } from "../config/compatibility.js"
import { Config } from "../config/config.js"
import { fetchOpenCode } from "../routes/support/proxy.js"
import { Global } from "../storage/global.js"

type PermissionRule = {
  permission: string
  pattern: string
  action: PermissionAction
}

type PermissionRuleset = PermissionRule[]

type OpenCodeSkill = {
  name: string
  description: string
  location: string
  content: string
}

type SkillSource = "custom" | "library" | "external"
export type SkillScope = "global" | "workspace"
export type SkillPermissionSource = "explicit" | "inherited" | "default"
export type SkillRuleAction = PermissionAction | "inherit"

export type InstalledSkillInfo = {
  name: string
  description: string
  location: string
  directory: string
  content: string
  examplePrompt?: string
  enabled: boolean
  permissionAction: PermissionAction
  permissionSource: SkillPermissionSource
  source: SkillSource
  scope: SkillScope
  managed: boolean
  removable: boolean
  libraryID?: string
}

export type SkillLibraryEntry = {
  id: string
  name: string
  description: string
  summary: string
  examplePrompt: string
  installed: boolean
}

export type SkillsCatalog = {
  directory: string
  managedRoot: string
  installed: InstalledSkillInfo[]
  library: SkillLibraryEntry[]
}

export type CreateCustomSkillInput = {
  name: string
  description: string
  examplePrompt?: string
  content: string
}

type PlaceholderLibrarySkill = Omit<SkillLibraryEntry, "installed"> & {
  content: string
}

const OPENCODE_SKILL_CACHE_ROOT = path.join(
  xdgCache ?? path.join(os.homedir(), ".cache"),
  "opencode",
  "skills",
)

function agentSkillsRoot() {
  return path.join(Global.Path.home, ".agents", "skills")
}

function managedSkillsRoot() {
  return path.join(agentSkillsRoot(), "buddy-managed")
}

function managedLibraryRoot() {
  return path.join(managedSkillsRoot(), "library")
}

function managedCustomRoot() {
  return path.join(managedSkillsRoot(), "custom")
}

function isWithinPath(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function resolveSkillScope(location: string): SkillScope {
  const normalizedLocation = path.resolve(location)
  const globalRoots = [
    path.join(Global.Path.home, ".agents", "skills"),
    path.join(Global.Path.home, ".claude", "skills"),
  ]

  if (globalRoots.some((root) => isWithinPath(root, normalizedLocation))) {
    return "global"
  }

  return "workspace"
}

function wildcardMatch(input: string, pattern: string) {
  const normalizedInput = input.replaceAll("\\", "/")
  let escapedPattern = pattern.replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")

  if (escapedPattern.endsWith(" .*")) {
    escapedPattern = escapedPattern.slice(0, -3) + "( .*)?"
  }

  const flags = process.platform === "win32" ? "si" : "s"
  return new RegExp(`^${escapedPattern}$`, flags).test(normalizedInput)
}

function matchSkillRule(name: string, ruleset: PermissionRuleset) {
  for (let index = ruleset.length - 1; index >= 0; index -= 1) {
    const rule = ruleset[index]
    if (!rule) continue
    if (!wildcardMatch("skill", rule.permission)) continue
    if (!wildcardMatch(name, rule.pattern)) continue
    return rule
  }

  return undefined
}

function resolveSkillPermission(name: string, ruleset: PermissionRuleset) {
  const matchedRule = matchSkillRule(name, ruleset)
  if (!matchedRule) {
    return {
      explicit: false,
      rule: {
        action: "ask",
        permission: "skill",
        pattern: "*",
      } satisfies PermissionRule,
    }
  }

  return {
    explicit: true,
    rule: matchedRule,
  }
}

const PLACEHOLDER_LIBRARY: PlaceholderLibrarySkill[] = [
  {
    id: "release-notes",
    name: "Release Notes",
    description: "Draft product-ready release notes from a diff or milestone summary.",
    summary: "Placeholder curated skill for turning completed work into a concise changelog and launch notes.",
    examplePrompt: "Use the release-notes skill to turn this week’s merged changes into a user-facing changelog.",
    content: [
      "Use this placeholder release-notes skill to draft a clean changelog.",
      "",
      "Workflow:",
      "1. Collect the relevant commits, PR titles, or milestone notes.",
      "2. Group changes by user impact, not by implementation detail.",
      "3. Call out breaking changes, migrations, and operational notes first.",
      "4. End with rollout or follow-up steps when needed.",
    ].join("\n"),
  },
  {
    id: "repo-audit",
    name: "Repo Audit",
    description: "Scan a repository and summarize architecture gaps, risks, and cleanup opportunities.",
    summary: "Placeholder curated skill for fast repository audits before larger refactors.",
    examplePrompt: "Use the repo-audit skill to review this repo and list the three highest-impact cleanup tasks.",
    content: [
      "Use this placeholder repo-audit skill to produce a fast technical audit.",
      "",
      "Focus areas:",
      "- runtime boundaries and ownership",
      "- stale or duplicated abstractions",
      "- risky config or missing validation",
      "- missing tests around important flows",
    ].join("\n"),
  },
  {
    id: "docs-polish",
    name: "Docs Polish",
    description: "Refine developer-facing docs, quick starts, and handoff notes.",
    summary: "Placeholder curated skill for tightening docs without rewriting the whole system.",
    examplePrompt: "Use the docs-polish skill to rewrite this setup guide so a new teammate can use it quickly.",
    content: [
      "Use this placeholder docs-polish skill to improve clarity and task flow.",
      "",
      "Priorities:",
      "1. Lead with the shortest successful path.",
      "2. Keep requirements explicit.",
      "3. Separate one-time setup from daily workflow.",
      "4. Add verification steps after each critical action.",
    ].join("\n"),
  },
  {
    id: "ui-polish",
    name: "UI Polish",
    description: "Tighten rough product flows, visual hierarchy, and interaction copy.",
    summary: "Placeholder curated skill for refining small UI surfaces with clear product feedback.",
    examplePrompt: "Use the ui-polish skill to improve this settings screen and remove friction.",
    content: [
      "Use this placeholder ui-polish skill to sharpen a product surface.",
      "",
      "Checklist:",
      "- clarify the primary action",
      "- reduce noisy copy",
      "- preserve hierarchy across dense panels",
      "- add clear empty, loading, and error states",
    ].join("\n"),
  },
  {
    id: "bug-triage",
    name: "Bug Triage",
    description: "Turn a vague bug report into a reproducible, prioritized action plan.",
    summary: "Placeholder curated skill for reproducing issues and narrowing likely root causes.",
    examplePrompt: "Use the bug-triage skill to turn this flaky report into a clear repro and fix plan.",
    content: [
      "Use this placeholder bug-triage skill to structure debugging work.",
      "",
      "Approach:",
      "1. restate the observed symptom",
      "2. define the expected behavior",
      "3. isolate the smallest reproducible path",
      "4. list the most likely root-cause candidates",
      "5. propose the safest validation step",
    ].join("\n"),
  },
  {
    id: "dependency-upgrade",
    name: "Dependency Upgrade",
    description: "Plan and execute dependency bumps with focused risk checks.",
    summary: "Placeholder curated skill for controlled library upgrades and follow-up validation.",
    examplePrompt: "Use the dependency-upgrade skill to bump this package and flag any integration risks.",
    content: [
      "Use this placeholder dependency-upgrade skill to handle upgrades carefully.",
      "",
      "Review:",
      "- breaking changes",
      "- config changes",
      "- generated code impact",
      "- test or build commands needed after the bump",
    ].join("\n"),
  },
]

function managedSource(location: string): {
  source: SkillSource
  managed: boolean
  removable: boolean
  libraryID?: string
} {
  const root = managedSkillsRoot()
  const relative = path.relative(root, location)
  const insideManagedRoot = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  if (!insideManagedRoot) {
    return {
      source: "external",
      managed: false,
      removable: false,
    }
  }

  const segments = relative.split(path.sep)
  if (segments[0] === "library" && segments[1]) {
    return {
      source: "library",
      managed: true,
      removable: true,
      libraryID: segments[1],
    }
  }

  if (segments[0] === "custom") {
    return {
      source: "custom",
      managed: true,
      removable: true,
    }
  }

  return {
    source: "external",
    managed: true,
    removable: true,
  }
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function sanitizeSkillName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function skillDocument(input: {
  name: string
  description: string
  examplePrompt?: string
  content: string
}) {
  const frontmatter = [
    "---",
    `name: ${JSON.stringify(input.name)}`,
    `description: ${JSON.stringify(input.description)}`,
    ...(input.examplePrompt ? [`example_prompt: ${JSON.stringify(input.examplePrompt)}`] : []),
    "---",
  ]

  return [...frontmatter, "", input.content.trim(), ""].join("\n")
}

async function loadManagedSkillFile(filepath: string) {
  const source = await fsp.readFile(filepath, "utf8").catch(() => undefined)
  if (!source) return undefined

  const parsed = matter(source)
  const name = readOptionalString(parsed.data.name)
  const description = readOptionalString(parsed.data.description)
  if (!name || !description) {
    return undefined
  }

  return {
    name,
    description,
    location: filepath,
    content: parsed.content.trim(),
  } satisfies OpenCodeSkill
}

async function collectSkillFiles(root: string) {
  const entries = await fsp.readdir(root, {
    withFileTypes: true,
  }).catch(() => [])

  const matches: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      matches.push(...(await collectSkillFiles(fullPath)))
      continue
    }

    if (entry.isFile() && entry.name === "SKILL.md") {
      matches.push(fullPath)
    }
  }

  return matches
}

async function appendSkillsFromRoot(root: string, skills: Map<string, OpenCodeSkill>) {
  const stats = await fsp.stat(root).catch(() => undefined)
  if (!stats?.isDirectory()) {
    return
  }

  const matches = await collectSkillFiles(root)
  for (const match of matches) {
    const skill = await loadManagedSkillFile(match)
    if (!skill) {
      continue
    }

    skills.set(skill.name, skill)
  }
}

function walkUpDirectories(start: string, stop: string) {
  const result: string[] = []
  let current = path.resolve(start)
  const boundary = path.resolve(stop)

  while (true) {
    result.push(current)
    if (current === boundary) {
      break
    }

    const parent = path.dirname(current)
    if (parent === current) {
      break
    }

    current = parent
  }

  return result
}

async function loadCachedOpenCodeSkills(directory: string) {
  await ensureOpenCodeProjectOverlay(directory)

  const response = await fetchOpenCode({
    directory,
    method: "GET",
    path: "/skill",
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as { error?: string; message?: string } | undefined
    throw new Error(payload?.error ?? payload?.message ?? `Failed to list skills (${response.status})`)
  }

  return (await response.json()) as OpenCodeSkill[]
}

async function loadFreshLocalOpenCodeSkills(directory: string) {
  await ensureOpenCodeProjectOverlay(directory)

  const runtimeContext = await OpenCodeInstance.provide({
    directory,
    fn: async () => {
      const config = await OpenCodeConfig.get()
      const configDirectories = await OpenCodeConfig.directories()

      return {
        config,
        configDirectories,
        worktree: OpenCodeInstance.worktree,
      }
    },
  })

  const skills = new Map<string, OpenCodeSkill>()

  for (const externalDir of [".claude", ".agents"]) {
    await appendSkillsFromRoot(path.join(Global.Path.home, externalDir, "skills"), skills)
  }

  for (const current of walkUpDirectories(directory, runtimeContext.worktree)) {
    for (const externalDir of [".claude", ".agents"]) {
      await appendSkillsFromRoot(path.join(current, externalDir, "skills"), skills)
    }
  }

  for (const configDirectory of runtimeContext.configDirectories) {
    await appendSkillsFromRoot(path.join(configDirectory, "skill"), skills)
    await appendSkillsFromRoot(path.join(configDirectory, "skills"), skills)
  }

  for (const skillPath of runtimeContext.config.skills?.paths ?? []) {
    const expanded = skillPath.startsWith("~/")
      ? path.join(os.homedir(), skillPath.slice(2))
      : skillPath
    const resolved = path.isAbsolute(expanded)
      ? expanded
      : path.join(directory, expanded)
    await appendSkillsFromRoot(resolved, skills)
  }

  return Array.from(skills.values())
}

function isCachedRemoteSkill(skill: OpenCodeSkill) {
  return isWithinPath(OPENCODE_SKILL_CACHE_ROOT, skill.location)
}

async function loadBuddyManagedSkills() {
  const root = managedSkillsRoot()
  const entries = await fsp.readdir(root, {
    withFileTypes: true,
  }).catch(() => [])

  const skills: OpenCodeSkill[] = []

  for (const group of entries) {
    if (!group.isDirectory()) continue
    const groupPath = path.join(root, group.name)
    const groupEntries = await fsp.readdir(groupPath, {
      withFileTypes: true,
    }).catch(() => [])

    for (const skillDir of groupEntries) {
      if (!skillDir.isDirectory()) continue
      const skill = await loadManagedSkillFile(path.join(groupPath, skillDir.name, "SKILL.md"))
      if (skill) {
        skills.push(skill)
      }
    }
  }

  return skills
}

async function loadVisibleSkills(
  directory: string,
  options?: {
    refresh?: boolean
  },
) {
  const [openCodeSkills, managedSkills] = await Promise.all([
    options?.refresh
      ? Promise.all([
          loadCachedOpenCodeSkills(directory),
          loadFreshLocalOpenCodeSkills(directory),
        ]).then(([cachedSkills, freshLocalSkills]) => {
          const merged = new Map<string, OpenCodeSkill>()
          for (const skill of cachedSkills) {
            if (isCachedRemoteSkill(skill)) {
              merged.set(skill.name, skill)
            }
          }
          for (const skill of freshLocalSkills) {
            merged.set(skill.name, skill)
          }
          return Array.from(merged.values())
        })
      : loadCachedOpenCodeSkills(directory),
    loadBuddyManagedSkills(),
  ])

  const merged = new Map(openCodeSkills.map((skill) => [skill.name, skill]))
  for (const skill of managedSkills) {
    if (!merged.has(skill.name)) {
      merged.set(skill.name, skill)
    }
  }

  return Array.from(merged.values())
}

async function readSkillMetadata(location: string) {
  const source = await fsp.readFile(location, "utf8").catch(() => undefined)
  if (!source) {
    return {
      examplePrompt: undefined,
    }
  }

  const parsed = matter(source)
  return {
    examplePrompt: readOptionalString(parsed.data["example_prompt"]),
  }
}

function skillRuleset(config: Config.Info): PermissionRuleset {
  if (!config.permission) return []
  return PermissionNext.fromConfig(config.permission)
}

function enabledAction(action: PermissionAction) {
  return action !== "deny"
}

function resolvePermissionSource(input: {
  explicit: boolean
  matchedPattern: string
  skillName: string
}): SkillPermissionSource {
  if (!input.explicit) {
    return "default"
  }

  if (input.matchedPattern === input.skillName) {
    return "explicit"
  }

  return "inherited"
}

async function ensureManagedSkillPathReady() {
  await fsp.mkdir(agentSkillsRoot(), { recursive: true })
  await fsp.mkdir(managedSkillsRoot(), { recursive: true })
}

async function setSkillPermission(pattern: string, action: PermissionAction) {
  const current = await Config.getGlobal()
  const existingPermission = current.permission
  const existingSkillPermission =
    existingPermission && typeof existingPermission !== "string"
      ? existingPermission.skill
      : undefined

  const nextSkillPermission =
    typeof existingSkillPermission === "string"
      ? {
          "*": existingSkillPermission,
          [pattern]: action,
        }
      : {
          ...(existingSkillPermission ?? {}),
          [pattern]: action,
        }

  const nextPermission = Config.Permission.parse(
    typeof existingPermission === "string"
      ? {
          "*": existingPermission,
          skill: nextSkillPermission,
        }
      : {
          ...(existingPermission ?? {}),
          skill: nextSkillPermission,
        },
  )

  await Config.updateGlobal({
    permission: nextPermission,
  })
}

async function clearSkillPermission(pattern: string) {
  const current = await Config.getGlobal()
  const existingPermission = current.permission
  if (!existingPermission || typeof existingPermission === "string") {
    return
  }

  const existingSkillPermission = existingPermission.skill
  const nextPermission = { ...existingPermission } as Record<string, unknown>

  if (typeof existingSkillPermission === "string") {
    if (pattern !== "*") {
      return
    }

    delete nextPermission.skill
    await Config.updateGlobal({
      permission: Config.Permission.parse(nextPermission),
    })
    return
  }

  if (!existingSkillPermission || !(pattern in existingSkillPermission)) {
    return
  }

  const nextSkillPermission = { ...existingSkillPermission }
  delete nextSkillPermission[pattern]

  if (Object.keys(nextSkillPermission).length === 0) {
    delete nextPermission.skill
  } else {
    nextPermission.skill = nextSkillPermission
  }

  await Config.updateGlobal({
    permission: Config.Permission.parse(nextPermission),
  })
}

async function writeManagedSkillFile(folder: string, document: string) {
  await fsp.mkdir(folder, { recursive: true })
  await fsp.writeFile(path.join(folder, "SKILL.md"), document, "utf8")
}

async function refreshSkillRuntime() {
  await OpenCodeInstance.disposeAll()
}

async function resolveInstalledSkillByName(name: string, directory: string) {
  const skills = await loadVisibleSkills(directory, {
    refresh: true,
  })
  return skills.find((skill) => skill.name === name)
}

export async function listSkillsCatalog(
  directory: string,
  options?: {
    refresh?: boolean
  },
): Promise<SkillsCatalog> {
  const [skills, config] = await Promise.all([
    loadVisibleSkills(directory, options),
    Config.getGlobal(),
  ])

  const ruleset = skillRuleset(config)
  const installed = await Promise.all(
    skills
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (skill): Promise<InstalledSkillInfo> => {
        const scope = resolveSkillScope(skill.location)
        const permissionRule = resolveSkillPermission(skill.name, ruleset)
        const metadata = await readSkillMetadata(skill.location)
        const source = managedSource(skill.location)

        return {
          name: skill.name,
          description: skill.description,
          location: skill.location,
          directory: path.dirname(skill.location),
          content: skill.content,
          examplePrompt: metadata.examplePrompt,
          enabled: enabledAction(permissionRule.rule.action),
          permissionAction: permissionRule.rule.action,
          permissionSource: resolvePermissionSource({
            explicit: permissionRule.explicit,
            matchedPattern: permissionRule.rule.pattern,
            skillName: skill.name,
          }),
          source: source.source,
          scope,
          managed: source.managed,
          removable: source.removable,
          ...(source.libraryID ? { libraryID: source.libraryID } : {}),
        }
      }),
  )

  const library = await Promise.all(
    PLACEHOLDER_LIBRARY.map(async (entry): Promise<SkillLibraryEntry> => {
      const installedFile = path.join(managedLibraryRoot(), entry.id, "SKILL.md")
      const stats = await fsp.stat(installedFile).catch(() => undefined)

      return {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        summary: entry.summary,
        examplePrompt: entry.examplePrompt,
        installed: !!stats?.isFile(),
      }
    }),
  )

  return {
    directory,
    managedRoot: managedSkillsRoot(),
    installed,
    library,
  }
}

export async function installPlaceholderLibrarySkill(skillID: string, directory: string) {
  const skill = PLACEHOLDER_LIBRARY.find((entry) => entry.id === skillID)
  if (!skill) {
    throw new Error("Unknown skill library item")
  }

  const normalizedName = sanitizeSkillName(skill.id)
  if (!normalizedName) {
    throw new Error("Invalid skill library item")
  }

  const existingSkill = await resolveInstalledSkillByName(normalizedName, directory)
  if (existingSkill) {
    throw new Error(`Skill "${normalizedName}" already exists`)
  }

  const folder = path.join(managedLibraryRoot(), skill.id)
  await ensureManagedSkillPathReady()
  await writeManagedSkillFile(
    folder,
    skillDocument({
      name: normalizedName,
      description: skill.description,
      examplePrompt: skill.examplePrompt,
      content: skill.content,
    }),
  )
  await setSkillPermission(normalizedName, "allow")
  await refreshSkillRuntime()

  return normalizedName
}

export async function createCustomSkill(input: CreateCustomSkillInput, directory: string) {
  const name = sanitizeSkillName(input.name)
  if (!name) {
    throw new Error("Skill name must include letters or numbers")
  }

  const existingSkill = await resolveInstalledSkillByName(name, directory)
  if (existingSkill) {
    throw new Error(`Skill "${name}" already exists`)
  }

  const folder = path.join(managedCustomRoot(), name)
  const existing = await fsp.stat(path.join(folder, "SKILL.md")).catch(() => undefined)
  if (existing?.isFile()) {
    throw new Error(`Skill "${name}" already exists`)
  }

  await ensureManagedSkillPathReady()
  await writeManagedSkillFile(
    folder,
    skillDocument({
      name,
      description: input.description.trim(),
      examplePrompt: readOptionalString(input.examplePrompt),
      content: input.content,
    }),
  )
  await setSkillPermission(name, "allow")
  await refreshSkillRuntime()

  return name
}

export async function setInstalledSkillAction(name: string, action: SkillRuleAction, directory: string) {
  const normalizedName = name.trim()
  if (!normalizedName) {
    throw new Error("Skill name is required")
  }

  const existing = await resolveInstalledSkillByName(normalizedName, directory)
  if (!existing) {
    throw new Error(`Skill "${normalizedName}" not found`)
  }

  if (action === "inherit") {
    await clearSkillPermission(existing.name)
  } else {
    await setSkillPermission(existing.name, action)
  }
  await refreshSkillRuntime()

  const updatedCatalog = await listSkillsCatalog(directory)
  const updatedSkill = updatedCatalog.installed.find((skill) => skill.name === existing.name)
  if (!updatedSkill) {
    throw new Error(`Skill "${existing.name}" not found after update`)
  }

  return updatedSkill
}

export async function removeManagedSkill(name: string, directory: string) {
  const normalizedName = name.trim()
  if (!normalizedName) {
    throw new Error("Skill name is required")
  }

  const existing = await resolveInstalledSkillByName(normalizedName, directory)
  if (!existing) {
    throw new Error(`Skill "${normalizedName}" not found`)
  }

  const ownership = managedSource(existing.location)
  if (!ownership.managed) {
    throw new Error("Only Buddy-managed skills can be removed")
  }

  const folder = path.dirname(existing.location)
  const relative = path.relative(managedSkillsRoot(), folder)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to remove a skill outside Buddy-managed storage")
  }

  await fsp.rm(folder, {
    recursive: true,
    force: true,
  })
  await refreshSkillRuntime()

  return normalizedName
}
