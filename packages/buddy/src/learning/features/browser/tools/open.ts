import { normalizeInAppBrowserUrl } from "@buddy/browser-contract"
import { ulid } from "ulid"
import z from "zod"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import { benchClientActionBroker, type BenchBrokerTerminal } from "../../bench/client-actions"
import type { BrowserBenchTarget } from "../../bench/context"

const IN_APP_BROWSER_TAB_ID_PREFIX = "browser"

const InAppBrowserOpenInputSchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1)
      .describe(
        "HTTP or HTTPS address to open for the user. A bare public hostname uses HTTPS; localhost and loopback addresses use HTTP. file:, data:, javascript:, and links to other apps are not allowed.",
      ),
  })
  .strict()

function terminalError(terminal: BenchBrokerTerminal): string | undefined {
  if (terminal.status === "cancelled") return "Opening the Browser tab was cancelled."
  if (terminal.status === "expired") {
    return terminal.delivered
      ? "Buddy did not finish opening the Browser tab in time."
      : "The Buddy desktop window is unavailable, so the Browser tab could not open."
  }
  const completion = terminal.completion
  if (completion.outcome === "committed") return undefined
  if (completion.outcome === "blocked") return "Unsaved Bench work blocked the Browser tab."
  if (completion.outcome === "inactive_session") {
    return "This chat is no longer active, so the Browser tab was not opened."
  }
  if (completion.outcome === "superseded") {
    return "A newer Bench action replaced this Browser request."
  }
  return "Buddy could not open the Browser tab."
}

export const inAppBrowserOpenTool = createBuddyTool({
  id: "inapp_browser_open",
  description: [
    "Open an HTTP or HTTPS address in a new visible Browser tab on Bench for the user.",
    "",
    "Use this when the user asks to open a link in Buddy or when showing a relevant webpage would help them. Every call creates and selects a new tab; it never replaces the page the user is using.",
    "",
    "The Browser is user-controlled. This tool cannot read the page, inspect its contents, click, type, scroll, submit forms, take screenshots, or run JavaScript. Do not use it when the task requires any of those actions, and do not claim that opening a URL proves what the page contains.",
  ].join("\n"),
  parameters: InAppBrowserOpenInputSchema,
  presentation: {
    archetype: "activity",
    icon: "web",
    renderer: "generic",
    layoutRole: "activity",
    phases: {
      pending: { action: "Preparing Browser tab" },
      running: { action: "Opening Browser tab" },
      completed: { action: "Opened Browser tab" },
      error: { action: "Failed to open Browser tab" },
    },
    summary: {
      category: "open-browser-tabs",
      pending: "Opening Browser tabs",
      running: "Opening Browser tabs",
      completed: "Opened Browser tabs",
      error: "Failed to open Browser tabs",
    },
  },
  async execute(params, ctx) {
    const url = normalizeInAppBrowserUrl(params.url)
    if (!url) {
      throw new Error("Use a valid HTTP or HTTPS address, including localhost if needed.")
    }

    ctx.abort.throwIfAborted()
    const target = {
      type: "browser",
      tabID: `${IN_APP_BROWSER_TAB_ID_PREFIX}_${ulid()}`,
      url,
    } satisfies BrowserBenchTarget
    const enqueued = benchClientActionBroker.enqueueRequiredAction({
      directory: ctx.directory,
      sessionID: String(ctx.sessionID),
      messageID: String(ctx.messageID),
      callID: ctx.callID ? String(ctx.callID) : null,
      command: { type: "present", target, autoOpen: null },
    })
    const cancelAction = () => {
      benchClientActionBroker.cancelAction({
        directory: ctx.directory,
        actionID: enqueued.action.actionID,
      })
    }
    ctx.abort.addEventListener("abort", cancelAction, { once: true })
    if (ctx.abort.aborted) cancelAction()
    try {
      const terminal = await enqueued.completion
      ctx.abort.throwIfAborted()
      const error = terminalError(terminal)
      if (error) throw new Error(error)

      return {
        title: "Browser",
        output: `Opened ${url} in a new Browser tab for the user. The user controls the page; you cannot inspect or operate it.`,
        metadata: {
          tabID: target.tabID,
          url,
        },
      }
    } finally {
      ctx.abort.removeEventListener("abort", cancelAction)
    }
  },
})

export { InAppBrowserOpenInputSchema }
