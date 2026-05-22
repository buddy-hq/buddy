import fsp from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"
import type { Skill as PiSkill } from "@earendil-works/pi-coding-agent"
import { readProjectConfig } from "../../../config/runtime/config-access"
import { createBuddyPiResourceLoader } from "../../../pi-backend/host"
import { type BuddySkillDocument } from "./contracts"
import { readOptionalString } from "./documents"
import { isWithinPath, OPENCODE_SKILL_CACHE_ROOT } from "./paths"

type LoadedPiSkill = {
  skill: BuddySkillDocument
}

const visibleSkillsCache = new Map<string, BuddySkillDocument[]>()

async function readSkillContent(filepath: string) {
  const source = await fsp.readFile(filepath, "utf8").catch(() => undefined)
  if (!source) {
    return ""
  }

  const parsed = matter(source)
  return parsed.content.trim()
}

async function mapPiSkill(skill: PiSkill): Promise<LoadedPiSkill> {
  return {
    skill: {
      name: skill.name,
      description: skill.description,
      location: skill.filePath,
      content: await readSkillContent(skill.filePath),
    },
  }
}

function isCachedRemoteSkill(skill: BuddySkillDocument) {
  return isWithinPath(OPENCODE_SKILL_CACHE_ROOT, skill.location)
}

function mergeSkillsByName(skills: BuddySkillDocument[]) {
  const merged = new Map<string, BuddySkillDocument>()
  for (const skill of skills) {
    merged.set(skill.name, skill)
  }
  return Array.from(merged.values())
}

function readSkillByName(skills: BuddySkillDocument[], name: string) {
  return skills.find((skill) => skill.name === name)
}

function normalizedDirectory(directory: string) {
  return path.resolve(directory)
}

async function visibleSkillCacheKey(directory: string) {
  const config = await readProjectConfig(directory)
  return JSON.stringify({
    directory: normalizedDirectory(directory),
    skills: config.skills,
    skillsExternalVendorRootsEnabled: config.skills_external_vendor_roots_enabled === true,
  })
}

function clearVisibleSkillCacheForDirectory(directory: string) {
  const directoryKey = normalizedDirectory(directory)
  for (const key of visibleSkillsCache.keys()) {
    if (key.includes(`"directory":"${directoryKey}"`)) {
      visibleSkillsCache.delete(key)
    }
  }
}

export function invalidateVisibleSkillCache(directory?: string) {
  if (!directory) {
    visibleSkillsCache.clear()
    return
  }

  clearVisibleSkillCacheForDirectory(directory)
}

export async function loadVisibleSkills(
  directory: string,
  options?: {
    refresh?: boolean
  },
) {
  const cacheKey = await visibleSkillCacheKey(directory)
  if (!options?.refresh) {
    const cached = visibleSkillsCache.get(cacheKey)
    if (cached) {
      return cached
    }
  }

  const { resourceLoader } = await createBuddyPiResourceLoader({ directory })
  const skills = await Promise.all(resourceLoader.getSkills().skills.map(mapPiSkill))
  const visible = mergeSkillsByName(
    skills
      .filter((skill) => {
        const normalizedDescription = readOptionalString(skill.skill.description)
        return !!normalizedDescription || isCachedRemoteSkill(skill.skill)
      })
      .map((skill) => skill.skill),
  )

  clearVisibleSkillCacheForDirectory(directory)
  visibleSkillsCache.set(cacheKey, visible)
  return visible
}

export async function resolveInstalledSkillByName(name: string, directory: string) {
  return readSkillByName(
    await loadVisibleSkills(directory, {
      refresh: true,
    }),
    name,
  )
}
