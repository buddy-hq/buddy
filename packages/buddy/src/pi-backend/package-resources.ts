import { dirname } from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

const PI_PACKAGE_MANIFESTS = [
  "pi-subagents/package.json",
  "pi-mcp-adapter/package.json",
  "pi-web-access/package.json",
]

export function piPackageResourcePaths(): string[] {
  return PI_PACKAGE_MANIFESTS.map((manifest) => dirname(require.resolve(manifest)))
}
