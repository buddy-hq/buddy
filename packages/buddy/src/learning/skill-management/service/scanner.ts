import fsp from "node:fs/promises"
import path from "node:path"
import {
  DEFAULT_SKILL_TREE_LIMITS,
  normalizeSkillTreeLimits,
  shouldIncludeSkillTreePath,
  toPosixRelativePath,
  type SkillTreeLimits,
} from "./tree-limits"

export const SCANNER_POLICY_VERSION = 1

const EVIDENCE_MAX_LENGTH = 160
const TEXT_READ_ENCODING = "utf8"
const EXECUTABLE_MODE_MASK = 0o111
const SAMPLE_BYTES_FOR_BINARY_CHECK = 8_192

export type SkillScanSeverity = "block" | "warn"
export type SkillScanCategory =
  | "structure"
  | "unicode"
  | "secret"
  | "credential_access"
  | "exfiltration"
  | "destructive"
  | "download_execute"
  | "prompt_injection"
  | "dependency"
  | "filesystem"
  | "network"

export type SkillScanFinding = {
  ruleId: string
  severity: SkillScanSeverity
  category: SkillScanCategory
  file: string
  line: number
  message: string
  evidence: string
}

export type SkillScanDecision = "allow" | "warn" | "block"

export type SkillScanResult = {
  scannerPolicyVersion: number
  decision: SkillScanDecision
  findings: SkillScanFinding[]
  scannedFiles: number
  fileCount: number
  totalBytes: number
}

export type SkillScannerOptions = {
  limits?: Partial<SkillTreeLimits>
}

type SourceRule = {
  ruleId: string
  severity: SkillScanSeverity
  category: SkillScanCategory
  message: string
  pattern: RegExp
  requiresContext?: RegExp
}

type SkillTreeEntry = {
  absolutePath: string
  relativePath: string
  kind: "file" | "directory" | "symlink" | "other"
  size: number
  mode: number
}

const SCANNABLE_EXTENSIONS = new Set([
  ".bash",
  ".cfg",
  ".cjs",
  ".conf",
  ".config",
  ".css",
  ".csv",
  ".fish",
  ".html",
  ".ini",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".markdown",
  ".md",
  ".mjs",
  ".pem",
  ".pl",
  ".ps1",
  ".py",
  ".rb",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
])

const SCANNABLE_FILENAMES = new Set([
  ".dockerignore",
  ".env",
  ".gitignore",
  "Dockerfile",
  "Makefile",
  "README",
  "SKILL.md",
])

const SUSPICIOUS_BINARY_EXTENSIONS = new Set([
  ".app",
  ".bin",
  ".com",
  ".dat",
  ".deb",
  ".dll",
  ".dmg",
  ".dylib",
  ".exe",
  ".msi",
  ".rpm",
  ".so",
])

const SCRIPT_EXTENSIONS = new Set([
  ".bash",
  ".fish",
  ".js",
  ".mjs",
  ".pl",
  ".ps1",
  ".py",
  ".rb",
  ".sh",
  ".zsh",
])

const INVISIBLE_UNICODE = new Map([
  ["\u200b", "zero-width space"],
  ["\u200c", "zero-width non-joiner"],
  ["\u200d", "zero-width joiner"],
  ["\u202a", "left-to-right embedding"],
  ["\u202b", "right-to-left embedding"],
  ["\u202c", "pop directional formatting"],
  ["\u202d", "left-to-right override"],
  ["\u202e", "right-to-left override"],
  ["\u2060", "word joiner"],
  ["\u2062", "invisible times"],
  ["\u2063", "invisible separator"],
  ["\u2064", "invisible plus"],
  ["\u2066", "left-to-right isolate"],
  ["\u2067", "right-to-left isolate"],
  ["\u2068", "first strong isolate"],
  ["\u2069", "pop directional isolate"],
  ["\ufeff", "zero-width no-break space"],
])

const SOURCE_RULES: SourceRule[] = [
  {
    ruleId: "private-key",
    severity: "block",
    category: "secret",
    message: "Private key material detected",
    pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i,
  },
  {
    ruleId: "hardcoded-secret",
    severity: "block",
    category: "secret",
    message: "Hardcoded credential-like value detected",
    pattern:
      /\b[A-Z0-9_-]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)[A-Z0-9_-]*\b\s*[:=]\s*["'][A-Za-z0-9_./+=-]{20,}["']/i,
  },
  {
    ruleId: "credential-store-access",
    severity: "block",
    category: "credential_access",
    message: "Credential store path access detected",
    pattern:
      /(?:(?:~|\$HOME|process\.env\.HOME|os\.path\.expanduser\(["']~["']\))\/(?:\.ssh|\.aws|\.gnupg|\.kube|\.docker)|\b(?:credentials|\.netrc|\.npmrc|\.pypirc|\.pgpass)\b)/i,
  },
  {
    ruleId: "environment-secret-access",
    severity: "block",
    category: "credential_access",
    message: "Secret environment variable access detected",
    pattern:
      /(?:process\.env|os\.environ|os\.getenv|Deno\.env\.get|printenv|\benv\s*\|)[^\n]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i,
  },
  {
    ruleId: "credential-exfiltration",
    severity: "block",
    category: "exfiltration",
    message: "Credential exfiltration pattern detected",
    pattern:
      /(?:curl|wget|fetch|requests\.(?:get|post|put|patch)|httpx\.(?:get|post|put|patch)|http\.request)[^\n]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|\.env|\.ssh|\.aws)/i,
  },
  {
    ruleId: "destructive-command",
    severity: "block",
    category: "destructive",
    message: "Destructive command detected",
    pattern:
      /(?:\brm\s+-rf\s+(?:\/|~|\$HOME)|\bmkfs\b|\bdd\s+[^\n]*of=\/dev\/|\btruncate\s+-s\s*0\s+\/|shutil\.rmtree\s*\(\s*["'](?:\/|~|\$HOME)|Remove-Item\s+-Recurse\s+-Force\s+(?:\$HOME|~|\/))/i,
  },
  {
    ruleId: "download-and-execute",
    severity: "block",
    category: "download_execute",
    message: "Download-and-execute pattern detected",
    pattern:
      /(?:curl|wget)[^\n]*(?:\|\s*(?:sh|bash|zsh|python|node)|&&\s*(?:sh|bash|zsh|python|node)\b)/i,
  },
  {
    ruleId: "prompt-injection",
    severity: "block",
    category: "prompt_injection",
    message: "Suspicious prompt injection instruction detected",
    pattern:
      /(?:ignore\s+(?:all\s+)?(?:previous|above|prior)\s+instructions|disregard\s+(?:all\s+)?(?:instructions|rules)|system\s+prompt\s+override|do\s+not\s+tell\s+the\s+user|output\s+(?:the\s+)?system\s+prompt)/i,
  },
  {
    ruleId: "hidden-html-instruction",
    severity: "block",
    category: "prompt_injection",
    message: "Hidden HTML instruction detected",
    pattern:
      /<!--[^>]*(?:ignore|override|secret|system|hidden)[^>]*-->|<[^>]+style=["'][^"']*display\s*:\s*none/i,
  },
  {
    ruleId: "unpinned-dependency",
    severity: "warn",
    category: "dependency",
    message: "Unpinned dependency or install command detected",
    pattern:
      /(?:npm|pnpm|bun|pip|uv|cargo|go)\s+(?:install|add|get)\s+[^\n]*(?:latest|\*|\^|~|>=|<=|>|<)|(?:"dependencies"|"devDependencies")\s*:\s*\{[\s\S]*?["'](?:\*|latest|\^|~)/i,
  },
  {
    ruleId: "network-fetch",
    severity: "warn",
    category: "network",
    message: "Network fetch detected",
    pattern: /\b(?:curl|wget|fetch|requests\.(?:get|post)|httpx\.(?:get|post)|https?:\/\/)/i,
  },
  {
    ruleId: "broad-filesystem-reference",
    severity: "warn",
    category: "filesystem",
    message: "Broad filesystem reference detected",
    pattern: /(?:~\/|\$HOME\/|\/Users\/|\/home\/|C:\\Users\\|\.\.\/\.\.\/)/i,
  },
]

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function truncateEvidence(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ")
  if (normalized.length <= EVIDENCE_MAX_LENGTH) {
    return normalized
  }
  return normalized.slice(0, EVIDENCE_MAX_LENGTH)
}

function finding(
  input: Omit<SkillScanFinding, "evidence"> & { evidence?: string },
): SkillScanFinding {
  return {
    ...input,
    evidence: truncateEvidence(input.evidence ?? ""),
  }
}

function isKnownTextFile(filePath: string): boolean {
  const basename = path.basename(filePath)
  return (
    SCANNABLE_FILENAMES.has(basename) ||
    SCANNABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
  )
}

async function shouldScanTextFile(entry: SkillTreeEntry): Promise<boolean> {
  if (isKnownTextFile(entry.relativePath)) {
    return true
  }

  const extension = path.extname(entry.relativePath).toLowerCase()
  if (SUSPICIOUS_BINARY_EXTENSIONS.has(extension)) {
    return false
  }

  return !(await containsNullByte(entry.absolutePath))
}

function isScriptFile(filePath: string): boolean {
  return SCRIPT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function hasExecutableBit(mode: number): boolean {
  return (mode & EXECUTABLE_MODE_MASK) !== 0
}

async function walkSkillTree(root: string): Promise<SkillTreeEntry[]> {
  const resolvedRoot = path.resolve(root)
  const entries: SkillTreeEntry[] = []
  const stack = [resolvedRoot]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) {
      continue
    }

    const dirents = await fsp.readdir(current, { withFileTypes: true })
    dirents.sort((left, right) => comparePaths(left.name, right.name))
    for (const dirent of dirents) {
      const absolutePath = path.join(current, dirent.name)
      if (!shouldIncludeSkillTreePath(resolvedRoot, absolutePath)) {
        continue
      }
      const relativePath = toPosixRelativePath(resolvedRoot, absolutePath)
      const stat = await fsp.lstat(absolutePath)

      if (stat.isSymbolicLink()) {
        entries.push({ absolutePath, relativePath, kind: "symlink", size: 0, mode: stat.mode })
        continue
      }
      if (stat.isDirectory()) {
        entries.push({ absolutePath, relativePath, kind: "directory", size: 0, mode: stat.mode })
        stack.push(absolutePath)
        continue
      }
      if (stat.isFile()) {
        entries.push({
          absolutePath,
          relativePath,
          kind: "file",
          size: stat.size,
          mode: stat.mode,
        })
        continue
      }
      entries.push({ absolutePath, relativePath, kind: "other", size: 0, mode: stat.mode })
    }
  }

  return entries.toSorted((left, right) => comparePaths(left.relativePath, right.relativePath))
}

async function containsNullByte(filePath: string): Promise<boolean> {
  const handle = await fsp.open(filePath, "r")
  try {
    const buffer = Buffer.alloc(SAMPLE_BYTES_FOR_BINARY_CHECK)
    const result = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, result.bytesRead).includes(0)
  } finally {
    await handle.close()
  }
}

function sourceRuleFinding(input: {
  rule: SourceRule
  relativePath: string
  source: string
}): SkillScanFinding | undefined {
  if (input.rule.requiresContext && !input.rule.requiresContext.test(input.source)) {
    return undefined
  }
  const match = input.rule.pattern.exec(input.source)
  if (!match) {
    return undefined
  }

  const prefix = input.source.slice(0, match.index)
  const line = prefix.split("\n").length
  const lineSource = input.source.split("\n")[line - 1] ?? match[0]
  return finding({
    ruleId: input.rule.ruleId,
    severity: input.rule.severity,
    category: input.rule.category,
    file: input.relativePath,
    line,
    message: input.rule.message,
    evidence: lineSource,
  })
}

function unicodeFindings(input: { relativePath: string; source: string }): SkillScanFinding[] {
  const findings: SkillScanFinding[] = []
  const lines = input.source.split("\n")
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    for (const [character, name] of INVISIBLE_UNICODE) {
      if (!line.includes(character)) {
        continue
      }
      findings.push(
        finding({
          ruleId: "hidden-unicode",
          severity: "block",
          category: "unicode",
          file: input.relativePath,
          line: index + 1,
          message: `Hidden Unicode character detected: ${name}`,
          evidence: `U+${character.codePointAt(0)?.toString(16).toUpperCase() ?? "UNKNOWN"}`,
        }),
      )
      break
    }
  }
  return findings
}

async function textFileFindings(entry: SkillTreeEntry): Promise<{
  scanned: boolean
  findings: SkillScanFinding[]
}> {
  if (!(await shouldScanTextFile(entry))) {
    return { scanned: false, findings: [] }
  }

  const source = await fsp.readFile(entry.absolutePath, TEXT_READ_ENCODING).catch(() => undefined)
  if (source === undefined) {
    return { scanned: false, findings: [] }
  }

  const findings: SkillScanFinding[] = []
  findings.push(...unicodeFindings({ relativePath: entry.relativePath, source }))
  for (const rule of SOURCE_RULES) {
    const ruleFinding = sourceRuleFinding({ rule, relativePath: entry.relativePath, source })
    if (ruleFinding) {
      findings.push(ruleFinding)
    }
  }

  return { scanned: true, findings }
}

async function symlinkFinding(root: string, entry: SkillTreeEntry): Promise<SkillScanFinding> {
  const rootRealPath = await fsp.realpath(root)
  const targetRealPath = await fsp.realpath(entry.absolutePath).catch(() => undefined)
  const escapesRoot =
    targetRealPath === undefined ||
    (path.relative(rootRealPath, targetRealPath) !== "" &&
      (path.relative(rootRealPath, targetRealPath).startsWith("..") ||
        path.isAbsolute(path.relative(rootRealPath, targetRealPath))))

  return finding({
    ruleId: escapesRoot ? "symlink-escape" : "symlink-present",
    severity: escapesRoot ? "block" : "warn",
    category: "structure",
    file: entry.relativePath,
    line: 0,
    message: escapesRoot
      ? "Symlink escapes the skill directory"
      : "Symlink present in skill directory",
    evidence: targetRealPath ?? "unresolved symlink",
  })
}

async function structuralFindings(input: {
  root: string
  entries: SkillTreeEntry[]
  limits: SkillTreeLimits
}): Promise<SkillScanFinding[]> {
  const findings: SkillScanFinding[] = []
  const files = input.entries.filter((entry) => entry.kind === "file")
  const totalBytes = files.reduce((sum, entry) => sum + entry.size, 0)

  if (files.length > input.limits.maxFiles) {
    findings.push(
      finding({
        ruleId: "too-many-files",
        severity: "block",
        category: "structure",
        file: "(directory)",
        line: 0,
        message: "Skill contains too many files",
        evidence: `${files.length} files; limit is ${input.limits.maxFiles}`,
      }),
    )
  }
  if (totalBytes > input.limits.maxTotalBytes) {
    findings.push(
      finding({
        ruleId: "oversized-tree",
        severity: "block",
        category: "structure",
        file: "(directory)",
        line: 0,
        message: "Skill tree is too large",
        evidence: `${totalBytes} bytes; limit is ${input.limits.maxTotalBytes}`,
      }),
    )
  }

  for (const entry of input.entries) {
    if (entry.kind === "symlink") {
      findings.push(await symlinkFinding(input.root, entry))
      continue
    }
    if (entry.kind !== "file") {
      continue
    }

    if (entry.size > input.limits.maxFileBytes) {
      findings.push(
        finding({
          ruleId: "oversized-file",
          severity: "warn",
          category: "structure",
          file: entry.relativePath,
          line: 0,
          message: "Skill file is large",
          evidence: `${entry.size} bytes; warning threshold is ${input.limits.maxFileBytes}`,
        }),
      )
    }

    const extension = path.extname(entry.relativePath).toLowerCase()
    if (SUSPICIOUS_BINARY_EXTENSIONS.has(extension)) {
      findings.push(
        finding({
          ruleId: "suspicious-binary",
          severity: "block",
          category: "structure",
          file: entry.relativePath,
          line: 0,
          message: "Suspicious binary artifact detected",
          evidence: extension,
        }),
      )
    } else if (
      !isKnownTextFile(entry.relativePath) &&
      (await containsNullByte(entry.absolutePath))
    ) {
      findings.push(
        finding({
          ruleId: "binary-content",
          severity: "block",
          category: "structure",
          file: entry.relativePath,
          line: 0,
          message: "Binary content detected in skill tree",
          evidence: "NUL byte in file sample",
        }),
      )
    }

    if (hasExecutableBit(entry.mode)) {
      findings.push(
        finding({
          ruleId: isScriptFile(entry.relativePath) ? "executable-script" : "unexpected-executable",
          severity: "warn",
          category: "structure",
          file: entry.relativePath,
          line: 0,
          message: isScriptFile(entry.relativePath)
            ? "Executable script detected"
            : "Unexpected executable bit detected",
          evidence: "executable bit set",
        }),
      )
    }
  }

  return findings
}

function scanDecision(findings: SkillScanFinding[]): SkillScanDecision {
  if (findings.some((entry) => entry.severity === "block")) {
    return "block"
  }
  if (findings.some((entry) => entry.severity === "warn")) {
    return "warn"
  }
  return "allow"
}

export async function scanSkillDirectory(
  root: string,
  options?: SkillScannerOptions,
): Promise<SkillScanResult> {
  const limits = normalizeSkillTreeLimits(options?.limits ?? DEFAULT_SKILL_TREE_LIMITS)
  const resolvedRoot = path.resolve(root)
  const entries = await walkSkillTree(resolvedRoot)
  const findings: SkillScanFinding[] = await structuralFindings({
    root: resolvedRoot,
    entries,
    limits,
  })
  let scannedFiles = 0

  for (const entry of entries) {
    if (entry.kind !== "file") {
      continue
    }
    const scan = await textFileFindings(entry)
    if (scan.scanned) {
      scannedFiles += 1
      findings.push(...scan.findings)
    }
  }

  const files = entries.filter((entry) => entry.kind === "file")
  return {
    scannerPolicyVersion: SCANNER_POLICY_VERSION,
    decision: scanDecision(findings),
    findings,
    scannedFiles,
    fileCount: files.length,
    totalBytes: files.reduce((sum, entry) => sum + entry.size, 0),
  }
}
