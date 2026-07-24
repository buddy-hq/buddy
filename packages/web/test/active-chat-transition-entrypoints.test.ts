import { describe, expect, test } from "bun:test"

const ACTIVE_CHAT_ENTRYPOINTS = [
  "../src/app.tsx",
  "../src/routes/chat.tsx",
  "../src/routes/settings.tsx",
  "../src/routes/onboarding.tsx",
  "../src/lib/directory-chat/use-directory-chat-page-controller.ts",
] as const

const DIRECT_ACTIVE_CHAT_MUTATION =
  /\b(?:selectSession|startNewSessionDraft|startNewSession|forkSession)\s*\(/

describe("active chat transition entry points", () => {
  test("do not bypass the application transition coordinator", async () => {
    for (const relativePath of ACTIVE_CHAT_ENTRYPOINTS) {
      const source = await Bun.file(new URL(relativePath, import.meta.url)).text()
      expect(source).not.toMatch(DIRECT_ACTIVE_CHAT_MUTATION)
    }
  })
})
