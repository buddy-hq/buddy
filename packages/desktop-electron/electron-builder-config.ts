import path from "node:path"
import type { Configuration } from "electron-builder"
import { BUDDY_BRANDING, formatCopyrightNotice } from "@buddy/script/branding"
import type { BuddyReleaseChannel } from "@buddy/script/channel"
import { ELECTRON_CHEMFIG_RUNTIME_PATH_SEGMENTS } from "@buddy/script/chemfig-runtime"
import {
  WINDOWS_RELEASE_ARCHS,
  resolveMacOsReleaseArtifactPattern,
  resolveWindowsReleaseArtifactPattern,
} from "./src/shared/release-asset-names"

const WINDOWS_RELEASE_TARGET_ARCH = WINDOWS_RELEASE_ARCHS[0]
const RUNTIME_RESOURCE_NAMES = ["backend", "knowledge-graph", "migrations", "tessdata"]
const LEGAL_RESOURCE_NAMES = ["LICENSE", "THIRD_PARTY_NOTICES.md"]
const DEV_PRODUCT_NAME = `${BUDDY_BRANDING.productName} Dev`
const BETA_PRODUCT_NAME = `${BUDDY_BRANDING.productName} Beta`
const MACOS_AD_HOC_SIGNING_IDENTITY = "-"
const CHEMFIG_RUNTIME_ASAR_PATTERN = path.posix.join(
  "out/main",
  ...ELECTRON_CHEMFIG_RUNTIME_PATH_SEGMENTS,
  "**/*",
)

export type ElectronBuilderConfigurationInput = {
  channel: BuddyReleaseChannel
  repositoryRoot: string
}

export function createElectronBuilderConfiguration(
  input: ElectronBuilderConfigurationInput,
): Configuration {
  const baseConfiguration: Configuration = {
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
      ...RUNTIME_RESOURCE_NAMES.map((name) => ({
        from: `resources/${name}`,
        to: name,
        filter: ["**/*"],
      })),
      ...LEGAL_RESOURCE_NAMES.map((name) => ({
        from: path.resolve(input.repositoryRoot, name),
        to: name,
      })),
      {
        from: "resources",
        to: "",
        filter: ["mac-install-update.sh"],
      },
    ],
    protocols: {
      name: BUDDY_BRANDING.productName,
      schemes: [BUDDY_BRANDING.appProtocol],
    },
    mac: {
      artifactName: resolveMacOsReleaseArtifactPattern(),
      category: "public.app-category.developer-tools",
      forceCodeSigning: true,
      icon: "resources/icons/icon.icns",
      hardenedRuntime: true,
      identity: MACOS_AD_HOC_SIGNING_IDENTITY,
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

  if (input.channel === "dev") {
    return {
      ...baseConfiguration,
      appId: "ai.buddy.desktop.dev",
      productName: DEV_PRODUCT_NAME,
    }
  }

  if (input.channel === "beta") {
    return {
      ...baseConfiguration,
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
    ...baseConfiguration,
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

export const ELECTRON_BUILDER_RESOURCE_NAMES = {
  legal: LEGAL_RESOURCE_NAMES,
  runtime: RUNTIME_RESOURCE_NAMES,
} satisfies Readonly<{
  legal: readonly string[]
  runtime: readonly string[]
}>
