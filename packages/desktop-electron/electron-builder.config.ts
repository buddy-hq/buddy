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

const BASE_CONFIGURATION: Configuration = {
  artifactName: "buddy-electron-${os}-${arch}.${ext}",
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  files: ["out/**/*", "resources/**/*"],
  extraResources: [
    {
      from: "resources",
      to: "",
      filter: ["buddy-backend*"],
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
        repo: "buddy",
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
      repo: "buddy",
      channel: "latest",
    },
  }
}

export default resolveChannelConfiguration()
