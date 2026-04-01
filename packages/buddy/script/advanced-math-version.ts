import fs from "node:fs"

const BACKEND_PACKAGE_JSON = new URL("../package.json", import.meta.url)
const DEFAULT_VERSION = "0.0.1"
const VERSION_OVERRIDE_ENV = "BUDDY_ADVANCED_MATH_VERSION"
const LEGACY_VERSION_ENV = "BUDDY_VERSION"

function readBackendPackageVersion() {
  try {
    const raw = fs.readFileSync(BACKEND_PACKAGE_JSON, "utf8")
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === "string" ? parsed.version.trim() : ""
  } catch {
    return ""
  }
}

function readEnvVersion(name: string) {
  return process.env[name]?.trim() ?? ""
}

export function resolveAdvancedMathRuntimeVersion() {
  const override = readEnvVersion(VERSION_OVERRIDE_ENV)
  if (override) return override

  const backendPackageVersion = readBackendPackageVersion()
  if (backendPackageVersion) return backendPackageVersion

  const scriptVersion = readEnvVersion("npm_package_version")
  if (scriptVersion) return scriptVersion

  const legacy = readEnvVersion(LEGACY_VERSION_ENV)
  if (legacy) return legacy

  return DEFAULT_VERSION
}

export const ADVANCED_MATH_VERSION_OVERRIDE_ENV = VERSION_OVERRIDE_ENV
