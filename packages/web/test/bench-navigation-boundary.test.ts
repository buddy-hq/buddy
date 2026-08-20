import { describe, expect, test } from "bun:test"

const DIRECTORY_CHAT_CONTROLLER_SOURCE = new URL(
  "../src/lib/directory-chat/use-directory-chat-page-controller.ts",
  import.meta.url,
)
const PRESENTATION_ONLY_SOURCES = [
  "../src/lib/directory-workspace-controller.ts",
  "../src/lib/directory-workspace-client-actions.ts",
  "../src/lib/use-workspace-file-open.ts",
  "../src/components/whiteboard/whiteboard-opening-preview.tsx",
  "../src/components/directory-chat/right-workspace-open.ts",
] as const
const CHAT_TRANSITION_CALL =
  /\b(?:activateChatDirectory|selectActiveChatSession|startActiveChatDraft|startActiveChatSession|forkActiveChatSession)\s*\(/

describe("Bench navigation boundary", () => {
  test("resource presentation cannot restore or select a chat", async () => {
    const source = await Bun.file(DIRECTORY_CHAT_CONTROLLER_SOURCE).text()

    expect(source).not.toContain("linkedSessionByResource")
    expect(source).not.toContain("selectActiveChatSessionAndPresent")
    expect(source).not.toContain("sessionPreference")
    expect(source).toContain("buildWorkspaceRouteNavigation")
  })

  test("presentation-only modules cannot invoke chat transitions", async () => {
    for (const relativePath of PRESENTATION_ONLY_SOURCES) {
      const source = await Bun.file(new URL(relativePath, import.meta.url)).text()
      expect(source).not.toMatch(CHAT_TRANSITION_CALL)
    }
  })
})
