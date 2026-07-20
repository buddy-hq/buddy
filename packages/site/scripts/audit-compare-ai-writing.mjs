#!/usr/bin/env node
/**
 * Audit human-facing compare-page copy with the avoid-ai-writing detector.
 *
 * Why a temp hold-out file:
 * - Compare pages must repeat product names (Buddy, ChatGPT, …) for SEO and clarity.
 * - That repetition triggers low-TTR and can drown real AI-ism signals.
 * - We hold out proper nouns only, then still fail on every high + medium issue.
 *
 * Usage (from repo root or packages/site):
 *   node packages/site/scripts/audit-compare-ai-writing.mjs
 *   node packages/site/scripts/audit-compare-ai-writing.mjs --write-temps
 *
 * Exit codes:
 *   0 — no high/medium issues (low-ttr may remain as informational)
 *   1 — high or medium issues found
 */

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SITE_ROOT = path.resolve(__dirname, "..")
const COMPARE_DIR = path.join(SITE_ROOT, "src/content/compares")
const HOME = process.env.HOME ?? ""
const DETECTOR_CANDIDATES = [
  process.env.AVOID_AI_DETECTOR,
  path.join(HOME, "code/avoid-ai-writing/detector/patterns.js"),
  path.resolve(SITE_ROOT, "../../../code/avoid-ai-writing/detector/patterns.js"),
  path.resolve(SITE_ROOT, "../../../../code/avoid-ai-writing/detector/patterns.js"),
].filter((candidate) => typeof candidate === "string" && candidate.length > 0)

const DETECTOR_PATH =
  DETECTOR_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? DETECTOR_CANDIDATES[0]
const TEMP_DIR = path.join("/tmp", "buddy-compare-ai-audit")
const WRITE_TEMPS = process.argv.includes("--write-temps")

/** Proper nouns / product identity only — not study/practice/free/local SEO terms. */
const HOLD_OUT = [
  [/\bBuddy\b/g, "AppA"],
  [/\bChatGPT\b/g, "AppB"],
  [/\bOpenAI\b/g, "VendorA"],
  [/\bNotebookLM\b/g, "AppB"],
  [/\bGemini Notebook\b/g, "AppB"],
  [/\bGemini\b/g, "ModelA"],
  [/\bGoogle\b/g, "VendorB"],
  [/\bMagicSchool(?: AI)?\b/g, "AppB"],
  [/\bDiffit\b/g, "AppB"],
  [/\bKnowt\b/g, "AppB"],
  [/\bClaude for Teachers\b/g, "AppB"],
  [/\bClaude\b/g, "AppB"],
  [/\bAnthropic\b/g, "VendorA"],
  [/\bKhanmigo\b/g, "AppB"],
  [/\bKhan Academy\b/g, "VendorB"],
  [/\bQuizlet\b/g, "AppB"],
  [/\bRemNote\b/g, "AppB"],
  [/\bAnki\b/g, "AppC"],
  [/\bMicrosoft\b/g, "VendorC"],
  [/\bCanvas\b/g, "LmsA"],
  [/\bSchoology\b/g, "LmsB"],
]

function holdOutProductNames(text) {
  let next = text
  for (const [pattern, replacement] of HOLD_OUT) {
    next = next.replace(pattern, replacement)
  }
  return next
}

function extractHumanFacing(yamlText) {
  const chunks = []

  for (const match of yamlText.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)) {
    const value = match[1]
    if (value.length >= 12 && !/^https?:/i.test(value)) {
      chunks.push(value)
    }
  }

  for (const match of yamlText.matchAll(/:\s+([^"'#\n][^\n]{18,})\s*$/gm)) {
    const value = match[1].trim()
    if (
      !/^https?:/i.test(value) &&
      !/^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !value.startsWith("[") &&
      !/^(learners|educators|both)$/.test(value)
    ) {
      chunks.push(value)
    }
  }

  for (const match of yamlText.matchAll(/^\s+-\s+([^"'#\n\[][^\n]{18,})\s*$/gm)) {
    chunks.push(match[1].trim())
  }

  const lines = yamlText.split("\n")
  for (let index = 0; index < lines.length; index += 1) {
    if (!/:\s*>-?\s*$/.test(lines[index])) continue
    const parts = []
    index += 1
    while (index < lines.length && /^\s{2,}\S/.test(lines[index])) {
      parts.push(lines[index].trim())
      index += 1
    }
    index -= 1
    if (parts.length > 0) chunks.push(parts.join(" "))
  }

  const seen = new Set()
  return chunks.filter((chunk) => {
    const key = chunk.replace(/\s+/g, " ").trim()
    if (key.length < 12 || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isActionable(issue) {
  if (issue.severity === "high" || issue.severity === "medium") return true
  // Keep low noise that is not product-name TTR
  if (issue.severity === "low" && issue.type !== "low-ttr") return true
  return false
}

function loadDetector() {
  if (!fs.existsSync(DETECTOR_PATH)) {
    console.error(`Detector not found at ${DETECTOR_PATH}`)
    console.error("Set AVOID_AI_DETECTOR to patterns.js from avoid-ai-writing.")
    process.exit(2)
  }
  return require(DETECTOR_PATH)
}

function main() {
  const AIDetector = loadDetector()
  const files = fs
    .readdirSync(COMPARE_DIR)
    .filter((name) => name.startsWith("buddy-vs-") && name.endsWith(".yaml"))
    .sort()

  if (files.length === 0) {
    console.error(`No buddy-vs-*.yaml files in ${COMPARE_DIR}`)
    process.exit(2)
  }

  if (WRITE_TEMPS) {
    fs.mkdirSync(TEMP_DIR, { recursive: true })
  }

  /** @type {Array<{ file: string, severity: string, type: string, text: string }>} */
  const actionable = []
  /** @type {Array<{ file: string, severity: string, type: string, text: string }>} */
  const informational = []

  console.log(`Detector: ${DETECTOR_PATH}`)
  console.log(`Compare dir: ${COMPARE_DIR}`)
  console.log(`Files: ${files.length}`)
  console.log("Hold-out: product proper nouns only (SEO domain words kept)")
  console.log("Actionable: high + medium + low except low-ttr\n")

  for (const file of files) {
    const yamlPath = path.join(COMPARE_DIR, file)
    const yamlText = fs.readFileSync(yamlPath, "utf8")
    const chunks = extractHumanFacing(yamlText)
    const rawText = chunks.join("\n\n")
    const auditText = holdOutProductNames(rawText)

    if (WRITE_TEMPS) {
      const base = file.replace(/\.yaml$/, "")
      fs.writeFileSync(path.join(TEMP_DIR, `${base}.raw.txt`), rawText)
      fs.writeFileSync(path.join(TEMP_DIR, `${base}.audit.txt`), auditText)
    }

    const raw = AIDetector.analyzeText(rawText, { contextMode: "general" })
    const audit = AIDetector.analyzeText(auditText, { contextMode: "general" })

    const pageActionable = audit.issues.filter(isActionable)
    const pageInfo = audit.issues.filter((issue) => !isActionable(issue))

    for (const issue of pageActionable) {
      actionable.push({
        file,
        severity: issue.severity,
        type: issue.type,
        text: String(issue.text ?? issue.match ?? ""),
      })
    }
    for (const issue of pageInfo) {
      informational.push({
        file,
        severity: issue.severity,
        type: issue.type,
        text: String(issue.text ?? ""),
      })
    }

    const actionSummary =
      pageActionable.map((issue) => `${issue.severity}:${issue.type}`).join(", ") || "none"
    const infoSummary =
      pageInfo.map((issue) => `${issue.severity}:${issue.type}`).join(", ") || "none"

    console.log(`${file}`)
    console.log(`  raw=${raw.score} (${raw.label})  audit=${audit.score} (${audit.label})`)
    console.log(`  actionable: ${actionSummary}`)
    console.log(`  informational: ${infoSummary}`)
  }

  // Per-chunk pass: medium flags can dilute in long docs
  console.log("\n--- Per-chunk pass (hold-out, high/medium only) ---")
  let chunkHits = 0
  for (const file of files) {
    const yamlText = fs.readFileSync(path.join(COMPARE_DIR, file), "utf8")
    for (const chunk of extractHumanFacing(yamlText)) {
      if (chunk.length < 40) continue
      const result = AIDetector.analyzeText(holdOutProductNames(chunk), {
        contextMode: "general",
      })
      for (const issue of result.issues) {
        if (issue.severity !== "high" && issue.severity !== "medium") continue
        chunkHits += 1
        actionable.push({
          file: `${file} [chunk]`,
          severity: issue.severity,
          type: issue.type,
          text: `${String(issue.text ?? "")} :: ${chunk.slice(0, 120)}`,
        })
        console.log(
          `  ${issue.severity} ${issue.type} in ${file}: ${String(issue.text ?? "").slice(0, 80)}`,
        )
      }
    }
  }
  if (chunkHits === 0) console.log("  none")

  console.log("\n======== SUMMARY ========")
  console.log(`Actionable (must fix): ${actionable.length}`)
  for (const item of actionable) {
    console.log(`  - ${item.file} [${item.severity}] ${item.type}: ${item.text.slice(0, 140)}`)
  }
  console.log(`Informational (keep for SEO tradeoff): ${informational.length}`)
  const infoByType = informational.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + 1
    return acc
  }, {})
  console.log(`  by type: ${JSON.stringify(infoByType)}`)

  if (WRITE_TEMPS) {
    fs.writeFileSync(
      path.join(TEMP_DIR, "report.json"),
      JSON.stringify({ actionable, informational, files }, null, 2),
    )
    console.log(`\nTemp files: ${TEMP_DIR}`)
  }

  if (actionable.length > 0) {
    console.error("\nFAIL: high/medium (or non-ttr low) issues remain.")
    process.exit(1)
  }

  console.log("\nPASS: no high/medium issues under product-name hold-out.")
  console.log(
    "low-ttr alone is expected on compare pages (repeated study/product vocabulary for SEO).",
  )
  process.exit(0)
}

main()
