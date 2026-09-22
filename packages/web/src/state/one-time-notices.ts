import { useUiPreferences } from "@/state/ui-preferences"

export const ONE_TIME_NOTICE_NOTES_LOCATION_INTRO = "notes-location-intro"
export const ONE_TIME_NOTICE_LINK_DESTINATION = "link-destination"

export type OneTimeNoticeID =
  | typeof ONE_TIME_NOTICE_NOTES_LOCATION_INTRO
  | typeof ONE_TIME_NOTICE_LINK_DESTINATION

export type SeenOneTimeNotices = Partial<Record<OneTimeNoticeID, true>>

export function shouldShowOneTimeNotice(id: OneTimeNoticeID): boolean {
  if (!useUiPreferences.persist.hasHydrated()) return false
  return useUiPreferences.getState().seenNotices[id] !== true
}

export function markOneTimeNoticeSeen(id: OneTimeNoticeID): void {
  useUiPreferences.getState().markNoticeSeen(id)
}
