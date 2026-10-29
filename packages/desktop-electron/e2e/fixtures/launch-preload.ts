import "./network-guard"
import path from "node:path"
import { app } from "electron"
import z from "zod"

const env = z
  .object({
    BUDDY_E2E_ROOT: z.string().min(1),
    BUDDY_E2E_NETWORK_LOG: z.string().min(1),
    BUDDY_E2E_NETWORK_GUARD: z.string().min(1),
    BUDDY_DEV_USER_DATA_DIR: z.string().min(1),
  })
  .parse(process.env)

for (const name of [
  "disable-backgrounding-occluded-windows",
  "disable-renderer-backgrounding",
  "disable-background-timer-throttling",
])
  app.commandLine.appendSwitch(name)
app.setPath("appData", path.join(env.BUDDY_E2E_ROOT, "appdata"))
app.setPath("userData", env.BUDDY_DEV_USER_DATA_DIR)
app.setPath("sessionData", path.join(env.BUDDY_E2E_ROOT, "session-data"))
app.setPath("temp", path.join(env.BUDDY_E2E_ROOT, "tmp"))
app.setAppLogsPath(path.join(env.BUDDY_E2E_ROOT, "logs"))
process.env.NODE_OPTIONS = `--require=${JSON.stringify(env.BUDDY_E2E_NETWORK_GUARD)}`

app.on("session-created", (session) => {
  if (process.env.BUDDY_E2E_LOGIN_BOUNDARY === "1") {
    type HeaderListener = (
      details: Electron.OnBeforeSendHeadersListenerDetails,
      callback: (response: Electron.BeforeSendResponse) => void,
    ) => void
    const register = session.webRequest.onBeforeSendHeaders.bind(session.webRequest)
    const observe = (listener: HeaderListener | null): HeaderListener | null =>
      listener &&
      ((details, callback) => {
        listener(details, (response) => {
          const pathname = new URL(details.url).pathname
          if (
            pathname.startsWith("/api/frame/widget/") ||
            pathname.startsWith("/api/file/raw/") ||
            pathname === "/api/objects"
          ) {
            const webContents = details.webContents
            const frame = details.frame
            const headers = response.requestHeaders ?? details.requestHeaders
            process.getBuiltinModule("node:fs").appendFileSync(
              path.join(env.BUDDY_E2E_ROOT, "login-boundary.jsonl"),
              `${JSON.stringify({
                url: details.url,
                webContentsType: webContents?.getType() ?? null,
                hasFrame: !!frame,
                isMainFrame: !!webContents && !!frame && frame === webContents.mainFrame,
                resourceType: details.resourceType,
                hasAuthorization: Object.keys(headers).some(
                  (name) => name.toLowerCase() === "authorization",
                ),
              })}\n`,
            )
          }
          callback(response)
        })
      })
    session.webRequest.onBeforeSendHeaders = (
      filterOrListener: Electron.WebRequestFilter | HeaderListener | null,
      listener?: HeaderListener | null,
    ) => {
      if (filterOrListener === null) register(null)
      else if ("urls" in filterOrListener) register(filterOrListener, observe(listener ?? null))
      else register(observe(filterOrListener))
    }
  }
  session.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url)
    const external =
      ["http:", "https:", "ws:", "wss:"].includes(url.protocol) &&
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    if (external)
      process
        .getBuiltinModule("node:fs")
        .appendFileSync(env.BUDDY_E2E_NETWORK_LOG, `Blocked Chromium request: ${details.url}\n`)
    callback({ cancel: external })
  })
})
