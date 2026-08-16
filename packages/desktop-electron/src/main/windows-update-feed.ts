import { createServer, type Server } from "node:http"
import { parseTPortedAddress } from "../shared/parse-external"
import { isAbsoluteUrl, resolveReleaseAssetUrl } from "./update-common"

const WINDOWS_UPDATE_FEED_HOSTNAME = "127.0.0.1"
export const WINDOWS_UPDATE_MANIFEST_FILENAME = "latest.yml"
const WINDOWS_UPDATE_MANIFEST_PATHNAME = `/${WINDOWS_UPDATE_MANIFEST_FILENAME}`
const HTTP_OK = 200
const HTTP_NOT_FOUND = 404

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
}): Promise<WindowsUpdateFeed> {
  const manifestContent = absolutizeElectronUpdateManifestUrls(input.content, input.version)
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

export function absolutizeElectronUpdateManifestUrls(content: string, version: string): string {
  return content
    .split(/\r?\n/u)
    .map((line) => absolutizeElectronUpdateManifestUrlLine(line, version))
    .join("\n")
}

function absolutizeElectronUpdateManifestUrlLine(line: string, version: string): string {
  const match = line.match(/^(\s*(?:-\s*)?(?:url|path):\s*)(.+?)(\s*)$/u)
  if (!match) return line

  const [, prefix, rawValue, suffix] = match
  const quote =
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue[0]
      : undefined
  const value = quote ? rawValue.slice(1, -1) : rawValue
  if (isAbsoluteUrl(value)) return line

  const absoluteUrl = resolveReleaseAssetUrl(version, value)
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
