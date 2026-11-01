import path from "node:path"
import { stat } from "node:fs/promises"
import type { CustomMacSignOptions } from "app-builder-lib"
import type { Configuration } from "electron-builder"
import { BUDDY_BRANDING, formatCopyrightNotice } from "@buddy/script/branding"
import type { BuddyReleaseChannel } from "@buddy/script/channel"
import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { CHEMFIG_RUNTIME_DIRECTORY_NAME } from "@buddy/script/chemfig-runtime"
import {
  WINDOWS_RELEASE_ARCHS,
  resolveMacOsReleaseArtifactPattern,
  resolveWindowsReleaseArtifactPattern,
} from "./src/shared/release-asset-names"

const WINDOWS_RELEASE_TARGET_ARCH = WINDOWS_RELEASE_ARCHS[0]
const RUNTIME_RESOURCE_NAMES = [
  "backend",
  "knowledge-graph",
  "migrations",
  "tessdata",
  CHEMFIG_RUNTIME_DIRECTORY_NAME,
]
const LEGAL_RESOURCE_NAMES = ["LICENSE", "THIRD_PARTY_NOTICES.md"]
const DEV_PRODUCT_NAME = `${BUDDY_BRANDING.productName} Dev`
const MACOS_AD_HOC_SIGNING_IDENTITY = "-"
type BackendPackContext = {
  readonly appOutDir: string
  readonly electronPlatformName: string
  readonly packager: {
    getResourcesDir(appOutDir: string): string
  }
}

type ElectronBuilderConfiguration = Configuration & {
  afterPack: (context: BackendPackContext) => Promise<void>
}

async function assertPackagedBackend(context: BackendPackContext): Promise<void> {
  const backend = path.join(
    context.packager.getResourcesDir(context.appOutDir),
    context.electronPlatformName === "win32" ? "buddy-backend.exe" : "buddy-backend",
  )
  const file = await stat(backend)
  if (!file.isFile() || file.size === 0) {
    throw new Error(`Bundled Buddy backend must be a non-empty file: ${backend}`)
  }
}

function macSignOptions(
  options: CustomMacSignOptions,
  packageDirectory: string,
): CustomMacSignOptions {
  return {
    ...options,
    optionsForFile: (file) => {
      const defaults = options.optionsForFile?.(file)
      if (file !== path.join(options.app, "Contents/Resources/buddy-backend")) {
        return defaults ?? {}
      }
      return {
        ...defaults,
        entitlements: path.join(packageDirectory, "resources/entitlements.cli.plist"),
      }
    },
  }
}

export type ElectronBuilderConfigurationInput = {
  channel: BuddyReleaseChannel
  repositoryRoot: string
}

export function createElectronBuilderConfiguration(
  input: ElectronBuilderConfigurationInput,
): ElectronBuilderConfiguration {
  const packageDirectory = path.resolve(input.repositoryRoot, "packages/desktop-electron")
  const baseConfiguration: ElectronBuilderConfiguration = {
    copyright: formatCopyrightNotice(),
    directories: {
      output: "dist",
      buildResources: "resources",
    },
    extraMetadata: {
      description: BUDDY_BRANDING.desktopPackageDescription,
    },
    asarUnpack: [
      "out/main/node_modules/@napi-rs/keyring/**/*",
      "out/main/node_modules/@primno/dpapi/prebuilds/**/*",
    ],
    files: ["out/**/*"],
    afterPack: assertPackagedBackend,
    extraResources: [
      {
        from: "resources",
        to: "",
        filter: ["buddy-backend", "buddy-backend.exe"],
      },
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
      sign: async (options) => {
        const { sign } = await import("app-builder-lib/out/codeSign/macCodeSign")
        await sign(macSignOptions(options, packageDirectory))
      },
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

  const distribution = BUDDY_DISTRIBUTIONS[input.channel]
  const configuration: ElectronBuilderConfiguration = {
    ...baseConfiguration,
    appId: distribution.appId,
    productName: distribution.productName,
    protocols: { name: distribution.productName, schemes: [distribution.protocol] },
    publish: {
      provider: "github",
      owner: distribution.releaseOwner,
      repo: distribution.releaseRepository,
      channel: "latest",
    },
  }
  if (distribution.packageName) {
    return {
      ...configuration,
      extraMetadata: {
        ...baseConfiguration.extraMetadata,
        name: distribution.packageName,
      },
    }
  }
  return configuration
}

export const ELECTRON_BUILDER_RESOURCE_NAMES = {
  legal: LEGAL_RESOURCE_NAMES,
  runtime: RUNTIME_RESOURCE_NAMES,
} satisfies Readonly<{
  legal: readonly string[]
  runtime: readonly string[]
}>
