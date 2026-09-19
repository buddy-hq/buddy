import type {
  InAppBrowserAppearanceRequest,
  InAppBrowserCommandResult,
} from "@buddy/browser-contract"
import { webContents, type WebContents } from "electron"
import { z } from "zod"

const DEBUGGER_PROTOCOL_VERSION = "1.3"
const appearanceByGuest = new WeakMap<WebContents, InAppBrowserAppearanceRequest["appearance"]>()
const lifecycleInstalled = new WeakSet<WebContents>()

const appearanceRequestSchema = z.object({
  webContentsID: z.number().int().positive(),
  appearance: z.enum(["system", "light", "dark"]),
})

async function applyAppearance(
  guest: WebContents,
  appearance: InAppBrowserAppearanceRequest["appearance"],
): Promise<void> {
  if (guest.isDevToolsOpened()) return
  if (appearance === "system" && !guest.debugger.isAttached()) return
  if (!guest.debugger.isAttached()) guest.debugger.attach(DEBUGGER_PROTOCOL_VERSION)
  await guest.debugger.sendCommand("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: appearance === "system" ? "" : appearance }],
  })
}

function installAppearanceLifecycle(guest: WebContents): void {
  if (lifecycleInstalled.has(guest)) return
  lifecycleInstalled.add(guest)
  const reapply = () => {
    const appearance = appearanceByGuest.get(guest)
    if (appearance === undefined || guest.isDestroyed() || guest.isDevToolsOpened()) return
    void applyAppearance(guest, appearance).catch(() => undefined)
  }
  const destroyed = () => {
    appearanceByGuest.delete(guest)
    lifecycleInstalled.delete(guest)
    guest.removeListener("devtools-closed", reapply)
  }
  guest.on("devtools-closed", reapply)
  guest.once("destroyed", destroyed)
}

export async function setInAppBrowserAppearance(
  host: WebContents,
  input: InAppBrowserAppearanceRequest,
): Promise<InAppBrowserCommandResult> {
  const request = appearanceRequestSchema.safeParse(input)
  if (!request.success) return { _tag: "failed", reason: "invalid-request" }
  const guest = webContents.fromId(request.data.webContentsID)
  if (!guest || guest.isDestroyed() || guest.hostWebContents?.id !== host.id) {
    return { _tag: "failed", reason: "tab-unavailable" }
  }

  const { appearance } = request.data
  appearanceByGuest.set(guest, appearance)
  installAppearanceLifecycle(guest)
  try {
    await applyAppearance(guest, appearance)
    return { _tag: "done" }
  } catch {
    return { _tag: "failed", reason: "operation-failed" }
  }
}
