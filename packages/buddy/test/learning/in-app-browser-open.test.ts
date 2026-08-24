import { setTimeout as sleep } from "node:timers/promises"
import { afterEach, describe, expect, test } from "bun:test"
import {
  SSE_EVENT_TYPE_CLIENT_ACTION,
  benchClientActionBroker,
  type BenchClientAction,
} from "../../src/learning/features/bench/client-actions"
import { clearBenchContextRegistry, benchTargetKey } from "../../src/learning/features/bench/context"
import { inAppBrowserOpenTool } from "../../src/learning/features/browser/tools/open"
import { createBuddyToolContext } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"

const SESSION_ID = "session-browser-open"

afterEach(() => {
  clearBenchContextRegistry()
  benchClientActionBroker.reset()
})

async function nextAction(actions: BenchClientAction[]): Promise<BenchClientAction> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const action = actions.shift()
    if (action) return action
    await sleep(0)
  }
  throw new Error("Expected a Browser Bench action.")
}

describe("inapp_browser_open", () => {
  test("opens a normalized URL in a new Browser Bench tab", async () => {
    await using project = await tmpdir({ git: true })
    const lease = benchClientActionBroker.connectLease({
      directory: project.path,
      instanceID: "browser-test-client",
      generation: 1,
    })
    const actions: BenchClientAction[] = []
    const unsubscribe = benchClientActionBroker.subscribe({
      directory: project.path,
      lease,
      listener(event) {
        if (event.payload.type === SSE_EVENT_TYPE_CLIENT_ACTION) {
          actions.push(event.payload.properties.action)
        }
      },
    })

    const run = inAppBrowserOpenTool.run(
      { url: "hibuddy.in" },
      createBuddyToolContext({
        directory: project.path,
        sessionID: SESSION_ID,
        messageID: "msg_browser_open",
        agent: "buddy",
      }),
    )
    const action = await nextAction(actions)
    if (action.command.type !== "present" || action.command.target.type !== "browser") {
      throw new Error("Expected a Browser presentation command.")
    }
    const target = action.command.target
    expect(target.url).toBe("https://hibuddy.in/")
    expect(target.tabID.startsWith("browser_")).toBe(true)

    const tabKey = `browser:${encodeURIComponent(target.tabID)}`
    expect(
      benchClientActionBroker.completeAction({
        directory: project.path,
        actionID: action.actionID,
        completion: {
          outcome: "committed",
          lease: {
            instanceID: lease.instanceID,
            generation: lease.generation,
            leaseEpoch: lease.leaseEpoch,
          },
          publicationSequence: 1,
          observedRoute: { status: "open", target, mode: "docked" },
          observedVisibility: "visible",
          drawer: null,
          context: {
            status: "open",
            visibility: "visible",
            mode: "docked",
            selectedTabKey: tabKey,
            tabs: [{ tabKey, title: "HiBuddy", target }],
            targetKey: benchTargetKey(target),
            target: {
              type: "browser",
              title: "HiBuddy",
              workspaceRoot: project.path,
              tabID: target.tabID,
              url: target.url,
              loading: false,
              route: `/_bench/browser/${encodeURIComponent(target.tabID)}?url=${encodeURIComponent(target.url)}`,
              status: "ready",
            },
            drawer: null,
            metadata: ["control: user-only"],
            content: "User-controlled Browser tab.",
            refs: [{ kind: "url", value: target.url, note: "Browser URL." }],
            hints: [],
          },
          changed: true,
        },
      }),
    ).toEqual({ status: "completed" })

    await expect(run).resolves.toMatchObject({
      output: expect.stringContaining("Opened https://hibuddy.in/"),
      metadata: { tabID: target.tabID, url: target.url },
    })
    unsubscribe()
  })

  test("rejects executable and local-file addresses before dispatch", async () => {
    await using project = await tmpdir({ git: true })
    await expect(
      inAppBrowserOpenTool.run(
        { url: "javascript:alert(1)" },
        createBuddyToolContext({
          directory: project.path,
          sessionID: SESSION_ID,
          messageID: "msg_browser_invalid",
          agent: "buddy",
        }),
      ),
    ).rejects.toThrow("valid HTTP or HTTPS")
    await expect(
      inAppBrowserOpenTool.run(
        { url: "file:///etc/passwd" },
        createBuddyToolContext({
          directory: project.path,
          sessionID: SESSION_ID,
          messageID: "msg_browser_file_scheme",
          agent: "buddy",
        }),
      ),
    ).rejects.toThrow("valid HTTP or HTTPS")
  })

  test("cancels when abort happens during synchronous action delivery", async () => {
    await using project = await tmpdir({ git: true })
    const abortController = new AbortController()
    const lease = benchClientActionBroker.connectLease({
      directory: project.path,
      instanceID: "browser-abort-client",
      generation: 1,
    })
    const actions: BenchClientAction[] = []
    const unsubscribe = benchClientActionBroker.subscribe({
      directory: project.path,
      lease,
      listener(event) {
        if (event.payload.type !== SSE_EVENT_TYPE_CLIENT_ACTION) return
        actions.push(event.payload.properties.action)
        abortController.abort()
      },
    })
    const context = {
      ...createBuddyToolContext({
        directory: project.path,
        sessionID: SESSION_ID,
        messageID: "msg_browser_abort",
        agent: "buddy",
      }),
      abort: abortController.signal,
    }

    await expect(inAppBrowserOpenTool.run({ url: "hibuddy.in" }, context)).rejects.toThrow()
    expect(actions).toHaveLength(1)
    unsubscribe()
  })
})
