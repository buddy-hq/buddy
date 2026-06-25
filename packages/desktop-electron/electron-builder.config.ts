import { existsSync } from "node:fs"
import type { Configuration } from "electron-builder"

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

const BASE_CONFIGURATION: Configuration = {
  artifactName: "buddy-electron-${os}-${arch}.${ext}",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  asarUnpack: [
    "out/main/chunks/node_modules/@lydell/node-pty-*/**/*",
    "out/main/chunks/node_modules/@parcel/watcher-*/**/*",
  ],
  files: ["out/**/*"],
  extraResources: [
    ...runtimeResources,
    {
      from: "resources",
      to: "",
      filter: ["mac-install-update.sh"],
    },
  ],
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
