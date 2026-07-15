import { createHash } from "node:crypto"
import fsp from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { BuddySkill } from "../../runtime/define-buddy-skill"
import { isDisabledBundledSkillName } from "../disabled-bundled-skills"
import { loadManagedSkillFile } from "./documents"
import { BUDDY_SKILL_MANIFEST_RELATIVE_PATH, renderBuddySkillManifest } from "./manifests"
import { collectRegularSkillFiles, toPosixRelativePath } from "./tree-limits"

export const SYSTEM_SKILL_PACK_SCHEMA_VERSION = 1
export const SYSTEM_SKILL_RUNTIME_CONTRACT_VERSION = 1
export const BUNDLED_SYSTEM_SKILL_PACK_REVISION = 0

const BUNDLED_SYSTEM_SKILL_PACK_PUBLISHED_AT = "1970-01-01T00:00:00.000Z"
const SYSTEM_SKILL_PACK_KIND = "buddy-system-skill-pack"
const SYSTEM_SKILL_DOCUMENT_FILENAME = "SKILL.md"
const SYSTEM_SKILL_REGISTRATION_FILENAME = "index.ts"
const SYSTEM_SKILL_PACK_MAX_FILES = 1_000
const SYSTEM_SKILL_PACK_MAX_TOTAL_BYTES = 16 * 1024 * 1024
const SYSTEM_SKILL_PACK_MAX_FILE_BYTES = 2 * 1024 * 1024
const SHA256_HEX_LENGTH = 64
const HASH_SEPARATOR = "\0"
const SYSTEM_SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

const systemSkillPackFileSchema = z.strictObject({
  path: z.string().trim().min(1),
  content: z.string().trim(),
})

const systemSkillPackSkillSchema = z.strictObject({
  name: z.string().trim().min(1).regex(SYSTEM_SKILL_NAME_PATTERN),
  files: z.array(systemSkillPackFileSchema).min(1),
})

const systemSkillPackSchema = z.strictObject({
  schemaVersion: z.literal(SYSTEM_SKILL_PACK_SCHEMA_VERSION),
  kind: z.literal(SYSTEM_SKILL_PACK_KIND),
  revision: z.number().int().nonnegative(),
  publishedAt: z.string().trim().datetime(),
  runtimeContractVersion: z.number().int().positive(),
  baseFingerprint: z
    .string()
    .trim()
    .length(SHA256_HEX_LENGTH)
    .regex(/^[0-9a-f]+$/),
  contentFingerprint: z
    .string()
    .trim()
    .length(SHA256_HEX_LENGTH)
    .regex(/^[0-9a-f]+$/),
  skills: z.array(systemSkillPackSkillSchema).min(1),
})

export type SystemSkillPackFile = z.infer<typeof systemSkillPackFileSchema>
export type SystemSkillPackSkill = z.infer<typeof systemSkillPackSkillSchema>
export type SystemSkillPack = z.infer<typeof systemSkillPackSchema>

export type SystemSkillPackCompatibility = {
  baseFingerprint: string
  runtimeContractVersion: number
  skillNames: readonly string[]
  skillManifests: ReadonlyMap<string, string>
}

type SystemSkillSource = {
  directory: string
  manifest: string
  name: string
}

function decodeFileContent(content: string): Uint8Array {
  if (content.length === 0) return new Uint8Array()
  if (content.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) {
    throw new Error("System skill pack contains invalid base64 file content")
  }
  return Buffer.from(content, "base64")
}

function validateRelativeFilePath(filepath: string): string {
  if (
    filepath.includes("\\") ||
    filepath.startsWith("/") ||
    filepath.endsWith("/") ||
    filepath.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid system skill pack path "${filepath}"`)
  }
  return filepath
}

function skillNameFromDocument(content: Uint8Array): string | undefined {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(content)
  const match = /^name:\s*(.+)$/m.exec(source)
  return match?.[1]?.trim()
}

export function computeSystemSkillPackFingerprint(skills: readonly SystemSkillPackSkill[]): string {
  const hash = createHash("sha256")
  for (const skill of skills.toSorted((left, right) => left.name.localeCompare(right.name))) {
    hash.update(skill.name)
    hash.update(HASH_SEPARATOR)
    for (const file of skill.files.toSorted((left, right) => left.path.localeCompare(right.path))) {
      const bytes = decodeFileContent(file.content)
      hash.update(file.path)
      hash.update(HASH_SEPARATOR)
      hash.update(String(bytes.byteLength))
      hash.update(HASH_SEPARATOR)
      hash.update(bytes)
      hash.update(HASH_SEPARATOR)
    }
  }
  return hash.digest("hex")
}

function validateSystemSkillPackContents(pack: SystemSkillPack): SystemSkillPack {
  const skillNames = new Set<string>()
  let fileCount = 0
  let totalBytes = 0

  for (const skill of pack.skills) {
    if (skillNames.has(skill.name)) {
      throw new Error(`Duplicate system skill pack skill "${skill.name}"`)
    }
    skillNames.add(skill.name)
    const paths = new Set<string>()
    let skillDocument: Uint8Array | undefined
    let skillManifest: Uint8Array | undefined

    for (const file of skill.files) {
      const relativePath = validateRelativeFilePath(file.path)
      if (paths.has(relativePath)) {
        throw new Error(`Duplicate system skill pack path "${skill.name}/${relativePath}"`)
      }
      paths.add(relativePath)
      const content = decodeFileContent(file.content)
      fileCount += 1
      totalBytes += content.byteLength
      if (content.byteLength > SYSTEM_SKILL_PACK_MAX_FILE_BYTES) {
        throw new Error(`System skill pack file "${skill.name}/${relativePath}" is too large`)
      }
      if (relativePath === SYSTEM_SKILL_DOCUMENT_FILENAME) {
        skillDocument = content
      }
      if (relativePath === BUDDY_SKILL_MANIFEST_RELATIVE_PATH.split(path.sep).join("/")) {
        skillManifest = content
      }
    }

    if (!skillDocument) {
      throw new Error(`System skill pack skill "${skill.name}" is missing SKILL.md`)
    }
    if (!skillManifest) {
      throw new Error(`System skill pack skill "${skill.name}" is missing Buddy metadata`)
    }
    if (skillNameFromDocument(skillDocument) !== skill.name) {
      throw new Error(`System skill pack skill "${skill.name}" has mismatched SKILL.md name`)
    }
  }

  if (fileCount > SYSTEM_SKILL_PACK_MAX_FILES) {
    throw new Error(
      `System skill pack has ${fileCount} files; limit is ${SYSTEM_SKILL_PACK_MAX_FILES}`,
    )
  }
  if (totalBytes > SYSTEM_SKILL_PACK_MAX_TOTAL_BYTES) {
    throw new Error("System skill pack exceeds the total size limit")
  }
  if (computeSystemSkillPackFingerprint(pack.skills) !== pack.contentFingerprint) {
    throw new Error("System skill pack content fingerprint does not match its files")
  }
  return pack
}

function validateCompatibility(
  pack: SystemSkillPack,
  compatibility: SystemSkillPackCompatibility,
): SystemSkillPack {
  if (pack.baseFingerprint !== compatibility.baseFingerprint) {
    throw new Error("System skill pack targets a different bundled skill baseline")
  }
  if (pack.runtimeContractVersion !== compatibility.runtimeContractVersion) {
    throw new Error("System skill pack targets an incompatible runtime contract")
  }
  const expected = [...compatibility.skillNames].toSorted()
  const actual = pack.skills.map((skill) => skill.name).toSorted()
  if (expected.length !== actual.length || expected.some((name, index) => name !== actual[index])) {
    throw new Error("System skill pack does not match the app's registered skill set")
  }
  const manifestPath = BUDDY_SKILL_MANIFEST_RELATIVE_PATH.split(path.sep).join("/")
  for (const skill of pack.skills) {
    const expectedManifest = compatibility.skillManifests.get(skill.name)
    const packedManifest = skill.files.find((file) => file.path === manifestPath)
    if (
      !expectedManifest ||
      !packedManifest ||
      new TextDecoder("utf-8", { fatal: true }).decode(
        decodeFileContent(packedManifest.content),
      ) !== expectedManifest
    ) {
      throw new Error(`System skill pack metadata does not match registered skill "${skill.name}"`)
    }
  }
  return pack
}

export function parseSystemSkillPack(
  input: unknown,
  compatibility?: SystemSkillPackCompatibility,
): SystemSkillPack {
  const pack = validateSystemSkillPackContents(systemSkillPackSchema.parse(input))
  return compatibility ? validateCompatibility(pack, compatibility) : pack
}

export function systemSkillPackCompatibilityFromPack(
  input: SystemSkillPack,
): SystemSkillPackCompatibility {
  const pack = parseSystemSkillPack(input)
  const manifestPath = BUDDY_SKILL_MANIFEST_RELATIVE_PATH.split(path.sep).join("/")
  return {
    baseFingerprint: pack.baseFingerprint,
    runtimeContractVersion: pack.runtimeContractVersion,
    skillNames: pack.skills.map((skill) => skill.name),
    skillManifests: new Map(
      pack.skills.map((skill) => {
        const manifest = skill.files.find((file) => file.path === manifestPath)
        if (!manifest) {
          throw new Error(`System skill pack skill "${skill.name}" is missing Buddy metadata`)
        }
        return [
          skill.name,
          new TextDecoder("utf-8", { fatal: true }).decode(decodeFileContent(manifest.content)),
        ]
      }),
    ),
  }
}

async function readSourceFiles(source: SystemSkillSource): Promise<SystemSkillPackFile[]> {
  const files = await collectRegularSkillFiles(source.directory)
  const runtimeFiles = files.filter((file) => {
    const relativePath = toPosixRelativePath(source.directory, file)
    return (
      relativePath !== SYSTEM_SKILL_REGISTRATION_FILENAME &&
      relativePath !== BUDDY_SKILL_MANIFEST_RELATIVE_PATH.split(path.sep).join("/")
    )
  })
  const packed = await Promise.all(
    runtimeFiles.map(async (file) => ({
      path: toPosixRelativePath(source.directory, file),
      content: Buffer.from(await fsp.readFile(file)).toString("base64"),
    })),
  )
  packed.push({
    path: BUDDY_SKILL_MANIFEST_RELATIVE_PATH.split(path.sep).join("/"),
    content: Buffer.from(source.manifest, "utf8").toString("base64"),
  })
  return packed.toSorted((left, right) => left.path.localeCompare(right.path))
}

async function collectSystemSkillSources(
  roots: readonly string[],
  skills: readonly BuddySkill[],
): Promise<SystemSkillSource[]> {
  const registered = new Map(skills.map((skill) => [skill.name, skill]))
  const sources = new Map<string, SystemSkillSource>()

  for (const root of roots) {
    const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => [])
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const directory = path.join(root, entry.name)
      const document = await loadManagedSkillFile(
        path.join(directory, SYSTEM_SKILL_DOCUMENT_FILENAME),
      )
      if (!document || sources.has(document.name)) continue
      const registeredSkill = registered.get(document.name)
      if (!registeredSkill) {
        if (isDisabledBundledSkillName(document.name)) continue
        throw new Error(`Bundled skill "${document.name}" is not registered to a Buddy feature`)
      }
      sources.set(document.name, {
        directory,
        manifest: renderBuddySkillManifest(registeredSkill.presentation),
        name: document.name,
      })
    }
  }

  const missing = skills.map((skill) => skill.name).filter((name) => !sources.has(name))
  if (missing.length > 0) {
    throw new Error(`Bundled system skill source missing: ${missing.toSorted().join(", ")}`)
  }
  return Array.from(sources.values()).toSorted((left, right) => left.name.localeCompare(right.name))
}

export async function buildSystemSkillPack(input: {
  roots: readonly string[]
  skills: readonly BuddySkill[]
  revision: number
  publishedAt?: string
  baseFingerprint?: string
}): Promise<SystemSkillPack> {
  const sources = await collectSystemSkillSources(input.roots, input.skills)
  const packedSkills = await Promise.all(
    sources.map(async (source) => ({
      name: source.name,
      files: await readSourceFiles(source),
    })),
  )
  const contentFingerprint = computeSystemSkillPackFingerprint(packedSkills)
  return parseSystemSkillPack({
    schemaVersion: SYSTEM_SKILL_PACK_SCHEMA_VERSION,
    kind: SYSTEM_SKILL_PACK_KIND,
    revision: input.revision,
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    runtimeContractVersion: SYSTEM_SKILL_RUNTIME_CONTRACT_VERSION,
    baseFingerprint: input.baseFingerprint ?? contentFingerprint,
    contentFingerprint,
    skills: packedSkills,
  })
}

export async function buildBundledSystemSkillPack(input: {
  roots: readonly string[]
  skills: readonly BuddySkill[]
}): Promise<SystemSkillPack> {
  return await buildSystemSkillPack({
    ...input,
    revision: BUNDLED_SYSTEM_SKILL_PACK_REVISION,
    publishedAt: BUNDLED_SYSTEM_SKILL_PACK_PUBLISHED_AT,
  })
}

export function systemSkillPackPayloadBytes(pack: SystemSkillPack): Uint8Array {
  return Buffer.from(`${JSON.stringify(pack, null, 2)}\n`, "utf8")
}

export function systemSkillPackFileBytes(file: SystemSkillPackFile): Uint8Array {
  return decodeFileContent(file.content)
}
