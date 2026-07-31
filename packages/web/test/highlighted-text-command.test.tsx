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

describe("highlighted text leading command", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: ReturnType<typeof createTestQueryClient>

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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

  test("renders a leading slash command as an icon pill without the slash", async () => {
    await render("/docx what is this")
    // The rubiks-cube pill renders an <svg>, and the command name drops its "/".
    expect(container.querySelector("svg")).not.toBeNull()
    expect(container.textContent).toBe("docx what is this")
  })

  test("leaves paths and mid-text slashes as plain text", async () => {
    await render("/usr/local/bin holds it")
    expect(container.querySelector("svg")).toBeNull()
    expect(container.textContent).toBe("/usr/local/bin holds it")

    await render("run and/or skip")
    expect(container.querySelector("svg")).toBeNull()
    expect(container.textContent).toBe("run and/or skip")
  })
})
