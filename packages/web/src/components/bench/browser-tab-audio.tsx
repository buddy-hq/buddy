import { ContextMenuItem } from "@buddy/ui"
import { Volume2Icon, VolumeXIcon } from "@/icons/app-icons"
import { useInAppBrowserAudioStore } from "@/state/in-app-browser-audio-store"

function muteLabel(muted: boolean): string {
  return muted ? "Unmute tab" : "Mute tab"
}

function toggleMuted(tabID: string): void {
  useInAppBrowserAudioStore.getState().toggleMuted(tabID)
}

export function BrowserTabAudioButton(props: { tabID: string }) {
  const audio = useInAppBrowserAudioStore((state) => state.byTabID[props.tabID])
  if (!audio?.audible) return null
  const label = muteLabel(audio.muted)
  const Icon = audio.muted ? VolumeXIcon : Volume2Icon
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="relative flex size-4 shrink-0 items-center justify-center rounded-sm text-icon-base hover:bg-surface-base-hover hover:text-text-strong"
      onClick={(event) => {
        event.stopPropagation()
        toggleMuted(props.tabID)
      }}
    >
      <Icon className="size-3" />
    </button>
  )
}

export function BrowserTabMuteMenuItem(props: { tabID: string }) {
  const muted = useInAppBrowserAudioStore((state) => state.byTabID[props.tabID]?.muted ?? false)
  return (
    <ContextMenuItem onSelect={() => toggleMuted(props.tabID)}>{muteLabel(muted)}</ContextMenuItem>
  )
}
