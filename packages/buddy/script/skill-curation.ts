import fsp from "node:fs/promises"
import path from "node:path"
import { stringifyCaughtError } from "./parse-values"
import type { SkillSourceRef } from "../src/learning/skill-management/service/catalog-schemas"
import type { OpenCodeSkill } from "../src/learning/skill-management/service/contracts"
import {
  loadManagedSkillFile,
  sanitizeSkillName,
} from "../src/learning/skill-management/service/documents"
import { fetchPinnedGitHubSkill } from "../src/learning/skill-management/service/github-fetcher"
import {
  parseSkillCatalogDocument,
  type SkillCatalogDocument,
  type SkillCatalogEntry,
} from "../src/learning/skill-management/service/library"
import {
  SCANNER_POLICY_VERSION,
  scanSkillDirectory,
  type SkillScanFinding,
  type SkillScanResult,
} from "../src/learning/skill-management/service/scanner"
import { computeSkillTreeSha256 } from "../src/learning/skill-management/service/tree-hash"

export type CurationArgs = {
  repo: string
  sourcePath: string
  ref: string
  catalogId?: string
  displayName?: string
  summary?: string
  categories: string[]
  tags: string[]
  approvedBy?: string
  notes?: string
  policyVersion: number
  status: "approved" | "withdrawn"
  approvedWarningRuleIDs: string[]
  approvedWarningRuleIDsProvided: boolean
  approvedBlockRuleIDs: string[]
  approvedBlockRuleIDsProvided: boolean
  replaceExisting: boolean
  write: boolean
}

type SkillFetchStats = {
  fileCount: number
  totalBytes: number
}

type ReviewGateStatus =
  | "approved"
  | "blocked_findings"
  | "warnings_require_explicit_approval"
  | "warning_approval_mismatch"

type CurationReviewGate = {
  status: ReviewGateStatus
  writeAllowed: boolean
  message: string
  approvedWarningRuleIDs: string[]
  approvedBlockRuleIDs: string[]
  missingWarningRuleIDs: string[]
  unexpectedApprovedWarningRuleIDs: string[]
}

export type CurationOutput = {
  scan: {
    scannerPolicyVersion: number
    decision: SkillScanResult["decision"]
    warningRuleIDs: string[]
    blockRuleIDs: string[]
    findingCount: number
  }
  reviewGate: CurationReviewGate
  catalogPath: string
  writeRequested: boolean
  replaceExisting: boolean
  writePerformed: boolean
  entry: SkillCatalogEntry
}

const SKILL_DOCUMENT_FILENAME = "SKILL.md"
const CATALOG_PATH = path.resolve(
  import.meta.dir,
  "../src/learning/skill-management/service/catalog.json",
)
const EXIT_CODE_SCAN_BLOCKED = 2
const EXIT_CODE_WARNINGS_REQUIRE_APPROVAL = 3
const EXIT_CODE_WARNING_APPROVAL_MISMATCH = 4

function parseCsvValue(value: string | undefined) {
  if (!value) return []
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function argsMap(argv: string[]) {
  const flags = new Map<string, string>()
  const booleanFlags = new Set<string>()

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith("--")) continue
    const next = argv[index + 1]
    if (!next || next.startsWith("--")) {
      booleanFlags.add(token)
      continue
    }
    flags.set(token, next)
    index += 1
  }

  return { flags, booleanFlags }
}

function requiredFlag(flags: Map<string, string>, name: string) {
  const value = flags.get(name)?.trim()
  if (!value) {
    throw new Error(`Missing required flag: ${name}`)
  }
  return value
}

function optionalFlag(flags: Map<string, string>, name: string) {
  const value = flags.get(name)?.trim()
  return value && value.length > 0 ? value : undefined
}

function parseStatus(input: string | undefined): "approved" | "withdrawn" {
  if (!input) return "approved"
  if (input === "approved" || input === "withdrawn") return input
  throw new Error(`Invalid --status value "${input}". Use approved or withdrawn.`)
}

function parsePolicyVersion(input: string | undefined) {
  if (!input) return 1
  const value = Number.parseInt(input, 10)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Invalid --policy-version value. Use a positive integer.")
  }
  return value
}

function parseArgs(argv: string[]): CurationArgs {
  const { flags, booleanFlags } = argsMap(argv)
  const repo = requiredFlag(flags, "--repo")
  const sourcePath = requiredFlag(flags, "--path")
  const ref = requiredFlag(flags, "--ref")

  return {
    repo,
    sourcePath,
    ref,
    catalogId: optionalFlag(flags, "--catalog-id"),
    displayName: optionalFlag(flags, "--display-name"),
    summary: optionalFlag(flags, "--summary"),
    categories: parseCsvValue(optionalFlag(flags, "--categories")),
    tags: parseCsvValue(optionalFlag(flags, "--tags")),
    approvedBy: optionalFlag(flags, "--approved-by"),
    notes: optionalFlag(flags, "--notes"),
    policyVersion: parsePolicyVersion(optionalFlag(flags, "--policy-version")),
    status: parseStatus(optionalFlag(flags, "--status")),
    approvedWarningRuleIDs: parseCsvValue(optionalFlag(flags, "--approved-warning-rule-ids")),
    approvedWarningRuleIDsProvided: flags.has("--approved-warning-rule-ids"),
    approvedBlockRuleIDs: parseCsvValue(optionalFlag(flags, "--approved-block-rule-ids")),
    approvedBlockRuleIDsProvided: flags.has("--approved-block-rule-ids"),
    replaceExisting: booleanFlags.has("--replace-existing"),
    write: booleanFlags.has("--write"),
  }
}

function usage() {
  return [
    "Usage:",
    "  bun ./script/skill-curation.ts --repo owner/name --path skills/my-skill --ref <40-char-sha> [options]",
    "",
    "Options:",
    "  --catalog-id <id>                      Catalog entry id (default: <owner>-<skill-name>)",
    "  --display-name <name>                  Display name (default: skill name)",
    "  --summary <text>                       Summary (default: skill description)",
    "  --categories <a,b,c>                   Comma-separated categories",
    "  --tags <a,b,c>                         Comma-separated tags",
    "  --approved-by <name>                   review.approvedBy value",
    "  --notes <text>                         review.notes value",
    "  --policy-version <n>                   review.policyVersion (default: 1)",
    "  --status <approved|withdrawn>          status (default: approved)",
    "  --approved-warning-rule-ids <a,b,c>    Explicitly approve the exact scanner warnings found",
    "  --approved-block-rule-ids <a,b,c>       Explicitly approve the exact scanner blocks found after human review",
    "  --replace-existing                     Replace an existing entry with the same id",
    "  --write                                Write entry to catalog.json when review gates pass",
  ].join("\n")
}

function withError<TError>(error: TError) {
  const message = stringifyCaughtError(error)
  console.error(`skill-curation failed: ${message}`)
  process.exit(1)
}

function sortCatalogEntries(document: SkillCatalogDocument): SkillCatalogDocument {
  return {
    ...document,
    entries: [...document.entries].toSorted((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
  }
}

function entriesEqual(left: SkillCatalogEntry, right: SkillCatalogEntry) {
  return JSON.stringify(left) === JSON.stringify(right)
}

async function writeCatalogDocument(document: SkillCatalogDocument, catalogPath: string) {
  const directory = path.dirname(catalogPath)
  const tempPath = path.join(directory, `.catalog.${process.pid}.${Date.now()}.tmp`)
  await fsp.writeFile(
    tempPath,
    `${JSON.stringify(sortCatalogEntries(document), null, 2)}\n`,
    "utf8",
  )
  await fsp.rename(tempPath, catalogPath)
}

export async function writeCatalogEntry(input: {
  entry: SkillCatalogEntry
  replaceExisting: boolean
  catalogPath?: string
}) {
  const catalogPath = input.catalogPath ?? CATALOG_PATH
  const catalog = parseSkillCatalogDocument(JSON.parse(await fsp.readFile(catalogPath, "utf8")))
  const existingIndex = catalog.entries.findIndex((candidate) => candidate.id === input.entry.id)
  if (existingIndex >= 0) {
    const existingEntry = catalog.entries[existingIndex]
    const replacement =
      existingEntry.icon && !input.entry.icon
        ? { ...input.entry, icon: existingEntry.icon }
        : input.entry
    if (entriesEqual(existingEntry, replacement)) {
      return "unchanged" as const
    }
    if (!input.replaceExisting) {
      throw new Error(
        `Catalog entry "${input.entry.id}" already exists. Re-run with --replace-existing after review.`,
      )
    }
    catalog.entries[existingIndex] = replacement
  } else {
    catalog.entries.push(input.entry)
  }
  await writeCatalogDocument(
    {
      ...catalog,
      revision: catalog.revision + 1,
    },
    catalogPath,
  )
  return existingIndex >= 0 ? ("updated" as const) : ("created" as const)
}

function normalizeRuleIDs(ruleIDs: string[]) {
  return Array.from(
    new Set(ruleIDs.map((ruleID) => ruleID.trim()).filter((ruleID) => ruleID.length > 0)),
  ).toSorted()
}

function collectRuleIDs(findings: SkillScanFinding[], severity: SkillScanFinding["severity"]) {
  return normalizeRuleIDs(
    findings.filter((finding) => finding.severity === severity).map((finding) => finding.ruleId),
  )
}

function difference(left: string[], right: string[]) {
  const rightSet = new Set(right)
  return left.filter((value) => !rightSet.has(value))
}

function defaultCatalogID(repo: string, skillName: string) {
  const [owner, repoName] = repo.split("/")
  return [sanitizeSkillName(owner), sanitizeSkillName(repoName), sanitizeSkillName(skillName)]
    .filter((segment) => segment.length > 0)
    .join("-")
}

function reviewGateMessage(input: {
  status: ReviewGateStatus
  warningRuleIDs: string[]
  blockRuleIDs: string[]
  missingWarningRuleIDs: string[]
  unexpectedApprovedWarningRuleIDs: string[]
  unapprovedBlockRuleIDs: string[]
  unexpectedApprovedBlockRuleIDs: string[]
}) {
  if (input.status === "blocked_findings") {
    const details = [
      input.unapprovedBlockRuleIDs.length > 0
        ? `unapproved block rules: ${input.unapprovedBlockRuleIDs.join(",")}`
        : undefined,
      input.unexpectedApprovedBlockRuleIDs.length > 0
        ? `unexpected block approvals: ${input.unexpectedApprovedBlockRuleIDs.join(",")}`
        : undefined,
    ].filter((part) => part !== undefined)
    if (details.length > 0) {
      return `Block scanner findings were detected but approval was incomplete (${details.join("; ")}).`
    }
    return `Blocking scanner findings were detected. Re-run with --approved-block-rule-ids ${input.blockRuleIDs.join(",")} after review.`
  }
  if (input.status === "warnings_require_explicit_approval") {
    return `Scanner warnings were found. Re-run with --approved-warning-rule-ids ${input.warningRuleIDs.join(",")} after review.`
  }
  if (input.status === "warning_approval_mismatch") {
    const details = [
      input.missingWarningRuleIDs.length > 0
        ? `missing approvals: ${input.missingWarningRuleIDs.join(",")}`
        : undefined,
      input.unexpectedApprovedWarningRuleIDs.length > 0
        ? `unexpected approvals: ${input.unexpectedApprovedWarningRuleIDs.join(",")}`
        : undefined,
    ].filter((part) => part !== undefined)
    return `Provided warning approvals did not exactly match the scanner findings (${details.join("; ")}).`
  }
  return "Review gates passed."
}

export function buildCurationOutput(input: {
  args: CurationArgs
  skill: Pick<OpenCodeSkill, "name" | "description">
  source: SkillSourceRef
  stats: SkillFetchStats
  scan: SkillScanResult
  now?: string
}): CurationOutput {
  const warningRuleIDs = collectRuleIDs(input.scan.findings, "warn")
  const blockRuleIDs = collectRuleIDs(input.scan.findings, "block")
  const approvedWarningRuleIDs = normalizeRuleIDs(input.args.approvedWarningRuleIDs)
  const approvedBlockRuleIDs = normalizeRuleIDs(input.args.approvedBlockRuleIDs)

  let reviewGateStatus: ReviewGateStatus = "approved"
  let missingWarningRuleIDs: string[] = []
  let unexpectedApprovedWarningRuleIDs: string[] = []

  const unapprovedBlockRuleIDs = difference(blockRuleIDs, approvedBlockRuleIDs)
  const unexpectedApprovedBlockRuleIDs = difference(approvedBlockRuleIDs, blockRuleIDs)

  if (blockRuleIDs.length > 0 && !input.args.approvedBlockRuleIDsProvided) {
    reviewGateStatus = "blocked_findings"
  } else if (blockRuleIDs.length > 0 && input.args.approvedBlockRuleIDsProvided) {
    if (unapprovedBlockRuleIDs.length > 0 || unexpectedApprovedBlockRuleIDs.length > 0) {
      reviewGateStatus = "blocked_findings"
    }
  }

  if (reviewGateStatus !== "blocked_findings") {
    if (warningRuleIDs.length > 0 && !input.args.approvedWarningRuleIDsProvided) {
      reviewGateStatus = "warnings_require_explicit_approval"
    } else if (warningRuleIDs.length === 0 && input.args.approvedWarningRuleIDsProvided) {
      reviewGateStatus = "warning_approval_mismatch"
      unexpectedApprovedWarningRuleIDs = approvedWarningRuleIDs
    } else if (input.args.approvedWarningRuleIDsProvided) {
      missingWarningRuleIDs = difference(warningRuleIDs, approvedWarningRuleIDs)
      unexpectedApprovedWarningRuleIDs = difference(approvedWarningRuleIDs, warningRuleIDs)
      if (missingWarningRuleIDs.length > 0 || unexpectedApprovedWarningRuleIDs.length > 0) {
        reviewGateStatus = "warning_approval_mismatch"
      }
    }
  }

  const reviewGate: CurationReviewGate = {
    status: reviewGateStatus,
    writeAllowed: reviewGateStatus === "approved",
    message: reviewGateMessage({
      status: reviewGateStatus,
      warningRuleIDs,
      blockRuleIDs,
      missingWarningRuleIDs,
      unexpectedApprovedWarningRuleIDs,
      unapprovedBlockRuleIDs,
      unexpectedApprovedBlockRuleIDs,
    }),
    approvedWarningRuleIDs: reviewGateStatus === "approved" ? approvedWarningRuleIDs : [],
    approvedBlockRuleIDs: reviewGateStatus === "approved" ? approvedBlockRuleIDs : [],
    missingWarningRuleIDs,
    unexpectedApprovedWarningRuleIDs,
  }

  const entry = {
    id: input.args.catalogId ?? defaultCatalogID(input.args.repo, input.skill.name),
    displayName: input.args.displayName ?? input.skill.name,
    summary: input.args.summary ?? input.skill.description,
    categories: input.args.categories,
    tags: input.args.tags,
    source: input.source,
    integrity: {
      algorithm: "tree-sha256-v1" as const,
      sha256: "",
      sizeBytes: input.stats.totalBytes,
      fileCount: input.stats.fileCount,
    },
    review: Object.assign(
      Object.assign(
        {
          approvedAt: input.now ?? new Date().toISOString(),
          policyVersion: input.args.policyVersion,
        },
        input.args.approvedBy ? { approvedBy: input.args.approvedBy } : undefined,
        reviewGate.approvedWarningRuleIDs.length > 0
          ? { approvedWarningRuleIDs: reviewGate.approvedWarningRuleIDs }
          : undefined,
      ),
      reviewGate.approvedBlockRuleIDs.length > 0
        ? { approvedBlockRuleIDs: reviewGate.approvedBlockRuleIDs }
        : undefined,
      input.args.notes ? { notes: input.args.notes } : undefined,
    ),
    status: input.args.status,
  } satisfies SkillCatalogEntry

  return {
    scan: {
      scannerPolicyVersion: SCANNER_POLICY_VERSION,
      decision: input.scan.decision,
      warningRuleIDs,
      blockRuleIDs,
      findingCount: input.scan.findings.length,
    },
    reviewGate,
    catalogPath: CATALOG_PATH,
    writeRequested: input.args.write,
    replaceExisting: input.args.replaceExisting,
    writePerformed: false,
    entry,
  }
}

function requiredWriteMetadata(args: CurationArgs, output: CurationOutput) {
  if (!args.write || !output.reviewGate.writeAllowed) {
    return
  }
  if (!args.approvedBy) {
    throw new Error("Catalog writes require --approved-by for an auditable maintainer record.")
  }
  if (
    (output.reviewGate.approvedWarningRuleIDs.length > 0 ||
      output.reviewGate.approvedBlockRuleIDs.length > 0) &&
    !args.notes
  ) {
    throw new Error(
      "Catalog writes that approve scanner warnings or blocks require --notes explaining why the findings are safe.",
    )
  }
}

function outputExitCode(output: CurationOutput) {
  if (output.reviewGate.status === "blocked_findings") {
    return EXIT_CODE_SCAN_BLOCKED
  }
  if (output.reviewGate.status === "warnings_require_explicit_approval") {
    return EXIT_CODE_WARNINGS_REQUIRE_APPROVAL
  }
  if (output.reviewGate.status === "warning_approval_mismatch") {
    return EXIT_CODE_WARNING_APPROVAL_MISMATCH
  }
  return 0
}

export async function runCuration(args: CurationArgs): Promise<CurationOutput> {
  const source = {
    type: "github" as const,
    repo: args.repo,
    path: args.sourcePath,
    ref: args.ref,
  }
  const fetched = await fetchPinnedGitHubSkill(source)
  try {
    const skillDocumentPath = path.join(fetched.skillRoot, SKILL_DOCUMENT_FILENAME)
    const skill = await loadManagedSkillFile(skillDocumentPath)
    if (!skill) {
      throw new Error("Fetched skill has invalid SKILL.md metadata")
    }

    const integritySha = await computeSkillTreeSha256(fetched.skillRoot)
    const scan = await scanSkillDirectory(fetched.skillRoot)
    const output = buildCurationOutput({
      args,
      skill,
      source,
      stats: fetched.stats,
      scan,
    })
    output.entry.integrity.sha256 = integritySha
    requiredWriteMetadata(args, output)

    if (args.write && output.reviewGate.writeAllowed) {
      await writeCatalogEntry({
        entry: output.entry,
        replaceExisting: args.replaceExisting,
      })
      output.writePerformed = true
    }

    return output
  } finally {
    await fetched.cleanup()
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage())
    return
  }

  const args = parseArgs(process.argv.slice(2))
  const output = await runCuration(args)
  console.log(JSON.stringify(output, null, 2))
  process.exitCode = outputExitCode(output)
}

if (import.meta.main) {
  await main().catch(withError)
}
