import type { BuddyDistribution } from "@buddy/script/distribution"
import { createServer, type Server } from "node:http"
import { parseUpdateInfo, resolveFiles } from "electron-updater/out/providers/Provider.js"
import { parseTPortedAddress } from "../shared/parse-external"
import {
  UPDATE_DISTRIBUTION,
  fetchSignedElectronUpdateManifest,
  resolveLatestRingAssetUrl,
  resolveReleaseAssetUrl,
  resolveReleaseTagDownloadBaseUrl,
  resolveVersionedReleaseAssetUrls,
  resolveUpdatePublicKeyOverride,
  resolveUpdateVerificationPublicKey,
  SignedUpdateFetchError,
} from "./update-common"
import type { UpdateRing } from "@buddy/update-contract"
import { UPDATE_RING_STABLE } from "@buddy/update-contract"
import { resolveWindowsUpdateManifestFilename } from "../shared/release-asset-names"

const WINDOWS_UPDATE_FEED_HOSTNAME = "127.0.0.1"
export const WINDOWS_UPDATE_MANIFEST_FILENAME = "latest.yml"
const WINDOWS_UPDATE_MANIFEST_PATHNAME = `/${WINDOWS_UPDATE_MANIFEST_FILENAME}`
const HTTP_OK = 200
const HTTP_NOT_FOUND = 404

/** Restore electron-updater's provider without ever switching distributions. */
export function createDefaultWindowsUpdateProviderOptions(
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
) {
  return {
    channel: "latest",
    owner: distribution.releaseOwner,
    provider: "github" as const,
    repo: distribution.releaseRepository,
  }
}

/** Discover and verify Windows metadata before handing it to electron-updater. */
export async function fetchWindowsUpdateManifest(input: {
  distribution?: BuddyDistribution
  expectedVersion?: string
  publicKey?: string
  ring?: UpdateRing
  logger: { warn: (...args: unknown[]) => void }
}): Promise<{ content: string; version: string }> {
  const distribution = input.distribution ?? UPDATE_DISTRIBUTION
  const publicKey = resolveUpdateVerificationPublicKey(
    distribution,
    input.publicKey ?? resolveUpdatePublicKeyOverride(distribution),
  )
  const primaryFilename = resolveWindowsUpdateManifestFilename("x64")
  const manifestUrls = input.expectedVersion
    ? resolveVersionedReleaseAssetUrls({
        distribution,
        legacyFilename: WINDOWS_UPDATE_MANIFEST_FILENAME,
        primaryFilename,
        version: input.expectedVersion,
      })
    : [
        await resolveLatestRingAssetUrl({
          distribution,
          filename: primaryFilename,
          ring: input.ring ?? UPDATE_RING_STABLE,
        }),
      ]

  let lastError: unknown
  for (const [index, manifestUrl] of manifestUrls.entries()) {
    try {
      return await fetchSignedElectronUpdateManifest({
        distribution,
        publicKey,
        url: manifestUrl,
      })
    } catch (error) {
      lastError = error
      const fallbackUrl = manifestUrls[index + 1]
      if (!fallbackUrl || !(error instanceof SignedUpdateFetchError) || error.status !== 404) {
        throw error
      }
      input.logger.warn("signed recovery update manifest missing; trying legacy manifest", {
        fallbackUrl,
        manifestUrl,
      })
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to fetch Windows update manifest")
}

export type WindowsUpdateFeed = {
  close: () => Promise<void>
  url: string
}

export type WindowsUpdateFeedProviderOptions = {
  channel: "latest"
  provider: "generic"
  url: string
}

export function createWindowsUpdateFeedProviderOptions(
  feed: Pick<WindowsUpdateFeed, "url">,
): WindowsUpdateFeedProviderOptions {
  assertWindowsUpdateFeedProtocol(feed.url)
  return {
    channel: "latest",
    provider: "generic",
    url: feed.url,
  }
}

export async function startWindowsUpdateFeed(input: {
  content: string
  version: string
  distribution?: BuddyDistribution
}): Promise<WindowsUpdateFeed> {
  const manifestContent = absolutizeElectronUpdateManifestUrls(
    input.content,
    input.version,
    input.distribution,
  )
  const server = createServer((request, response) => {
    const requestUrl = parseRequestUrl(request.url)
    if (!requestUrl || requestUrl.pathname !== WINDOWS_UPDATE_MANIFEST_PATHNAME) {
      response.writeHead(HTTP_NOT_FOUND, {
        "Content-Type": "text/plain; charset=utf-8",
      })
      response.end("Not found")
      return
    }

    response.writeHead(HTTP_OK, {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Type": "text/yaml; charset=utf-8",
    })
    response.end(manifestContent)
  })

  await listen(server)

  const address = parseTPortedAddress(server.address())
  if (!address) {
    await closeServer(server)
    throw new Error("Windows update feed did not expose a TCP address")
  }

  return {
    close: () => closeServer(server),
    url: `http://${WINDOWS_UPDATE_FEED_HOSTNAME}:${address.port}/`,
  }
}

/** Absolutize manifest assets and require every Beta download to stay within its release. */
export function absolutizeElectronUpdateManifestUrls(
  content: string,
  version: string,
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
): string {
  const manifestContent = content
    .split(/\r?\n/u)
    .map((line) => absolutizeElectronUpdateManifestUrlLine(line, version, distribution))
    .join("\n")
  if (distribution.id === "beta") {
    const releaseBaseUrl = resolveReleaseTagDownloadBaseUrl(`v${version}`, distribution)
    // The generic provider resolves against loopback; unrewritten relative URLs must fail closed.
    const feedBaseUrl = new URL(`http://${WINDOWS_UPDATE_FEED_HOSTNAME}/`)
    const updateInfo = parseUpdateInfo(
      manifestContent,
      WINDOWS_UPDATE_MANIFEST_FILENAME,
      new URL(WINDOWS_UPDATE_MANIFEST_PATHNAME, feedBaseUrl),
    )
    for (const file of resolveFiles(updateInfo, feedBaseUrl)) {
      if (
        !file.url.href.startsWith(releaseBaseUrl) ||
        (file.packageInfo && !file.packageInfo.path.startsWith(releaseBaseUrl))
      ) {
        throw new Error("Beta update assets must belong to the Beta release repository and tag")
      }
    }
  }
  return manifestContent
}

function absolutizeElectronUpdateManifestUrlLine(
  line: string,
  version: string,
  distribution: BuddyDistribution,
): string {
  const match = line.match(/^(\s*(?:-\s*)?(?:url|path):\s*)(.+?)(\s*)$/u)
  if (!match) return line

  const [, prefix, rawValue, suffix] = match
  const quote =
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue[0]
      : undefined
  const value = quote ? rawValue.slice(1, -1) : rawValue
  const absoluteUrl = resolveReleaseAssetUrl(version, value, distribution)
  if (absoluteUrl === value) return line
  return `${prefix}${quote ?? ""}${absoluteUrl}${quote ?? ""}${suffix}`
}

function parseRequestUrl(url: string | undefined): URL | undefined {
  if (!url) return undefined

  try {
    return new URL(url, `http://${WINDOWS_UPDATE_FEED_HOSTNAME}`)
  } catch {
    return undefined
  }
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening)
      reject(error)
    }
    const onListening = () => {
      server.off("error", onError)
      resolve()
    }

    server.once("error", onError)
    server.once("listening", onListening)
    server.listen(0, WINDOWS_UPDATE_FEED_HOSTNAME)
  })
}

function assertWindowsUpdateFeedProtocol(url: string): void {
  const parsedUrl = new URL(url)
  if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") return

  throw new Error("Windows update feed must use http: or https:")
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}
