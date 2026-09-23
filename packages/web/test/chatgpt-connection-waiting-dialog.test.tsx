import "../happydom"
import { afterEach, beforeEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ChatGptConnectionWaitingDialog } from "../src/components/usage/chatgpt-connection-waiting-dialog"

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
})

test("shows the ChatGPT connection modal with a working cancel action", async () => {
  let cancelled = false
  await act(async () =>
    root.render(
      <ChatGptConnectionWaitingDialog
        open
        onCancel={() => {
          cancelled = true
        }}
      />,
    ),
  )

  const dialog = document.querySelector('[role="dialog"]')
  expect(dialog?.textContent).toContain("Connecting ChatGPT")
  expect(dialog?.textContent).toContain("Waiting for browser")

  const cancel = Array.from(dialog?.querySelectorAll("button") ?? []).find((button) =>
    button.textContent?.includes("Cancel Sign-in"),
  )
  if (!cancel) throw new Error("Expected Cancel Sign-in button")
  await act(async () => cancel.click())
  expect(cancelled).toBe(true)
})
