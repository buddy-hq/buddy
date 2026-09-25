import { describe, expect, test } from "bun:test"
import {
  inAppBrowserContextMenuTemplate,
  type InAppBrowserContextMenuParams,
} from "../src/main/in-app-browser-context-menu"

const PARAMS: InAppBrowserContextMenuParams = {
  misspelledWord: "",
  dictionarySuggestions: [],
  linkURL: "",
  mediaType: "none",
  editFlags: {
    canUndo: false,
    canRedo: false,
    canCut: false,
    canCopy: true,
    canPaste: false,
    canDelete: false,
    canSelectAll: true,
    canEditRichly: false,
  },
  selectionText: "plant stems",
  isEditable: false,
}

const ACTIONS = {
  replaceMisspelling: () => undefined,
  copyText: () => undefined,
  copyImage: () => undefined,
  openLinkInDefaultBrowser: () => undefined,
}

function labels(params: InAppBrowserContextMenuParams, cite?: () => void) {
  return inAppBrowserContextMenuTemplate(params, { ...ACTIONS, cite }).map(
    (item) => item.label ?? item.role ?? item.type,
  )
}

describe("in-app Browser context menu", () => {
  test("offers Cite in Chat first for selected page text", () => {
    expect(labels(PARAMS, () => undefined)).toEqual([
      "Cite in Chat",
      "separator",
      "cut",
      "copy",
      "paste",
      "selectAll",
    ])
  })

  test("leaves Cite out for text fields, blank selections, and popups", () => {
    expect(labels({ ...PARAMS, isEditable: true }, () => undefined)).not.toContain("Cite in Chat")
    expect(labels({ ...PARAMS, selectionText: "  " }, () => undefined)).not.toContain(
      "Cite in Chat",
    )
    expect(labels(PARAMS)).not.toContain("Cite in Chat")
  })

  test("offers to open web links in the default browser", () => {
    expect(
      labels({ ...PARAMS, linkURL: "https://hibuddy.in/docs", selectionText: "" }).slice(0, 3),
    ).toEqual(["Open Link in Default Browser", "Copy Link", "separator"])
  })

  test("only offers the default browser for web links", () => {
    for (const linkURL of ["", "mailto:hi@hibuddy.in", "javascript:alert(1)", "not a url"]) {
      expect(labels({ ...PARAMS, linkURL })).not.toContain("Open Link in Default Browser")
    }
  })
})
