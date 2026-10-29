import { describe, expect, test } from "bun:test"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderToStaticMarkup } from "react-dom/server"
import {
  V1UpgradeFailureNotice,
  v1ImportNoticeLines,
} from "@/components/layout/chat-left-sidebar/v1-import-notice"
import { UpgradePendingScreen } from "@/components/layout/upgrade-pending-screen"
import {
  v1ImportPollInterval,
  v1ImportQueryOptions,
  type V1ImportReport,
} from "@/state/v1-import-query"

function report(input: Partial<V1ImportReport> = {}): V1ImportReport {
  return {
    upgrade: { state: "idle" },
    import: { status: "completed" },
    importRan: false,
    skipped: [],
    content: [],
    ...input,
  }
}

describe("v1 chat import notice", () => {
  test("onboarding shows the upgrade failure cause and renders nothing when ready", () => {
    const container = document.createElement("div")
    container.innerHTML = renderToStaticMarkup(
      <V1UpgradeFailureNotice
        report={report({ upgrade: { state: "failed", error: "Not enough free space" } })}
      />,
    )
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Not enough free space",
    )

    container.innerHTML = renderToStaticMarkup(
      <V1UpgradeFailureNotice report={report({ upgrade: { state: "ready" } })} />,
    )
    expect(container.innerHTML).toBe("")
  })

  test("pending routes show upgrade progress or failure and render nothing while idle", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { enabled: false, gcTime: Infinity } },
    })
    const container = document.createElement("div")

    function renderReport(value: V1ImportReport) {
      queryClient.setQueryData(v1ImportQueryOptions().queryKey, value)
      container.innerHTML = renderToStaticMarkup(
        <QueryClientProvider client={queryClient}>
          <UpgradePendingScreen />
        </QueryClientProvider>,
      )
    }

    try {
      for (const state of ["copying", "migrating"] as const) {
        renderReport(report({ upgrade: { state }, import: null }))
        expect(container.querySelector('[role="alert"]')?.textContent).toBe(
          "Bringing over your chats from the previous version…",
        )
      }

      renderReport(
        report({ upgrade: { state: "failed", error: "Not enough disk space" }, import: null }),
      )
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(
        "Couldn't bring over your chats from the previous version: Not enough disk space",
      )

      renderReport(report({ import: { status: "required" } }))
      expect(container.innerHTML).toBe("")
    } finally {
      queryClient.clear()
    }
  })

  test("says chats are being brought over while copying, migrating or importing", () => {
    for (const state of [
      report({ upgrade: { state: "copying" }, import: null }),
      report({ upgrade: { state: "migrating" }, import: null }),
      report({
        upgrade: { state: "ready" },
        import: {
          status: "running",
          progress: { label: "Migrating sessions", numerator: 1, denominator: 3 },
        },
      }),
      report({ import: { status: "required" } }),
    ]) {
      expect(v1ImportNoticeLines(state, false)).toEqual([
        {
          key: "progress",
          tone: "default",
          text: "Bringing over your chats from the previous version…",
        },
      ])
      expect(v1ImportPollInterval(state)).toBe(1_500)
    }
  })

  test("a failed upgrade shows its cause", () => {
    const failed = report({
      upgrade: {
        state: "failed",
        error: "Not enough disk space to upgrade your chats: need 1.4 GB, have 300.0 MB",
      },
      import: null,
    })
    expect(v1ImportNoticeLines(failed, false)).toEqual([
      {
        key: "failed",
        tone: "destructive",
        text: "Couldn't bring over your chats from the previous version: Not enough disk space to upgrade your chats: need 1.4 GB, have 300.0 MB",
      },
    ])
    expect(v1ImportPollInterval(failed)).toBe(5_000)
  })

  test("an import error says Buddy will continue next time", () => {
    expect(
      v1ImportNoticeLines(
        report({ import: { status: "error", error: "UNIQUE constraint failed" } }),
        false,
      ),
    ).toEqual([
      {
        key: "error",
        tone: "default",
        text: "Some older chats haven't come across yet. Buddy will continue the next time it starts.",
      },
    ])
  })

  test("after an import this launch, skipped chats and dropped command results are reported", () => {
    const finished = report({
      upgrade: { state: "ready" },
      skipped: [
        { id: "ses_a", at: 1, error: "boom" },
        { id: "ses_b", at: 2, error: "boom" },
      ],
      content: [
        { sessionID: "ses_c", subtaskPrompts: 1, subtaskResults: 1, assistantFiles: 0 },
        { sessionID: "ses_d", subtaskPrompts: 0, subtaskResults: 0, assistantFiles: 2 },
        { sessionID: "ses_e", subtaskPrompts: 0, subtaskResults: 0, assistantFiles: 0 },
      ],
    })
    expect(v1ImportNoticeLines(finished, false).map((line) => line.text)).toEqual([
      "2 older chats couldn't be brought over. The originals are kept in the previous version.",
      "Some command results in 2 older chats couldn't be brought over.",
    ])
    expect(v1ImportNoticeLines({ ...finished, upgrade: { state: "idle" } }, true)).toHaveLength(2)
    expect(
      v1ImportNoticeLines({ ...finished, upgrade: { state: "idle" }, importRan: true }, false).map(
        (line) => line.key,
      ),
    ).toEqual(["skipped", "content"])
    expect(v1ImportPollInterval(finished)).toBe(false)
    expect(
      v1ImportPollInterval({ ...finished, import: { status: "error", error: "disk I/O error" } }),
    ).toBe(5_000)
  })

  test("a launch that did not import shows nothing", () => {
    const settled = report({
      content: [{ sessionID: "ses_c", subtaskPrompts: 1, subtaskResults: 0, assistantFiles: 0 }],
    })
    expect(v1ImportNoticeLines(settled, false)).toEqual([])
    expect(v1ImportNoticeLines(undefined, false)).toEqual([])
    expect(v1ImportPollInterval(undefined)).toBe(5_000)
    expect(v1ImportPollInterval(report({ import: null }))).toBe(5_000)
  })
})
