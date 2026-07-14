#!/usr/bin/env bun

import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { verifySignedMessage } from "@buddy/script/minisign"
import {
  BUDDY_SKILL_ARTIFACT_PUBLIC_KEY,
  DEFAULT_LIBRARY_CATALOG_URL,
  LIBRARY_CATALOG_ARTIFACT_FILENAME,
  publishedSkillArtifactUrl,
  systemSkillPackArtifactFilename,
} from "../src/learning/skill-management/service/artifact-config"
import {
  createSignedArtifactEnvelope,
  parseSignedArtifactEnvelope,
} from "../src/learning/skill-management/service/signed-artifact"
import {
  buildSystemSkillPack,
  parseSystemSkillPack,
  systemSkillPackCompatibilityFromPack,
  systemSkillPackPayloadBytes,
} from "../src/learning/skill-management/service/system-pack"
import { parseSkillCatalogDocument } from "../src/learning/skill-management/service/library"
import { resolveBuddyBundledSkillRoots } from "../src/config/opencode/skills"
import { allBuddySkills } from "../src/learning/runtime/feature-registry"

const RELEASE_REPOSITORY = "prashantbhudwal/buddy-releases"
const RELEASE_TAG = "skill-artifacts"
const RELEASE_TITLE = "Buddy Skill Artifacts"
const OUTPUT_FLAG = "--output"
const BASE_FINGERPRINT_FLAG = "--base-fingerprint"
const SYSTEM_REVISION_FLAG = "--system-revision"
const PUBLISH_FLAG = "--publish"
const LOCAL_KEY_DIRECTORY_SEGMENTS = [".config", "buddy"]
const LOCAL_PRIVATE_KEY_FILENAME = "skill-artifacts.key"
const LOCAL_PASSWORD_FILENAME = "skill-artifacts.key.password"
const SKILL_PRIVATE_KEY_ENV = "BUDDY_SKILL_SIGNING_PRIVATE_KEY"
const SKILL_PRIVATE_KEY_PATH_ENV = "BUDDY_SKILL_SIGNING_PRIVATE_KEY_PATH"
const SKILL_PRIVATE_KEY_PASSWORD_ENV = "BUDDY_SKILL_SIGNING_PRIVATE_KEY_PASSWORD"
const TAURI_PRIVATE_KEY_ENV = "TAURI_SIGNING_PRIVATE_KEY"
const TAURI_PRIVATE_KEY_PATH_ENV = "TAURI_SIGNING_PRIVATE_KEY_PATH"
const TAURI_PRIVATE_KEY_PASSWORD_ENV = "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
const PUBLIC_KEY_PREFIX = "RW"
const DEFAULT_OUTPUT_DIRECTORY = path.resolve(import.meta.dir, "../dist/skill-artifacts")
const TAURI_SIGNER_PATH = path.resolve(
  import.meta.dir,
  "../../desktop-electron/node_modules/.bin/tauri",
)
const SOURCE_CATALOG_PATH = path.resolve(
  import.meta.dir,
  "../src/learning/skill-management/service/catalog.json",
)

type SigningConfiguration = {
  environment: NodeJS.ProcessEnv
  publicKey?: string
}

type PublishedPayload<T> = {
  bytes: Uint8Array
  envelopeText: string
  value: T
}

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined
  return value && value.length > 0 ? value : undefined
}

function positiveRevision(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const revision = Number.parseInt(value, 10)
  if (!Number.isInteger(revision) || revision <= 0) {
    throw new Error(`${SYSTEM_REVISION_FLAG} must be a positive integer`)
  }
  return revision
}

function readPublicKey(source: string): string | undefined {
  const direct = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(PUBLIC_KEY_PREFIX))
  if (direct) return direct
  return Buffer.from(source.trim(), "base64")
    .toString("utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(PUBLIC_KEY_PREFIX))
}

async function signingConfiguration(): Promise<SigningConfiguration> {
  const environment = { ...process.env }
  const rawPrivateKey = process.env[SKILL_PRIVATE_KEY_ENV]?.trim()
  const configuredPrivateKeyPath = process.env[SKILL_PRIVATE_KEY_PATH_ENV]?.trim()
  const configuredPassword = process.env[SKILL_PRIVATE_KEY_PASSWORD_ENV]?.trim()

  if (rawPrivateKey) {
    environment[TAURI_PRIVATE_KEY_ENV] = rawPrivateKey
    if (configuredPassword) environment[TAURI_PRIVATE_KEY_PASSWORD_ENV] = configuredPassword
    return { environment }
  }

  const keyDirectory = path.join(os.homedir(), ...LOCAL_KEY_DIRECTORY_SEGMENTS)
  const privateKeyPath =
    configuredPrivateKeyPath ?? path.join(keyDirectory, LOCAL_PRIVATE_KEY_FILENAME)
  const passwordPath = path.join(keyDirectory, LOCAL_PASSWORD_FILENAME)
  const [privateKey, password, publicKeySource] = await Promise.all([
    fsp.readFile(privateKeyPath, "utf8").catch(() => undefined),
    configuredPassword
      ? Promise.resolve(configuredPassword)
      : fsp
          .readFile(passwordPath, "utf8")
          .then((value) => value.trim())
          .catch(() => undefined),
    fsp.readFile(`${privateKeyPath}.pub`, "utf8").catch(() => undefined),
  ])
  if (!privateKey) {
    throw new Error(
      `Missing skill artifact signing key. Configure ${SKILL_PRIVATE_KEY_ENV} or ${SKILL_PRIVATE_KEY_PATH_ENV}.`,
    )
  }
  environment[TAURI_PRIVATE_KEY_PATH_ENV] = privateKeyPath
  if (password) environment[TAURI_PRIVATE_KEY_PASSWORD_ENV] = password
  return {
    environment,
    publicKey: publicKeySource ? readPublicKey(publicKeySource) : undefined,
  }
}

function run(command: string, args: string[], environment: NodeJS.ProcessEnv): void {
  const result = spawnSync(command, args, {
    cwd: path.resolve(import.meta.dir, "../../.."),
    env: environment,
    stdio: "inherit",
  })
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} ${args.join(" ")} failed`)
  }
}

async function readPublishedPayload<T>(
  url: string,
  parsePayload: (input: unknown) => T,
): Promise<PublishedPayload<T> | undefined> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
  })
  if (response.status === 404) return undefined
  if (!response.ok) {
    throw new Error(
      `Failed to read published skill artifact: ${response.status} ${response.statusText}`,
    )
  }
  const envelopeText = await response.text()
  const envelope = parseSignedArtifactEnvelope(JSON.parse(envelopeText))
  const bytes = Buffer.from(envelope.payload, "base64")
  const verified = await verifySignedMessage({
    message: bytes,
    publicKey: BUDDY_SKILL_ARTIFACT_PUBLIC_KEY,
    signatureFileText: Buffer.from(envelope.signature, "base64").toString("utf8"),
  })
  if (!verified) {
    throw new Error("Published skill artifact signature verification failed")
  }
  const payloadJson: unknown = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(bytes))
  return {
    bytes,
    envelopeText,
    value: parsePayload(payloadJson),
  }
}

async function signPayload(
  payloadBytes: Uint8Array,
  name: string,
  outputDirectory: string,
  signing: SigningConfiguration,
): Promise<string> {
  const payloadPath = path.join(outputDirectory, `${name}.payload.json`)
  await fsp.writeFile(payloadPath, payloadBytes)
  run(TAURI_SIGNER_PATH, ["signer", "sign", payloadPath], signing.environment)
  const signature = (await fsp.readFile(`${payloadPath}.sig`, "utf8")).trim()
  const envelope = createSignedArtifactEnvelope({
    payloadBytes,
    tauriSignature: signature,
  })
  parseSignedArtifactEnvelope(envelope)
  const verified = await verifySignedMessage({
    message: payloadBytes,
    publicKey: BUDDY_SKILL_ARTIFACT_PUBLIC_KEY,
    signatureFileText: Buffer.from(signature, "base64").toString("utf8"),
  })
  if (!verified) {
    throw new Error(`Generated ${name} signature failed verification`)
  }
  await Promise.all([
    fsp.rm(payloadPath, { force: true }),
    fsp.rm(`${payloadPath}.sig`, { force: true }),
  ])
  return `${JSON.stringify(envelope, null, 2)}\n`
}

function ensureReleaseExists(environment: NodeJS.ProcessEnv): void {
  const view = spawnSync("gh", ["release", "view", RELEASE_TAG, "--repo", RELEASE_REPOSITORY], {
    env: environment,
    stdio: "ignore",
  })
  if (view.status === 0) return
  run(
    "gh",
    [
      "release",
      "create",
      RELEASE_TAG,
      "--repo",
      RELEASE_REPOSITORY,
      "--title",
      RELEASE_TITLE,
      "--notes",
      "Signed catalogs and system skill packs consumed independently of Buddy app releases.",
      "--prerelease",
      "--latest=false",
    ],
    environment,
  )
}

const outputDirectory = path.resolve(flagValue(OUTPUT_FLAG) ?? DEFAULT_OUTPUT_DIRECTORY)
await fsp.rm(outputDirectory, { recursive: true, force: true })
await fsp.mkdir(outputDirectory, { recursive: true })

const signing = await signingConfiguration()
if (signing.publicKey && signing.publicKey !== BUDDY_SKILL_ARTIFACT_PUBLIC_KEY) {
  throw new Error("Skill artifact signing key does not match the public key embedded in Buddy")
}

const catalogSource = await fsp.readFile(SOURCE_CATALOG_PATH, "utf8")
const catalogJson: unknown = JSON.parse(catalogSource)
const catalog = parseSkillCatalogDocument(catalogJson)
const publishedCatalog = await readPublishedPayload(
  DEFAULT_LIBRARY_CATALOG_URL,
  parseSkillCatalogDocument,
)
if (publishedCatalog) {
  if (publishedCatalog.value.revision > catalog.revision) {
    throw new Error(
      `Published library catalog revision ${publishedCatalog.value.revision} is newer than local revision ${catalog.revision}`,
    )
  }
  if (
    publishedCatalog.value.revision === catalog.revision &&
    !Buffer.from(publishedCatalog.bytes).equals(Buffer.from(catalogSource, "utf8"))
  ) {
    throw new Error("Library catalog content changed without a revision increment")
  }
}

const roots = await resolveBuddyBundledSkillRoots()
const bundledSkills = allBuddySkills()
const baselinePack = await buildSystemSkillPack({
  roots,
  skills: bundledSkills,
  revision: 0,
  publishedAt: "1970-01-01T00:00:00.000Z",
})
const requestedBaseFingerprint = flagValue(BASE_FINGERPRINT_FLAG)
const baseFingerprint = requestedBaseFingerprint ?? baselinePack.contentFingerprint
const systemFilename = systemSkillPackArtifactFilename(baseFingerprint)
const publishedSystemPack = await readPublishedPayload(
  publishedSkillArtifactUrl(systemFilename),
  parseSystemSkillPack,
)
if (
  requestedBaseFingerprint &&
  requestedBaseFingerprint !== baselinePack.contentFingerprint &&
  !publishedSystemPack
) {
  throw new Error(
    "Cannot verify the requested released baseline because it has no published system skill pack",
  )
}
const requestedSystemRevision = flagValue(SYSTEM_REVISION_FLAG)
const reusePublishedSystemPack =
  publishedSystemPack !== undefined &&
  requestedSystemRevision === undefined &&
  publishedSystemPack.value.contentFingerprint === baselinePack.contentFingerprint
const defaultSystemRevision = Math.max(
  catalog.revision,
  reusePublishedSystemPack
    ? publishedSystemPack.value.revision
    : (publishedSystemPack?.value.revision ?? 0) + 1,
)
const systemRevision = positiveRevision(requestedSystemRevision, defaultSystemRevision)
if (
  publishedSystemPack &&
  !reusePublishedSystemPack &&
  systemRevision <= publishedSystemPack.value.revision
) {
  throw new Error(
    `System skill revision must be greater than published revision ${publishedSystemPack.value.revision}`,
  )
}
const systemPack = reusePublishedSystemPack
  ? publishedSystemPack.value
  : await buildSystemSkillPack({
      roots,
      skills: bundledSkills,
      revision: systemRevision,
      baseFingerprint,
    })
parseSystemSkillPack(systemPack)
if (
  !reusePublishedSystemPack &&
  baseFingerprint !== baselinePack.contentFingerprint &&
  publishedSystemPack
) {
  parseSystemSkillPack(systemPack, systemSkillPackCompatibilityFromPack(publishedSystemPack.value))
}

const libraryEnvelopePath = path.join(outputDirectory, LIBRARY_CATALOG_ARTIFACT_FILENAME)
const systemEnvelopePath = path.join(outputDirectory, systemFilename)
await Promise.all([
  signPayload(Buffer.from(catalogSource, "utf8"), "library-catalog", outputDirectory, signing).then(
    (envelope) => fsp.writeFile(libraryEnvelopePath, envelope, "utf8"),
  ),
  reusePublishedSystemPack
    ? fsp.writeFile(systemEnvelopePath, publishedSystemPack.envelopeText, "utf8")
    : signPayload(
        systemSkillPackPayloadBytes(systemPack),
        "system-skill-pack",
        outputDirectory,
        signing,
      ).then((envelope) => fsp.writeFile(systemEnvelopePath, envelope, "utf8")),
])

if (process.argv.includes(PUBLISH_FLAG)) {
  ensureReleaseExists(process.env)
  run(
    "gh",
    [
      "release",
      "upload",
      RELEASE_TAG,
      libraryEnvelopePath,
      systemEnvelopePath,
      "--clobber",
      "--repo",
      RELEASE_REPOSITORY,
    ],
    process.env,
  )
}

console.log(`Built signed library catalog revision ${catalog.revision}`)
console.log(`Built signed system skill pack revision ${systemPack.revision}`)
console.log(`System skill baseline ${baseFingerprint}`)
console.log(`Artifacts: ${outputDirectory}`)
