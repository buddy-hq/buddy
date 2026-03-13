import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const packageRoot = path.resolve(import.meta.dir, "../..")
const srcRoot = path.join(packageRoot, "src")
const routesRoot = path.join(srcRoot, "routes")

const removedCompatibilityFiles = [
  path.join(srcRoot, "openapi", "compatibility-route.ts"),
  path.join(srcRoot, "openapi", "compatibility-schemas.ts"),
  path.join(srcRoot, "http", "proxy-routes.ts"),
] as const

const forbiddenRouteTokens = [
  "compatibilityRoute(",
  "AnyObjectSchema",
  "withJsonBody(",
  "parseJsonBody(",
  "parseOptionalJsonBody(",
  "parameters:",
] as const

function listRouteFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root)) {
    const fullPath = path.join(root, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...listRouteFiles(fullPath))
      continue
    }
    if (entry.endsWith(".ts")) {
      files.push(fullPath)
    }
  }
  return files
}

describe("route OpenAPI guardrails", () => {
  test("keeps compatibility wrapper files removed", () => {
    for (const removedFile of removedCompatibilityFiles) {
      expect(existsSync(removedFile)).toBe(false)
    }
  })

  test("prevents deprecated route helper patterns", () => {
    const routeFiles = listRouteFiles(routesRoot)
    const violations: string[] = []

    for (const routeFile of routeFiles) {
      const source = readFileSync(routeFile, "utf8")
      for (const token of forbiddenRouteTokens) {
        if (source.includes(token)) {
          violations.push(`${path.relative(packageRoot, routeFile)} contains "${token}"`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
