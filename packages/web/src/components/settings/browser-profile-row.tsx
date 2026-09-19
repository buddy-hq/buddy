import { useState } from "react"
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
} from "@buddy/ui"
import {
  IN_APP_BROWSER_PROFILE_NAME_MAX_LENGTH,
  parseInAppBrowserProfileName,
  type InAppBrowserProfile,
} from "@buddy/browser-contract/profiles"
import { EllipsisIcon } from "@/icons/app-icons"

function BrowserProfileNameInput(props: {
  name: string
  disabled: boolean
  onCommit: (name: string) => void
}) {
  const [draft, setDraft] = useState(props.name)

  function commit() {
    const name = parseInAppBrowserProfileName(draft)
    if (name && name !== props.name) props.onCommit(name)
    else setDraft(props.name)
  }

  return (
    <Input
      aria-label={`Rename ${props.name}`}
      value={draft}
      maxLength={IN_APP_BROWSER_PROFILE_NAME_MAX_LENGTH}
      disabled={props.disabled}
      className="h-7 w-full max-w-56 px-2 text-[13px] shadow-none"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") setDraft(props.name)
      }}
    />
  )
}

export function BrowserProfileRow(props: {
  profile: InAppBrowserProfile
  isDefault: boolean
  disabled: boolean
  onRename?: (name: string) => void
  onSetDefault: () => void
  onClearData: () => void
  onRemove?: () => void
}) {
  const { profile } = props
  return (
    <div className="flex items-center gap-3 border-t border-border-base/60 px-4 py-2.5 first:border-t-0 sm:px-5">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {props.onRename ? (
          <BrowserProfileNameInput
            key={profile.name}
            name={profile.name}
            disabled={props.disabled}
            onCommit={props.onRename}
          />
        ) : (
          <span className="truncate text-[13px] text-text-strong">{profile.name}</span>
        )}
        {props.isDefault ? <Badge>Default</Badge> : null}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            disabled={props.disabled}
            aria-label={`${profile.name} options`}
          >
            <EllipsisIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem disabled={props.isDefault} onSelect={props.onSetDefault}>
            Set as default
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={props.onClearData}>Clear cookies and cache</DropdownMenuItem>
          {props.onRemove ? (
            <DropdownMenuItem variant="destructive" onSelect={props.onRemove}>
              Remove profile and data
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
