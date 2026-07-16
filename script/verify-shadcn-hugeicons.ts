#!/usr/bin/env bun
/**
 * One-to-one verification: packages/ui primitives vs official shadcn radix-nova
 * Hugeicons IconPlaceholder mappings + shadcn CLI defaults.
 *
 * Usage:
 *   bun ./script/verify-shadcn-hugeicons.ts
 *   bun ./script/verify-shadcn-hugeicons.ts --offline   # use cached registry under /tmp
 *
 * Exit 1 on icon name, count, strokeWidth, or pattern mismatches.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const REPO_ROOT = join(import.meta.dir, "..")
const UI_ROOT = join(REPO_ROOT, "packages/ui/src/components/ui")
const CACHE_DIR = join(REPO_ROOT, ".cache/shadcn-radix-nova")
const STYLE = "radix-nova"
const REGISTRY_BASE = `https://ui.shadcn.com/r/styles/${STYLE}`

/** Official shadcn CLI hugeicons usage default. */
const EXPECTED_STROKE_WIDTH = "2"

/**
 * Components that embed icons in the official registry.
 * Keep in sync with registry IconPlaceholder usage.
 */
const ICON_COMPONENTS = [
  "accordion",
  "breadcrumb",
  "calendar",
  "carousel",
  "checkbox",
  "combobox",
  "command",
  "context-menu",
  "dialog",
  "dropdown-menu",
  "input-otp",
  "menubar",
  "native-select",
  "navigation-menu",
  "pagination",
  "select",
  "sheet",
  "sidebar",
  "sonner",
  "spinner",
] as const

type OfficialPlaceholder = {
  hugeicons: string
  lucide: string | undefined
  className: string | undefined
}

type OurUsage = {
  icon: string
  strokeWidth: string | undefined
  className: string | undefined
  raw: string
  line: number
}

type ComponentReport = {
  component: string
  ok: boolean
  official: OfficialPlaceholder[]
  ours: OurUsage[]
  errors: string[]
  notes: string[]
}

const offline = process.argv.includes("--offline")

async function fetchRegistry(name: string): Promise<string> {
  const cachePath = join(CACHE_DIR, `${name}.json`)
  if (offline || existsSync(cachePath)) {
    if (!existsSync(cachePath)) {
      throw new Error(`Offline cache missing for ${name}: ${cachePath}`)
    }
    return readFileSync(cachePath, "utf8")
  }
  const url = `${REGISTRY_BASE}/${name}.json`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`)
  }
  const text = await res.text()
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(cachePath, text)
  return text
}

function extractOfficialPlaceholders(registryJson: string): OfficialPlaceholder[] {
  const data = JSON.parse(registryJson) as {
    files?: Array<{ content?: string }>
  }
  const content = (data.files ?? []).map((f) => f.content ?? "").join("\n")
  const out: OfficialPlaceholder[] = []
  const re = /<IconPlaceholder\s*([\s\S]*?)\/>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(content)) !== null) {
    const attrs = match[1] ?? ""
    const map = Object.fromEntries([...attrs.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
    const hugeicons = map.hugeicons
    if (!hugeicons) continue
    out.push({
      hugeicons,
      lucide: map.lucide,
      className: map.className,
    })
  }
  return out
}

function extractOurUsages(source: string): OurUsage[] {
  const out: OurUsage[] = []
  const re = /<HugeiconsIcon\s*([\s\S]*?)\/>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    const attrs = match[1] ?? ""
    const raw = match[0].replace(/\s+/g, " ").trim()
    const before = source.slice(0, match.index)
    const line = before.split("\n").length
    const icon = attrs.match(/icon=\{(\w+)\}/)?.[1]
    if (!icon) continue
    const strokeWidth = attrs.match(/strokeWidth=\{([^}]+)\}/)?.[1]
    const className = attrs.match(/className=(?:"([^"]*)"|\{cn\(([\s\S]*?)\)\})/)?.[1]
    out.push({
      icon,
      strokeWidth,
      className,
      raw,
      line,
    })
  }
  return out
}

function count(list: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const item of list) {
    m.set(item, (m.get(item) ?? 0) + 1)
  }
  return m
}

function mapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false
  for (const [k, v] of a) {
    if (b.get(k) !== v) return false
  }
  return true
}

function strokeWidthOk(value: string | undefined): boolean {
  if (value === EXPECTED_STROKE_WIDTH) return true
  // Spinner / wrappers: strokeWidth={strokeWidth} with default param = 2
  if (value === "strokeWidth") return true
  // Constant import: strokeWidth={SHADCN_HUGEICONS_STROKE_WIDTH}
  if (value === "SHADCN_HUGEICONS_STROKE_WIDTH") return true
  return false
}

async function verifyComponent(name: string): Promise<ComponentReport> {
  const errors: string[] = []
  const notes: string[] = []
  const registryJson = await fetchRegistry(name)
  const official = extractOfficialPlaceholders(registryJson)
  const filePath = join(UI_ROOT, `${name}.tsx`)
  if (!existsSync(filePath)) {
    return {
      component: name,
      ok: false,
      official,
      ours: [],
      errors: [`Missing file ${relative(REPO_ROOT, filePath)}`],
      notes,
    }
  }
  const source = readFileSync(filePath, "utf8")
  const ours = extractOurUsages(source)

  if (source.includes("lucide-react")) {
    errors.push("Still imports lucide-react")
  }

  const offNames = official.map((p) => p.hugeicons)
  const ourNames = ours.map((u) => u.icon)
  if (!mapsEqual(count(offNames), count(ourNames))) {
    errors.push(
      `Icon multiset mismatch.\n    official: [${offNames.join(", ")}]\n    ours:     [${ourNames.join(", ")}]`,
    )
  }

  // Ordered pair check when counts match — same sequence of roles
  if (offNames.length === ourNames.length) {
    for (let i = 0; i < offNames.length; i++) {
      if (offNames[i] !== ourNames[i]) {
        errors.push(
          `Icon order/role mismatch at index ${i}: official=${offNames[i]} ours=${ourNames[i]} (lucide was ${official[i]?.lucide ?? "?"})`,
        )
      }
    }
  }

  for (const usage of ours) {
    if (!strokeWidthOk(usage.strokeWidth)) {
      errors.push(
        `line ${usage.line}: expected strokeWidth={${EXPECTED_STROKE_WIDTH}} (shadcn CLI default), got strokeWidth={${usage.strokeWidth ?? "missing"}} for ${usage.icon}`,
      )
    }
    // Disallow non-official size prop on SVG (shadcn uses CSS sizing)
    if (/\bsize=\{/.test(usage.raw) && !usage.raw.includes("className")) {
      notes.push(`line ${usage.line}: size prop set on ${usage.icon}; shadcn relies on className / parent [&_svg] sizing`)
    }
  }

  // Structural class notes (token renames like text-muted-foreground → text-text-weak are OK)
  const structuralTokens = [
    "pointer-events-none",
    "ml-auto",
    "animate-spin",
    "opacity-0",
    "opacity-100",
    "opacity-50",
    "shrink-0",
  ] as const
  if (offNames.length === ourNames.length) {
    for (let i = 0; i < official.length; i++) {
      const offCn = official[i]?.className ?? ""
      const ourCn = ours[i]?.className ?? ""
      // When official uses cn(...), our parser may miss; skip empty
      if (!offCn) continue
      const missing = structuralTokens.filter((t) => offCn.includes(t) && !ourCn.includes(t) && !source.includes(t))
      // Search broader in surrounding source near usage
      if (missing.length > 0) {
        // Re-check if tokens appear on same HugeiconsIcon raw including multi-line className via cn()
        const raw = ours[i]?.raw ?? ""
        const stillMissing = missing.filter((t) => !raw.includes(t) && !source.includes(`${t}`))
        // Only note — Buddy layout wrappers may move classes to parents (e.g. native-select)
        if (stillMissing.length > 0 && name !== "native-select") {
          notes.push(
            `icon[${i}] ${official[i]?.hugeicons}: official className has [${stillMissing.join(", ")}] not found on our icon (off=${JSON.stringify(offCn)})`,
          )
        }
      }
    }
  }

  return {
    component: name,
    ok: errors.length === 0,
    official,
    ours,
    errors,
    notes,
  }
}

function printMappingTable(reports: ComponentReport[]) {
  console.log("\n=== Official lucide → hugeicons map (radix-nova) ===\n")
  console.log(
    `${"component".padEnd(18)} ${"lucide".padEnd(28)} ${"hugeicons".padEnd(32)} ours`,
  )
  console.log("-".repeat(100))
  for (const report of reports) {
    const n = Math.max(report.official.length, report.ours.length)
    for (let i = 0; i < n; i++) {
      const off = report.official[i]
      const our = report.ours[i]
      const mark = off && our && off.hugeicons === our.icon ? "✓" : "✗"
      console.log(
        `${report.component.padEnd(18)} ${(off?.lucide ?? "—").padEnd(28)} ${(off?.hugeicons ?? "—").padEnd(32)} ${mark} ${our?.icon ?? "—"} sw=${our?.strokeWidth ?? "?"}`,
      )
    }
  }
}

async function main() {
  console.log(`Verifying packages/ui Hugeicons against shadcn ${STYLE} registry`)
  console.log(`Expected pattern: <HugeiconsIcon icon={ICON} strokeWidth={${EXPECTED_STROKE_WIDTH}} />`)
  console.log(offline ? "Mode: offline cache" : "Mode: fetch + cache registry JSON\n")

  const reports: ComponentReport[] = []
  for (const name of ICON_COMPONENTS) {
    reports.push(await verifyComponent(name))
  }

  printMappingTable(reports)

  console.log("\n=== Per-component results ===\n")
  let failed = 0
  for (const report of reports) {
    if (report.ok) {
      console.log(`✓ ${report.component} (${report.official.length} icons)`)
    } else {
      failed++
      console.log(`✗ ${report.component}`)
      for (const err of report.errors) {
        console.log(`    ERROR: ${err}`)
      }
    }
    for (const note of report.notes) {
      console.log(`    note: ${note}`)
    }
  }

  // Global scan: any HugeiconsIcon in packages/ui without strokeWidth
  const uiAll = join(REPO_ROOT, "packages/ui/src")
  const { readdirSync, statSync } = await import("node:fs")
  function walk(dir: string): string[] {
    const out: string[] = []
    for (const ent of readdirSync(dir)) {
      const p = join(dir, ent)
      const st = statSync(p)
      if (st.isDirectory()) out.push(...walk(p))
      else if (ent.endsWith(".tsx") || ent.endsWith(".ts")) out.push(p)
    }
    return out
  }
  const globalErrors: string[] = []
  for (const file of walk(uiAll)) {
    const text = readFileSync(file, "utf8")
    if (!text.includes("HugeiconsIcon")) continue
    const usages = extractOurUsages(text)
    for (const u of usages) {
      if (!strokeWidthOk(u.strokeWidth)) {
        globalErrors.push(
          `${relative(REPO_ROOT, file)}:${u.line}: ${u.icon} missing official strokeWidth={${EXPECTED_STROKE_WIDTH}}`,
        )
      }
    }
  }
  if (globalErrors.length > 0) {
    failed++
    console.log("\n=== Global packages/ui strokeWidth scan ===")
    for (const e of globalErrors) console.log(`  ERROR: ${e}`)
  }

  console.log("\n=== Summary ===")
  const okCount = reports.filter((r) => r.ok).length
  console.log(`${okCount}/${reports.length} components match official icon multisets + order`)
  console.log(`strokeWidth default required: ${EXPECTED_STROKE_WIDTH} (shadcn CLI)`)
  if (failed > 0) {
    console.log(`FAILED with ${failed} component/group error(s)`)
    process.exit(1)
  }
  console.log("OK — one-to-one icon mapping + strokeWidth defaults verified")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
