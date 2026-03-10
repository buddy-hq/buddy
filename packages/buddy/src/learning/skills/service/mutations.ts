import fsp from "node:fs/promises"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import type { CreateCustomSkillInput, SkillRuleAction } from "./contracts"
import { SkillServiceError } from "./contracts"
import { readOptionalString, sanitizeSkillName, skillDocument } from "./documents"
import { resolveInstalledSkillByName } from "./discovery"
import { PLACEHOLDER_LIBRARY } from "./library"
import { ensureManagedSkillPathReady, managedCustomRoot, managedLibraryRoot, managedSkillsRoot, managedSource } from "./paths"
import { clearSkillPermission, setSkillPermission } from "./permissions"
import { listSkillsCatalog } from "./catalog"

async function writeManagedSkillFile(folder: string, document: string) {
  await fsp.mkdir(folder, { recursive: true })
  await fsp.writeFile(path.join(folder, "SKILL.md"), document, "utf8")
}

async function refreshSkillRuntime() {
  await OpenCodeInstance.disposeAll()
}

export async function installPlaceholderLibrarySkill(skillID: string, directory: string) {
  const skill = PLACEHOLDER_LIBRARY.find((entry) => entry.id === skillID)
  if (!skill) {
    throw new SkillServiceError("not_found", "Unknown skill library item")
  }

  const normalizedName = sanitizeSkillName(skill.id)
  if (!normalizedName) {
    throw new SkillServiceError("invalid_input", "Invalid skill library item")
  }

  const existingSkill = await resolveInstalledSkillByName(normalizedName, directory)
  if (existingSkill) {
    throw new SkillServiceError("conflict", `Skill "${normalizedName}" already exists`)
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
    throw new SkillServiceError("invalid_input", "Skill name must include letters or numbers")
  }

  const existingSkill = await resolveInstalledSkillByName(name, directory)
  if (existingSkill) {
    throw new SkillServiceError("conflict", `Skill "${name}" already exists`)
  }

  const folder = path.join(managedCustomRoot(), name)
  const existing = await fsp.stat(path.join(folder, "SKILL.md")).catch(() => undefined)
  if (existing?.isFile()) {
    throw new SkillServiceError("conflict", `Skill "${name}" already exists`)
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
    throw new SkillServiceError("invalid_input", "Skill name is required")
  }

  const existing = await resolveInstalledSkillByName(normalizedName, directory)
  if (!existing) {
    throw new SkillServiceError("not_found", `Skill "${normalizedName}" not found`)
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
    throw new SkillServiceError("not_found", `Skill "${existing.name}" not found after update`)
  }

  return updatedSkill
}

export async function removeManagedSkill(name: string, directory: string) {
  const normalizedName = name.trim()
  if (!normalizedName) {
    throw new SkillServiceError("invalid_input", "Skill name is required")
  }

  const existing = await resolveInstalledSkillByName(normalizedName, directory)
  if (!existing) {
    throw new SkillServiceError("not_found", `Skill "${normalizedName}" not found`)
  }

  const ownership = managedSource(existing.location)
  if (!ownership.managed) {
    throw new SkillServiceError("forbidden", "Only Buddy-managed skills can be removed")
  }

  const folder = path.dirname(existing.location)
  const relative = path.relative(managedSkillsRoot(), folder)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new SkillServiceError("forbidden", "Refusing to remove a skill outside Buddy-managed storage")
  }

  await fsp.rm(folder, {
    recursive: true,
    force: true,
  })
  await refreshSkillRuntime()

  return normalizedName
}
