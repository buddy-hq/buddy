import { Buffer } from "node:buffer"
import { session } from "electron"

type SidecarAuthConfig = {
  origin: string
  headerValue: string
}

let registered = false
let currentConfig: SidecarAuthConfig | null = null

function matchesOrigin(url: string, origin: string) {
  try {
    return new URL(url).origin === origin
  } catch {
    return false
  }
}

export function registerSidecarRequestAuth() {
  if (registered) return
  registered = true

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const config = currentConfig
    if (
      !config ||
      !matchesOrigin(details.url, config.origin) ||
      "Authorization" in details.requestHeaders ||
      "authorization" in details.requestHeaders
    ) {
      callback({ requestHeaders: details.requestHeaders })
      return
    }

    callback({
      requestHeaders: {
        ...details.requestHeaders,
        Authorization: config.headerValue,
      },
    })
  })
}

export function configureSidecarRequestAuth(input: {
  url: string
  username: string | null
  password: string | null
}) {
  if (!input.username || !input.password) {
    currentConfig = null
    return
  }

  currentConfig = {
    origin: new URL(input.url).origin,
    headerValue: `Basic ${Buffer.from(`${input.username}:${input.password}`).toString("base64")}`,
  }
}
