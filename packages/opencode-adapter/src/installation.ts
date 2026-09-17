import openCodePackageJson from "../../../vendor/opencode/packages/opencode/package.json"

const SEMANTIC_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/u

function createOpenCodeUserAgent(version: string): string {
  if (!SEMANTIC_VERSION_PATTERN.test(version)) {
    throw new Error(`Vendored OpenCode version is not valid semver: ${version}`)
  }

  return `opencode/${version}`
}

/** The release version declared by the vendored OpenCode package. */
export const OpenCodeVersion = openCodePackageJson.version

/** The release user agent required by OpenCode-hosted inference services. */
export const OpenCodeUserAgent = createOpenCodeUserAgent(OpenCodeVersion)

export { InstallationChannel } from "@opencode-ai/core/installation/version"
