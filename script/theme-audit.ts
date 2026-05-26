#!/usr/bin/env bun

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import {
  defaultThemes,
  hexToRgb,
  resolveThemeVariant,
  type HexColor,
  type ResolvedTheme,
} from "@buddy/opencode-adapter/theme"

const SOURCE_ROOTS = ["packages/ui/src", "packages/web/src"] as const
const SOURCE_EXTENSIONS = [".css", ".ts", ".tsx"] as const
const IGNORED_PATH_PARTS = [".stories.", "/designs/"] as const
const UI_PRIMITIVES_ROOT = "packages/ui/src/components/ui" as const
const PRIMITIVE_DARK_MODE_EXCEPTIONS = ["packages/ui/src/components/ui/chart.tsx"] as const

const FORBIDDEN_UTILITY_CLASSES = [
  "bg-amber-500",
  "bg-border",
  "bg-border-weak",
  "bg-border-weaker",
  "bg-card",
  "bg-brand-base",
  "bg-emerald-500",
  "bg-primary",
  "bg-surface-tertiary",
  "border-amber-400",
  "border-border-strong",
  "border-brand-base",
  "border-input",
  "border-primary",
  "border-yellow-500",
  "ring-interactive-base",
  "ring-primary",
  "text-amber-200",
  "text-amber-900",
  "text-brand-base",
  "text-destructive",
  "text-foreground",
  "text-icon-weak",
  "text-muted-foreground",
  "text-primary",
  "text-white",
] as const

const CONTRAST_CHECKS = [
  { name: "body text", foreground: "text-base", background: "background-base", minimum: 4.5 },
  { name: "strong text", foreground: "text-strong", background: "background-base", minimum: 4.5 },
  { name: "weak text", foreground: "text-weak", background: "background-base", minimum: 4.5 },
  { name: "subtle text", foreground: "text-weaker", background: "background-base", minimum: 3 },
  {
    name: "interactive text",
    foreground: "text-interactive-base",
    background: "background-base",
    minimum: 4.5,
  },
  {
    name: "primary button text",
    foreground: "text-on-button-primary-base",
    background: "button-primary-base",
    minimum: 4.5,
  },
  {
    name: "interactive fill text",
    foreground: "text-on-interactive-base",
    background: "surface-interactive-base",
    minimum: 4.5,
  },
  {
    name: "critical fill text",
    foreground: "text-on-critical-base",
    background: "surface-critical-base",
    minimum: 4.5,
  },
  {
    name: "critical weak fill text",
    foreground: "text-on-critical-weak",
    background: "surface-critical-weak",
    minimum: 4.5,
  },
  {
    name: "warning fill text",
    foreground: "text-on-warning-base",
    background: "surface-warning-base",
    minimum: 4.5,
  },
  {
    name: "warning weak fill text",
    foreground: "text-on-warning-weak",
    background: "surface-warning-weak",
    minimum: 4.5,
  },
  {
    name: "success fill text",
    foreground: "text-on-success-base",
    background: "surface-success-base",
    minimum: 4.5,
  },
  {
    name: "success weak fill text",
    foreground: "text-on-success-weak",
    background: "surface-success-weak",
    minimum: 4.5,
  },
  {
    name: "info weak fill text",
    foreground: "text-on-info-weak",
    background: "surface-info-weak",
    minimum: 4.5,
  },
  {
    name: "tooltip text",
    foreground: "text-strong",
    background: "surface-raised-stronger-non-alpha",
    minimum: 4.5,
  },
  {
    name: "status success text",
    foreground: "text-success-base",
    background: "background-base",
    minimum: 4.5,
  },
  {
    name: "status warning text",
    foreground: "text-warning-base",
    background: "background-base",
    minimum: 4.5,
  },
  {
    name: "status critical text",
    foreground: "text-critical-base",
    background: "background-base",
    minimum: 4.5,
  },
] as const

type AuditFailure = {
  message: string
}

function toLinearRgb(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)
}

function isSourceFile(path: string): boolean {
  if (!SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))) return false
  return !IGNORED_PATH_PARTS.some((part) => path.includes(part))
}

function listSourceFiles(root: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(root)) {
    const path = join(root, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(path))
      continue
    }
    if (stats.isFile() && isSourceFile(path)) {
      files.push(path)
    }
  }

  return files
}

function luminance(color: HexColor): number {
  const rgb = hexToRgb(color)

  return 0.2126 * toLinearRgb(rgb.r) + 0.7152 * toLinearRgb(rgb.g) + 0.0722 * toLinearRgb(rgb.b)
}

function contrastRatio(foreground: HexColor, background: HexColor): number {
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

function readHex(tokens: ResolvedTheme, token: string): HexColor | undefined {
  const value = tokens[token]
  if (!value?.startsWith("#")) return undefined
  return value
}

function auditContrast(): AuditFailure[] {
  const failures: AuditFailure[] = []

  for (const [themeID, theme] of Object.entries(defaultThemes)) {
    for (const mode of ["light", "dark"] as const) {
      const tokens = resolveThemeVariant(theme[mode], mode === "dark")
      for (const check of CONTRAST_CHECKS) {
        const foreground = readHex(tokens, check.foreground)
        const background = readHex(tokens, check.background)
        if (!foreground || !background) {
          failures.push({
            message: `${themeID}/${mode} is missing ${check.foreground} or ${check.background}`,
          })
          continue
        }

        const ratio = contrastRatio(foreground, background)
        if (ratio < check.minimum) {
          failures.push({
            message: `${themeID}/${mode} ${check.name} contrast ${ratio.toFixed(2)} < ${check.minimum}`,
          })
        }
      }
    }
  }

  return failures
}

function classPattern(className: string): RegExp {
  return new RegExp(`(^|[^a-zA-Z0-9_:/-])${className.replaceAll("-", "\\-")}($|[^a-zA-Z0-9_:/-])`)
}

function auditForbiddenUtilities(): AuditFailure[] {
  const failures: AuditFailure[] = []
  const patterns = FORBIDDEN_UTILITY_CLASSES.map((className) => ({
    className,
    pattern: classPattern(className),
  }))

  for (const root of SOURCE_ROOTS) {
    for (const file of listSourceFiles(root)) {
      const source = readFileSync(file, "utf8")
      for (const { className, pattern } of patterns) {
        if (pattern.test(source)) {
          failures.push({
            message: `${relative(process.cwd(), file)} uses forbidden theme utility ${className}`,
          })
        }
      }
    }
  }

  return failures
}

function auditPrimitiveContracts(): AuditFailure[] {
  const failures: AuditFailure[] = []

  for (const file of listSourceFiles(UI_PRIMITIVES_ROOT)) {
    const relativePath = relative(process.cwd(), file)
    const source = readFileSync(file, "utf8")

    if (
      source.includes("dark:") &&
      !PRIMITIVE_DARK_MODE_EXCEPTIONS.some((exception) => relativePath === exception)
    ) {
      failures.push({
        message: `${relativePath} uses dark: in a primitive; encode the state in semantic tokens instead`,
      })
    }
  }

  return failures
}

const failures = [...auditContrast(), ...auditForbiddenUtilities(), ...auditPrimitiveContracts()]

if (failures.length > 0) {
  console.error(`Theme audit failed with ${failures.length} issue(s):`)
  for (const failure of failures) {
    console.error(`- ${failure.message}`)
  }
  process.exit(1)
}

console.log("Theme audit passed.")
