import fsp from "node:fs/promises"
import path from "node:path"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import type { CreateCustomSkillInput, SkillRuleAction } from "./contracts"
import { SkillServiceError } from "./contracts"
import { loadManagedSkillFile, readOptionalString, sanitizeSkillName, skillDocument } from "./documents"
import { resolveInstalledSkillByName } from "./discovery"
import { readCuratedLibrarySkillByID } from "./library"
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

function requiredSkillName(name: string) {
  const normalized = name.trim()
  if (!normalized) {
    throw new SkillServiceError("invalid_input", "Skill name is required")
  }
  return normalized
}

async function findInstalledSkillOrThrow(name: string, directory: string) {
  const existing = await resolveInstalledSkillByName(name, directory)
  if (!existing) {
    throw new SkillServiceError("not_found", `Skill "${name}" not found`)
  }
  return existing
}

function validateLibrarySkillID(input: string) {
  const normalized = input.trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(normalized)) {
    throw new SkillServiceError("invalid_input", "Invalid skill library item")
  }
  return normalized
}

export async function installCuratedLibrarySkill(skillID: string, directory: string) {
  const normalizedSkillID = validateLibrarySkillID(skillID)
  const skill = await readCuratedLibrarySkillByID(normalizedSkillID, {
    refresh: true,
  })
  if (!skill) {
    throw new SkillServiceError("not_found", "Unknown skill library item")
  }

  const sourceSkill = await loadManagedSkillFile(skill.skillFile)
  if (!sourceSkill) {
    throw new SkillServiceError("invalid_input", `Invalid SKILL.md for library item "${normalizedSkillID}"`)
  }

  if (await resolveInstalledSkillByName(sourceSkill.name, directory)) {
    throw new SkillServiceError("conflict", `Skill "${sourceSkill.name}" already exists`)
  }

  const folder = path.join(managedLibraryRoot(), normalizedSkillID)
  await ensureManagedSkillPathReady()

  await fsp.rm(folder, {
    recursive: true,
    force: true,
  })
  await fsp.cp(skill.sourceDirectory, folder, {
    recursive: true,
    force: true,
  })

  const installedSkill = await loadManagedSkillFile(path.join(folder, "SKILL.md"))
  if (!installedSkill) {
    throw new SkillServiceError(
      "invalid_input",
      `Installed library item "${normalizedSkillID}" is missing a valid SKILL.md`,
    )
  }

  await setSkillPermission(installedSkill.name, "allow")
  await refreshSkillRuntime()

  return installedSkill.name
}

export async function createCustomSkill(input: CreateCustomSkillInput, directory: string) {
  const name = sanitizeSkillName(input.name)
  if (!name) {
    throw new SkillServiceError("invalid_input", "Skill name must include letters or numbers")
  }

  if (await resolveInstalledSkillByName(name, directory)) {
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
  const normalizedName = requiredSkillName(name)
  const existing = await findInstalledSkillOrThrow(normalizedName, directory)

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
  const normalizedName = requiredSkillName(name)
  const existing = await findInstalledSkillOrThrow(normalizedName, directory)

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
