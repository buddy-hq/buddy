#!/usr/bin/env bun

import fsp from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ALL_BUDDY_FEATURES } from "../src/learning/features"
import type { BuddySkill } from "../src/learning/runtime/define-buddy-skill"
import { isDisabledBundledSkillName } from "../src/learning/skill-management/disabled-bundled-skills"
import { loadManagedSkillFile } from "../src/learning/skill-management/service/documents"

const SKILL_DOCUMENT_FILENAME = "SKILL.md"
const SKILLS_DIRECTORY_NAME = "skills"
const MANIFEST_DIRECTORY_NAME = "agents"
const MANIFEST_FILENAME = "buddy.yaml"
const FEATURES_ROOT = path.resolve(import.meta.dir, "../src/learning/features")

type RegisteredBundledSkill = {
  skillName: string
  skillDocumentPath: string
}

function collectBundledSkillRegistrations(skills: readonly BuddySkill[]): RegisteredBundledSkill[] {
  const names = new Set<string>()
  const documentPaths = new Set<string>()
  const registrations: RegisteredBundledSkill[] = []

  for (const skill of skills) {
    const skillDocumentPath = path.resolve(fileURLToPath(skill.url))
    if (names.has(skill.name)) {
      throw new Error(`Duplicate bundled skill name "${skill.name}"`)
    }
    if (documentPaths.has(skillDocumentPath)) {
      throw new Error(`Duplicate bundled skill document "${skillDocumentPath}"`)
    }

    names.add(skill.name)
    documentPaths.add(skillDocumentPath)
    registrations.push({
      skillName: skill.name,
      skillDocumentPath,
    })
  }

  return registrations.toSorted((left, right) =>
    left.skillDocumentPath.localeCompare(right.skillDocumentPath),
  )
}

function collectRegisteredBundledSkills(): RegisteredBundledSkill[] {
  return collectBundledSkillRegistrations(ALL_BUDDY_FEATURES.flatMap((feature) => feature.skills))
}

async function collectBundledSkillDocuments(root: string): Promise<string[]> {
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => [])
  const documents: string[] = []

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      documents.push(...(await collectBundledSkillDocuments(entryPath)))
      continue
    }
    if (
      entry.isFile() &&
      entry.name === SKILL_DOCUMENT_FILENAME &&
      path.basename(path.dirname(path.dirname(entryPath))) === SKILLS_DIRECTORY_NAME
    ) {
      documents.push(path.resolve(entryPath))
    }
  }

  return documents.toSorted((left, right) => left.localeCompare(right))
}

async function collectSourceBuddyManifests(root: string): Promise<string[]> {
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => [])
  const manifests: string[] = []

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      manifests.push(...(await collectSourceBuddyManifests(entryPath)))
      continue
    }
    if (
      entry.isFile() &&
      entry.name === MANIFEST_FILENAME &&
      path.basename(path.dirname(entryPath)) === MANIFEST_DIRECTORY_NAME
    ) {
      manifests.push(path.resolve(entryPath))
    }
  }

  return manifests.toSorted((left, right) => left.localeCompare(right))
}

async function checkBundledSkills(): Promise<RegisteredBundledSkill[]> {
  const registrations = collectRegisteredBundledSkills()
  const registeredDocuments = new Set(
    registrations.map((registration) => registration.skillDocumentPath),
  )
  const discoveredDocuments = await collectBundledSkillDocuments(FEATURES_ROOT)
  const sourceManifests = await collectSourceBuddyManifests(FEATURES_ROOT)
  const unregisteredCandidates = discoveredDocuments.filter(
    (documentPath) => !registeredDocuments.has(documentPath),
  )
  const unregisteredDocuments = (
    await Promise.all(
      unregisteredCandidates.map(async (documentPath) => ({
        documentPath,
        skill: await loadManagedSkillFile(documentPath),
      })),
    )
  )
    .filter(({ skill }) => !skill || !isDisabledBundledSkillName(skill.name))
    .map(({ documentPath }) => documentPath)
  const missingDocuments = registrations
    .map((registration) => registration.skillDocumentPath)
    .filter((documentPath) => !discoveredDocuments.includes(documentPath))

  const details = [
    ...unregisteredDocuments.map((entry) => `Unregistered bundled skill: ${entry}`),
    ...missingDocuments.map((entry) => `Registered skill document is missing: ${entry}`),
    ...sourceManifests.map(
      (entry) => `Source Buddy manifest duplicates typed presentation metadata: ${entry}`,
    ),
  ]
  if (details.length) {
    throw new Error(details.join("\n"))
  }

  return registrations
}

async function main(): Promise<void> {
  const registrations = await checkBundledSkills()
  console.log(`Verified ${registrations.length} bundled skill registrations.`)
}

if (import.meta.main) {
  await main()
}

export {
  checkBundledSkills,
  collectBundledSkillDocuments,
  collectBundledSkillRegistrations,
  collectRegisteredBundledSkills,
  collectSourceBuddyManifests,
}

export type { RegisteredBundledSkill }
