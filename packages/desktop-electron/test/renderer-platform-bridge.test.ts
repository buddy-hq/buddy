import { afterEach, describe, expect, test } from "bun:test"
import { createDesktopPlatform } from "../src/renderer/platform"
import type { ElectronAPI } from "../src/preload/types"

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document")

function setBridge(api: Pick<ElectronAPI, "listFileApplications">) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { api, addEventListener() {} },
  })
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { addEventListener() {} },
  })
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "Macintosh" },
  })
}

afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow)
  else Reflect.deleteProperty(globalThis, "window")
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator)
  else Reflect.deleteProperty(globalThis, "navigator")
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument)
  else Reflect.deleteProperty(globalThis, "document")
})

describe("renderer file application bridge", () => {
  test("keeps file views usable when an older preload has no app discovery method", async () => {
    setBridge({})
    expect(await createDesktopPlatform().listFileApplications?.("/workspace/note.txt")).toEqual({
      applications: [],
      defaultApplication: null,
    })
  })

  test("lists available applications from a current preload", async () => {
    const installed = [
      { id: "cursor", name: "Cursor", path: "/Applications/Cursor.app", icon: null },
    ]
    setBridge({
      listFileApplications: async (path) => {
        expect(path).toBe("/workspace/note.txt")
        return { applications: installed, defaultApplication: installed[0] ?? null }
      },
    })
    expect(await createDesktopPlatform().listFileApplications?.("/workspace/note.txt")).toEqual({
      applications: installed,
      defaultApplication: installed[0],
    })
  })
})
