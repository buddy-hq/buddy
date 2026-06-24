import { existsSync } from "node:fs"
import path from "node:path"
import { Arch, type AfterPackContext, type Configuration } from "electron-builder"
import {
  assertBackendNodeArtifactRuntimeFiles,
} from "../../script/backend-node-artifact"

const CHANNEL_ENV_KEY = "BUDDY_CHANNEL"

type Channel = "dev" | "beta" | "prod"

function resolveChannel(): Channel {
  const raw = process.env[CHANNEL_ENV_KEY]
  if (raw === "dev" || raw === "beta" || raw === "prod") {
    return raw
  }
  return "dev"
}

const channel = resolveChannel()
const runtimeResourceNames = [
  "backend",
  "backend-node",
  "knowledge-graph",
  "migrations",
] as const

function requiredRuntimeResource(name: (typeof runtimeResourceNames)[number]) {
  const resourceDir = new URL(`./resources/${name}`, import.meta.url)
  if (!existsSync(resourceDir)) {
    throw new Error(
      `Required Electron runtime resource missing: resources/${name}. Run the desktop prebuild or prepare:release script before packaging.`,
    )
  }

  return {
    from: `resources/${name}`,
    to: name,
    filter: ["**/*"],
  }
}

const runtimeResources = runtimeResourceNames.map((name) => requiredRuntimeResource(name))

function requiredBackendNodeModulesResource() {
  const nodeModulesDir = new URL("./resources/backend-node/node_modules", import.meta.url)
  if (!existsSync(nodeModulesDir)) {
    throw new Error(
      "Required Electron backend-node runtime packages missing: resources/backend-node/node_modules. Run the desktop prebuild or prepare:release script before packaging.",
    )
  }

  return {
    from: "resources/backend-node/node_modules",
    to: "backend-node/node_modules",
    filter: ["**/*"],
  }
}

function packagedResourcesDir(context: AfterPackContext): string {
  if (context.electronPlatformName === "darwin") {
    return path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      "Contents",
      "Resources",
    )
  }

  return path.join(context.appOutDir, "resources")
}

function assertPackagedRuntimeResources(context: AfterPackContext): void {
  const artifactDir = path.join(packagedResourcesDir(context), "backend-node")
  assertBackendNodeArtifactRuntimeFiles({
    artifactDir,
    target: {
      arch: backendNodeArchName(context.arch),
      platform: context.electronPlatformName,
    },
  })
}

function backendNodeArchName(arch: Arch): string {
  switch (arch) {
    case Arch.arm64:
      return "arm64"
    case Arch.x64:
      return "x64"
    default:
      throw new Error(`Unsupported Buddy backend-node artifact architecture: ${String(arch)}`)
  }
}

const BASE_CONFIGURATION: Configuration = {
  artifactName: "buddy-electron-${os}-${arch}.${ext}",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  files: ["out/**/*"],
  extraResources: [
    ...runtimeResources,
    requiredBackendNodeModulesResource(),
    {
      from: "resources",
      to: "",
      filter: ["mac-install-update.sh"],
    },
  ],
  afterPack: assertPackagedRuntimeResources,
  protocols: {
    name: "Buddy",
    schemes: ["buddy"],
  },
  mac: {
    category: "public.app-category.developer-tools",
    icon: "resources/icons/icon.icns",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    notarize: false,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: true,
  },
  win: {
    icon: "resources/icons/icon.ico",
    target: ["nsis"],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: "resources/icons/icon.ico",
    installerHeaderIcon: "resources/icons/icon.ico",
  },
}

function resolveChannelConfiguration(): Configuration {
  if (channel === "dev") {
    return {
      ...BASE_CONFIGURATION,
      appId: "ai.buddy.desktop.dev",
      productName: "Buddy Dev",
    }
  }

  if (channel === "beta") {
    return {
      ...BASE_CONFIGURATION,
      appId: "ai.buddy.desktop.beta",
      productName: "Buddy Beta",
      publish: {
        provider: "github",
        owner: "prashantbhudwal",
        repo: "buddy-releases",
        channel: "latest",
      },
    }
  }

  return {
    ...BASE_CONFIGURATION,
    appId: "ai.buddy.desktop",
    productName: "Buddy",
    publish: {
      provider: "github",
      owner: "prashantbhudwal",
      repo: "buddy-releases",
      channel: "latest",
    },
  }
}

export default resolveChannelConfiguration()
