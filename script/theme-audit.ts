#!/usr/bin/env bun

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import {
  CONTRAST_TARGET,
  blend,
  compositeLayerStack,
  contrastRatio,
  defaultThemes,
  layeredContrastRatio,
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

const TEXT_CONTRAST_CHECKS = [
  {
    name: "body text",
    foreground: "text-base",
    background: ["background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "strong text",
    foreground: "text-strong",
    background: ["background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "weak text",
    foreground: "text-weak",
    background: ["background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "subtle text",
    foreground: "text-weaker",
    background: ["background-base"],
    minimum: CONTRAST_TARGET.largeText,
  },
  {
    name: "interactive text",
    foreground: "text-interactive-base",
    background: ["background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "primary button normal text",
    foreground: "text-on-button-primary-base",
    background: ["button-primary-base", "background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "primary button hover text",
    foreground: "text-on-button-primary-hover",
    background: ["button-primary-hover", "background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "secondary button normal text",
    foreground: "text-on-button-secondary-base",
    background: ["button-secondary-base", "background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "secondary button hover text",
    foreground: "text-on-button-secondary-hover",
    background: ["button-secondary-hover", "background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "destructive button normal text",
    foreground: "text-on-critical-weak",
    background: ["surface-critical-weak", "background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "destructive button hover text",
    foreground: "text-on-critical-base",
    background: ["surface-critical-base", "background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "destructive menu text",
    foreground: "text-critical-on-raised",
    background: ["surface-raised-stronger-non-alpha", "background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "destructive menu highlighted text",
    foreground: "text-on-critical-weak",
    background: ["surface-critical-weak", "surface-raised-stronger-non-alpha", "background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "interactive fill text",
    foreground: "text-on-interactive-base",
    background: ["surface-interactive-base", "background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "tooltip text",
    foreground: "text-strong",
    background: ["surface-raised-stronger-non-alpha", "background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "status success text",
    foreground: "text-success-base",
    background: ["background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "status warning text",
    foreground: "text-warning-base",
    background: ["background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
  {
    name: "status critical text",
    foreground: "text-critical-base",
    background: ["background-base"],
    minimum: CONTRAST_TARGET.normalText,
  },
] as const

type AuditFailure = {
  message: string
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

function readHex(tokens: ResolvedTheme, token: string): HexColor | undefined {
  const value = tokens[token]
  if (!value?.startsWith("#")) return undefined
  return value
}

function auditContrast(): AuditFailure[] {
  const failures: AuditFailure[] = []
  const statusNames = ["critical", "warning", "success", "info"] as const
  const statusStrengths = ["weak", "base", "strong"] as const
  const parentKeys = [
    "background-base",
    "surface-raised-base",
    "surface-raised-stronger-non-alpha",
  ] as const

  for (const [themeID, theme] of Object.entries(defaultThemes)) {
    for (const mode of ["light", "dark"] as const) {
      const tokens = resolveThemeVariant(theme[mode], mode === "dark")
      for (const check of TEXT_CONTRAST_CHECKS) {
        const foreground = readHex(tokens, check.foreground)
        const background = check.background.map((token) => readHex(tokens, token))
        if (!foreground || background.some((color) => !color)) {
          failures.push({
            message: `${themeID}/${mode} is missing ${check.foreground} or ${check.background.join(", ")}`,
          })
          continue
        }

        const [first, ...rest] = background
        if (!first) continue
        const ratio = layeredContrastRatio(foreground, [first, ...rest])
        if (ratio < check.minimum) {
          failures.push({
            message: `${themeID}/${mode} ${check.name} contrast ${ratio.toFixed(2)} < ${check.minimum}`,
          })
        }
      }

      for (const parentKey of parentKeys) {
        const parent = readHex(tokens, parentKey)
        if (!parent) {
          failures.push({ message: `${themeID}/${mode} is missing ${parentKey}` })
          continue
        }

        for (const state of ["base", "hover"] as const) {
          const fill = readHex(tokens, `button-secondary-${state}`)
          const foreground = readHex(tokens, `text-on-button-secondary-${state}`)
          if (!fill || !foreground) {
            failures.push({
              message: `${themeID}/${mode} is missing secondary button ${state} tokens`,
            })
            continue
          }

          const renderedFill = compositeLayerStack([fill, parent])
          const boundaryRatio = contrastRatio(renderedFill, parent)
          if (boundaryRatio < CONTRAST_TARGET.subtleSurface) {
            failures.push({
              message: `${themeID}/${mode} secondary button ${state} fill contrast on ${parentKey} ${boundaryRatio.toFixed(2)} < ${CONTRAST_TARGET.subtleSurface}`,
            })
          }

          const textRatio = layeredContrastRatio(foreground, [fill, parent])
          if (textRatio < CONTRAST_TARGET.normalText) {
            failures.push({
              message: `${themeID}/${mode} secondary button ${state} text contrast on ${parentKey} ${textRatio.toFixed(2)} < ${CONTRAST_TARGET.normalText}`,
            })
          }
        }

        for (const status of statusNames) {
          for (const strength of statusStrengths) {
            const fill = readHex(tokens, `surface-${status}-${strength}`)
            const foreground = readHex(tokens, `text-on-${status}-${strength}`)
            if (!fill || !foreground) {
              failures.push({
                message: `${themeID}/${mode} is missing ${status}-${strength} surface tokens`,
              })
              continue
            }

            const ratio = layeredContrastRatio(foreground, [fill, parent])
            if (ratio < CONTRAST_TARGET.normalText) {
              failures.push({
                message: `${themeID}/${mode} ${status}-${strength} text contrast on ${parentKey} ${ratio.toFixed(2)} < ${CONTRAST_TARGET.normalText}`,
              })
            }
          }
        }

        const warningFill = readHex(tokens, "surface-warning-base")
        const warningForeground = readHex(tokens, "text-on-warning-subtle")
        if (warningFill && warningForeground) {
          const translucentWarning = blend(warningFill, parent, 0.15)
          const ratio = contrastRatio(warningForeground, translucentWarning)
          if (ratio < CONTRAST_TARGET.normalText) {
            failures.push({
              message: `${themeID}/${mode} translucent warning label text contrast on ${parentKey} ${ratio.toFixed(2)} < ${CONTRAST_TARGET.normalText}`,
            })
          }
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
