import { existsSync } from "node:fs"
import type { Configuration } from "electron-builder"
import { BUDDY_BRANDING, formatCopyrightNotice } from "@buddy/script/branding"
import {
  WINDOWS_RELEASE_ARCHS,
  resolveMacOsReleaseArtifactPattern,
  resolveWindowsReleaseArtifactPattern,
} from "./src/shared/release-asset-names"

const CHANNEL_ENV_KEY = "BUDDY_CHANNEL"
const WINDOWS_RELEASE_TARGET_ARCH = WINDOWS_RELEASE_ARCHS[0]

type Channel = "dev" | "beta" | "prod"

function resolveChannel(): Channel {
  const raw = process.env[CHANNEL_ENV_KEY]
  if (raw === "dev" || raw === "beta" || raw === "prod") {
    return raw
  }
  return "dev"
}

const channel = resolveChannel()
const runtimeResourceNames = ["backend", "knowledge-graph", "migrations", "tessdata"] as const
const DEV_PRODUCT_NAME = `${BUDDY_BRANDING.productName} Dev`
const BETA_PRODUCT_NAME = `${BUDDY_BRANDING.productName} Beta`

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
  copyright: formatCopyrightNotice(),
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  extraMetadata: {
    description: BUDDY_BRANDING.desktopPackageDescription,
  },
  asarUnpack: [
    "out/main/chunks/node_modules/@llamaindex/liteparse-*/**/*",
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
    name: BUDDY_BRANDING.productName,
    schemes: ["buddy"],
  },
  mac: {
    artifactName: resolveMacOsReleaseArtifactPattern(),
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
    artifactName: resolveWindowsReleaseArtifactPattern(WINDOWS_RELEASE_TARGET_ARCH),
    icon: "resources/icons/icon.ico",
    target: ["nsis"],
    verifyUpdateCodeSignature: false,
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
      productName: DEV_PRODUCT_NAME,
    }
  }

  if (channel === "beta") {
    return {
      ...BASE_CONFIGURATION,
      appId: "ai.buddy.desktop.beta",
      productName: BETA_PRODUCT_NAME,
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
    productName: BUDDY_BRANDING.productName,
    publish: {
      provider: "github",
      owner: "prashantbhudwal",
      repo: "buddy-releases",
      channel: "latest",
    },
  }
}

export default resolveChannelConfiguration()
