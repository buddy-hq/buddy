import "../happydom"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { HighlightedText } from "../src/components/chat/highlighted-text"
import {
  createTestQueryClient,
  seedSkillPresentations,
  TestQueryClientProvider,
} from "./query-test-utils"

const DOCX_SKILL = {
  name: "docx",
  displayName: "Documents",
  shortDescription: "Create and edit documents",
}

describe("highlighted text leading skill", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: ReturnType<typeof createTestQueryClient>

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    queryClient = createTestQueryClient()
    seedSkillPresentations(queryClient)
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    queryClient.clear()
    container.remove()
  })

  function render(text: string) {
    return act(async () => {
      root.render(
        <TestQueryClientProvider queryClient={queryClient}>
          <HighlightedText text={text} references={[]} agents={[]} />
        </TestQueryClientProvider>,
      )
    })
  }

  test("renders a catalogued leading skill as an icon pill", async () => {
    seedSkillPresentations(queryClient, undefined, [DOCX_SKILL])
    await render("/docx what is this")

    expect(container.querySelector("svg")).not.toBeNull()
    expect(container.textContent).toBe("Documents what is this")
  })

  test("renders a catalogued leading skill before punctuation", async () => {
    seedSkillPresentations(queryClient, undefined, [DOCX_SKILL])
    await render("/docx, then summarize it")

    expect(container.querySelector("svg")).not.toBeNull()
    expect(container.textContent).toBe("Documents, then summarize it")
  })

  test("leaves an unknown leading slash token as ordinary text", async () => {
    seedSkillPresentations(queryClient, undefined, [DOCX_SKILL])
    await render("/anything what is this")

    expect(container.querySelector("svg")).toBeNull()
    expect(container.textContent).toBe("/anything what is this")
  })

  test("leaves paths and mid-text slashes as plain text", async () => {
    seedSkillPresentations(queryClient, undefined, [
      {
        name: "usr",
        displayName: "User directory",
        shortDescription: "A skill whose name is also a path segment",
      },
    ])
    await render("/usr/local/bin holds it")
    expect(container.querySelector("svg")).toBeNull()
    expect(container.textContent).toBe("/usr/local/bin holds it")

    await render("run and/or skip")
    expect(container.querySelector("svg")).toBeNull()
    expect(container.textContent).toBe("run and/or skip")
  })
})
