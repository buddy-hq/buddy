import { beforeEach, describe, expect, test } from "bun:test"
import { toast } from "@buddy/ui"
import { chooseLinkTarget } from "../src/components/directory-chat/use-open-link"
import type { InAppBrowserLinkClick } from "../src/lib/in-app-browser-link-target"
import { useInAppBrowserSettingsStore } from "../src/state/in-app-browser-settings-store"
import { useLinkDestinationDialogStore } from "../src/state/link-destination-dialog-store"
import {
  ONE_TIME_NOTICE_LINK_DESTINATION,
  shouldShowOneTimeNotice,
} from "../src/state/one-time-notices"
import { useUiPreferences } from "../src/state/ui-preferences"

const PLAIN_CLICK: InAppBrowserLinkClick = {
  url: "https://developer.mozilla.org/en-US/docs/Web",
  linkTarget: "system",
  modifiedLinkTarget: "browser",
  browserAvailable: true,
  modified: false,
}

function choose(click: InAppBrowserLinkClick = PLAIN_CLICK) {
  return chooseLinkTarget({ click, modifierKey: "⌘" })
}

function pendingLinkQuestion() {
  return useLinkDestinationDialogStore.getState().request?.url
}

beforeEach(() => {
  localStorage.clear()
  useLinkDestinationDialogStore.getState().resolveRequest("cancel")
  useUiPreferences.setState({ seenNotices: {} })
  useInAppBrowserSettingsStore.setState({ linkTarget: "system", modifiedLinkTarget: "browser" })
})

describe("first link click", () => {
  test("asks once, then opens links in Buddy when the user picks it", async () => {
    const answer = choose()
    expect(pendingLinkQuestion()).toBe(PLAIN_CLICK.url)

    useLinkDestinationDialogStore.getState().resolveRequest("browser")

    expect(await answer).toBe("browser")
    expect(useInAppBrowserSettingsStore.getState().linkTarget).toBe("browser")
    expect(shouldShowOneTimeNotice(ONE_TIME_NOTICE_LINK_DESTINATION)).toBe(false)
    expect(await choose({ ...PLAIN_CLICK, linkTarget: "browser" })).toBe("browser")
    expect(pendingLinkQuestion()).toBeUndefined()
  })

  test("keeps the default browser and never asks again when the user picks it", async () => {
    const answer = choose()
    useLinkDestinationDialogStore.getState().resolveRequest("system")

    expect(await answer).toBe("system")
    expect(useInAppBrowserSettingsStore.getState().linkTarget).toBe("system")
    expect(await choose()).toBe("system")
    expect(pendingLinkQuestion()).toBeUndefined()
  })

  test("opens nothing and asks again when the user dismisses the question", async () => {
    const answer = choose()
    useLinkDestinationDialogStore.getState().resolveRequest("cancel")

    expect(await answer).toBeUndefined()
    expect(shouldShowOneTimeNotice(ONE_TIME_NOTICE_LINK_DESTINATION)).toBe(true)
    void choose()
    expect(pendingLinkQuestion()).toBe(PLAIN_CLICK.url)
  })

  test("keeps Cmd/Ctrl-click on the default browser after choosing Buddy", async () => {
    for (const modifiedLinkTarget of ["system", "browser"] as const) {
      useUiPreferences.setState({ seenNotices: {} })
      useInAppBrowserSettingsStore.setState({ linkTarget: "system", modifiedLinkTarget })
      const answer = choose({ ...PLAIN_CLICK, modifiedLinkTarget })
      useLinkDestinationDialogStore.getState().resolveRequest("browser")
      expect(await answer).toBe("browser")

      const settings = useInAppBrowserSettingsStore.getState()
      expect(settings.linkTarget).toBe("browser")
      expect(settings.modifiedLinkTarget).toBe("system")
      const shown = toast.getHistory().at(-1)
      const description = shown && "description" in shown ? shown.description : undefined
      expect(shown && "title" in shown ? shown.title : undefined).toBe("Links now open in Buddy")
      expect(String(description)).toContain("Hold ⌘")
    }
  })

  test("does not ask for Cmd/Ctrl-clicks or links Buddy cannot open", async () => {
    expect(await choose({ ...PLAIN_CLICK, modified: true })).toBe("system")
    expect(await choose({ ...PLAIN_CLICK, url: "mailto:hi@hibuddy.in" })).toBe("system")
    expect(pendingLinkQuestion()).toBeUndefined()
  })
})
