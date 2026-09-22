import type { InAppBrowserLinkTarget } from "@/lib/in-app-browser-settings"
import { createChoiceDialogStore } from "@/state/choice-dialog-store"

export type LinkDestinationChoice = InAppBrowserLinkTarget | "cancel"

export const useLinkDestinationDialogStore = createChoiceDialogStore<
  { url: string },
  LinkDestinationChoice
>("cancel")
