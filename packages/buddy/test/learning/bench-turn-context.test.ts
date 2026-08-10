import { afterEach, describe, expect, test } from "bun:test"
import path from "node:path"
import { readProjectConfig } from "@buddy/backend/config/runtime"
import {
  clearBenchContextRegistry,
  publishSequencedBenchContext,
} from "../../src/learning/features/bench/context"
import { runMessagePromptPipeline } from "../../src/learning/prompt/message-prompt-pipeline"
import { tmpdir } from "../helpers/tmpdir"

const SESSION_ID = "session-bench-turn-context"

afterEach(() => {
  clearBenchContextRegistry()
})

function syntheticPromptText(result: Awaited<ReturnType<typeof runMessagePromptPipeline>>): string {
  const parts = result.transformed.parts
  if (!Array.isArray(parts)) throw new Error("Expected transformed prompt parts.")
  return parts
    .flatMap((part) => {
      if (
        typeof part !== "object" ||
        part === null ||
        !("synthetic" in part) ||
        part.synthetic !== true ||
        !("text" in part) ||
        typeof part.text !== "string"
      ) {
        return []
      }
      return [part.text]
    })
    .join("\n")
}

describe("parked Bench turn context", () => {
  test("lists only recent tabs and uses a fingerprint reference when unchanged", async () => {
    await using project = await tmpdir({ git: true })
    const config = await readProjectConfig(project.path)
    const tabs = Array.from({ length: 12 }, (_, index) => ({
      tabKey: `file:markdown:notes/tab-${index}.md`,
      title: `Tab ${index}`,
      target: {
        type: "workspace-file" as const,
        path: `notes/tab-${index}.md`,
        viewer: "markdown" as const,
      },
    }))
    const selectedTab = tabs[0]
    if (!selectedTab) throw new Error("Expected a selected tab fixture.")
    publishSequencedBenchContext({
      directory: project.path,
      sessionID: SESSION_ID,
      body: {
        lease: { instanceID: "turn-context-client", generation: 1, leaseEpoch: 1 },
        publicationSequence: 1,
        idempotencyKey: "parked-turn-context",
        value: {
          status: "open",
          visibility: "parked",
          mode: "docked",
          selectedTabKey: selectedTab.tabKey,
          tabs,
          drawer: null,
        },
      },
    })

    const first = await runMessagePromptPipeline({
      context: { directory: project.path, sessionID: SESSION_ID },
      body: { content: "What is on Bench?", persona: "buddy" },
      projectConfig: config,
    })
    const firstText = syntheticPromptText(first)
    expect(firstText).toContain("12 Bench tabs are open.")
    expect(firstText).toContain(
      `selected tab 1 of 12: ${selectedTab.title}: ${selectedTab.tabKey}`,
    )
    expect(firstText).toContain(
      `Selected target absolute path: ${path.join(project.path, selectedTab.target.path)}.`,
    )
    expect(firstText).toContain("- Tab 12: Tab 11")
    expect(firstText).toContain("- Tab 8: Tab 7")
    expect(firstText).not.toContain("- Tab 7: Tab 6")
    expect(firstText).not.toContain("- Tab 2: Tab 1")
    expect(firstText).toContain("6 additional tabs are omitted.")

    const deliveredFingerprint = first.turnContextDelivery?.deliveredBenchFingerprint
    const previousState = first.nextTeachingState
    if (!deliveredFingerprint || !previousState) {
      throw new Error("Expected Bench turn-context delivery state.")
    }
    const second = await runMessagePromptPipeline({
      context: { directory: project.path, sessionID: SESSION_ID },
      body: { content: "And now?", persona: "buddy" },
      projectConfig: config,
      previousState: {
        ...previousState,
        lastDeliveredBenchTurnContextDigest: deliveredFingerprint,
      },
    })
    const secondText = syntheticPromptText(second)
    expect(secondText).toContain(`<bench_ctx_ref same="${deliveredFingerprint.slice(0, 12)}"/>`)
    expect(secondText).not.toContain("Recently opened tabs:")
  })
})
