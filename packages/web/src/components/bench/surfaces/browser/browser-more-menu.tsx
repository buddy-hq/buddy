import { parseInAppBrowserAppearance, type InAppBrowserAppearance } from "@buddy/browser-contract"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@buddy/ui"
import { EllipsisIcon, MinusIcon, PlusIcon } from "@/icons/app-icons"

const APPEARANCE_OPTIONS: ReadonlyArray<{ value: InAppBrowserAppearance; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
]

function keepMenuOpen(action: () => void) {
  return (event: Event) => {
    event.preventDefault()
    action()
  }
}

function BrowserZoomControls(props: {
  zoomFactor: number
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
}) {
  return (
    <DropdownMenuGroup className="flex items-center">
      <span className="flex-1 px-2 text-sm">Zoom</span>
      <DropdownMenuItem aria-label="Zoom out" onSelect={keepMenuOpen(props.onZoomOut)}>
        <MinusIcon className="size-3.5" />
      </DropdownMenuItem>
      <DropdownMenuItem
        aria-label="Reset zoom"
        className="w-12 justify-center tabular-nums"
        onSelect={keepMenuOpen(props.onResetZoom)}
      >
        {Math.round(props.zoomFactor * 100)}%
      </DropdownMenuItem>
      <DropdownMenuItem aria-label="Zoom in" onSelect={keepMenuOpen(props.onZoomIn)}>
        <PlusIcon className="size-3.5" />
      </DropdownMenuItem>
    </DropdownMenuGroup>
  )
}

function BrowserAppearanceMenu(props: {
  appearance: InAppBrowserAppearance
  onAppearanceChange: (appearance: InAppBrowserAppearance) => void
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Appearance</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={props.appearance}
          onValueChange={(value) => {
            const appearance = parseInAppBrowserAppearance(value)
            if (appearance) props.onAppearanceChange(appearance)
          }}
        >
          {APPEARANCE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

export function BrowserMoreMenu(props: {
  zoomFactor: number
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
  appearance: InAppBrowserAppearance
  onAppearanceChange: (appearance: InAppBrowserAppearance) => void
  onHardReload: () => void
  onOpenDevTools: () => void
  onClearCookies: () => void
  onClearCache: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="More" title="More">
          <EllipsisIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={props.onHardReload}>Hard reload</DropdownMenuItem>
          <DropdownMenuItem onSelect={props.onOpenDevTools}>Open DevTools</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <BrowserZoomControls
          zoomFactor={props.zoomFactor}
          onZoomIn={props.onZoomIn}
          onZoomOut={props.onZoomOut}
          onResetZoom={props.onResetZoom}
        />
        <BrowserAppearanceMenu
          appearance={props.appearance}
          onAppearanceChange={props.onAppearanceChange}
        />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={props.onClearCookies}>Clear cookies</DropdownMenuItem>
          <DropdownMenuItem onSelect={props.onClearCache}>Clear cache</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
