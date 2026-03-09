import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Config as OpenCodeConfig } from "@buddy/opencode-adapter/config"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ensureOpenCodeProjectOverlay } from "@buddy/backend/config/runtime"
import { fetchOpenCode } from "../../../../http"
import { Global } from "../../../../storage"
import { SkillServiceError, type OpenCodeSkill } from "./contracts"
import { loadManagedSkillFile } from "./documents"
import { OPENCODE_SKILL_CACHE_ROOT, isWithinPath, managedSkillsRoot } from "./paths"

async function collectSkillFiles(root: string) {
  const entries = await fsp
    .readdir(root, {
      withFileTypes: true,
    })
    .catch(() => [])

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
    if (skill) {
      skills.set(skill.name, skill)
    }
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

async function loadCachedOpenCodeSkills(directory: string): Promise<OpenCodeSkill[]> {
  await ensureOpenCodeProjectOverlay(directory)

  const response = await fetchOpenCode({
    directory,
    method: "GET",
    path: "/skill",
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as { error?: string; message?: string } | undefined
    throw new SkillServiceError(
      "upstream_failure",
      payload?.error ?? payload?.message ?? `Failed to list skills (${response.status})`,
    )
  }

  return (await response.json()) as OpenCodeSkill[]
}

async function loadFreshLocalOpenCodeSkills(directory: string): Promise<OpenCodeSkill[]> {
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
    const expanded = skillPath.startsWith("~/") ? path.join(os.homedir(), skillPath.slice(2)) : skillPath
    const resolved = path.isAbsolute(expanded) ? expanded : path.join(directory, expanded)
    await appendSkillsFromRoot(resolved, skills)
  }

  return Array.from(skills.values())
}

function isCachedRemoteSkill(skill: OpenCodeSkill) {
  return isWithinPath(OPENCODE_SKILL_CACHE_ROOT, skill.location)
}

function mergeRefreshedOpenCodeSkills(cachedSkills: OpenCodeSkill[], freshLocalSkills: OpenCodeSkill[]) {
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
}

async function loadBuddyManagedSkills() {
  const root = managedSkillsRoot()
  const entries = await fsp
    .readdir(root, {
      withFileTypes: true,
    })
    .catch(() => [])

  const skills: OpenCodeSkill[] = []

  for (const group of entries) {
    if (!group.isDirectory()) continue
    const groupPath = path.join(root, group.name)
    const groupEntries = await fsp
      .readdir(groupPath, {
        withFileTypes: true,
      })
      .catch(() => [])

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

export async function loadVisibleSkills(
  directory: string,
  options?: {
    refresh?: boolean
  },
) {
  const [openCodeSkills, managedSkills] = await Promise.all([
    options?.refresh
      ? Promise.all([loadCachedOpenCodeSkills(directory), loadFreshLocalOpenCodeSkills(directory)]).then(
          ([cachedSkills, freshLocalSkills]) => mergeRefreshedOpenCodeSkills(cachedSkills, freshLocalSkills),
        )
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

export async function resolveInstalledSkillByName(name: string, directory: string) {
  const skills = await loadVisibleSkills(directory, {
    refresh: true,
  })
  return skills.find((skill) => skill.name === name)
}
