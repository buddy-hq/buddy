import { existsSync } from "node:fs"
import path from "node:path"
import type { Configuration } from "electron-builder"
import { BUDDY_BRANDING, formatCopyrightNotice } from "@buddy/script/branding"
import { readBuddyReleaseChannel } from "@buddy/script/channel"
import { ELECTRON_CHEMFIG_RUNTIME_PATH_SEGMENTS } from "@buddy/script/chemfig-runtime"
import {
  WINDOWS_RELEASE_ARCHS,
  resolveMacOsReleaseArtifactPattern,
  resolveWindowsReleaseArtifactPattern,
} from "./src/shared/release-asset-names"

const WINDOWS_RELEASE_TARGET_ARCH = WINDOWS_RELEASE_ARCHS[0]

const channel = readBuddyReleaseChannel()
const runtimeResourceNames = ["backend", "knowledge-graph", "migrations", "tessdata"] as const
const DEV_PRODUCT_NAME = `${BUDDY_BRANDING.productName} Dev`
const BETA_PRODUCT_NAME = `${BUDDY_BRANDING.productName} Beta`
const CHEMFIG_RUNTIME_ASAR_PATTERN = path.posix.join(
  "out/main",
  ...ELECTRON_CHEMFIG_RUNTIME_PATH_SEGMENTS,
  "**/*",
)

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
    CHEMFIG_RUNTIME_ASAR_PATTERN,
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
