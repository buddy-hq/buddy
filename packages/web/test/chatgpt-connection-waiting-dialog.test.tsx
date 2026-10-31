import "../happydom"
import { afterEach, beforeEach, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  Dialog,
  DialogTitle,
} from "@buddy/ui"
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

test("shared modal headers constrain their tracks and wrap long text", async () => {
  await act(async () => {
    root.render(
      <>
        <AlertDialog>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove item?</AlertDialogTitle>
            <AlertDialogDescription>Remove this item.</AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialog>
        <Dialog>
          <DialogTitle>Details</DialogTitle>
        </Dialog>
      </>,
    )
  })

  const header = container.querySelector('[data-slot="alert-dialog-header"]')
  expect(header?.classList.contains("grid-cols-[minmax(0,1fr)]")).toBe(true)
  expect(
    header?.classList.contains(
      "sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-cols-[auto_minmax(0,1fr)]",
    ),
  ).toBe(true)
  for (const slot of ["alert-dialog-title", "alert-dialog-description", "dialog-title"]) {
    const item = container.querySelector(`[data-slot="${slot}"]`)
    expect(item?.classList.contains("[overflow-wrap:anywhere]")).toBe(true)
    if (slot !== "dialog-title") {
      expect(item?.classList.contains("w-full")).toBe(true)
      expect(item?.classList.contains("min-w-0")).toBe(true)
    }
  }
})
