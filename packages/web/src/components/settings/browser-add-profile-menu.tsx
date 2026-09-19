import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@buddy/ui"
import type { BrowserImportSource } from "@buddy/browser-contract/browser-import"
import { PlusIcon } from "@/icons/app-icons"
import { isListedBrowserImportSource } from "@/lib/browser-import-wizard"

function ImportSourceItems(props: {
  sources: readonly BrowserImportSource[] | null
  onImport: (source: BrowserImportSource) => void
}) {
  if (props.sources === null) {
    return <DropdownMenuItem disabled>Looking for browsers…</DropdownMenuItem>
  }
  const listed = props.sources.filter(isListedBrowserImportSource)
  if (listed.length === 0) {
    return <DropdownMenuItem disabled>No supported browsers found</DropdownMenuItem>
  }
  return listed.map((source) => (
    <DropdownMenuItem key={source.id} onSelect={() => props.onImport(source)}>
      {source.name}
    </DropdownMenuItem>
  ))
}

export function BrowserAddProfileMenu(props: {
  disabled: boolean
  atProfileLimit: boolean
  sources: readonly BrowserImportSource[] | null
  onOpen: () => void
  onCreateBlank: () => void
  onImport: (source: BrowserImportSource) => void
}) {
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) props.onOpen()
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" disabled={props.disabled}>
          <PlusIcon className="size-3.5" />
          Add profile
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem disabled={props.atProfileLimit} onSelect={props.onCreateBlank}>
          Blank profile
        </DropdownMenuItem>
        {props.atProfileLimit ? (
          <DropdownMenuItem disabled>You’ve reached the profile limit</DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Import from</DropdownMenuLabel>
          <ImportSourceItems sources={props.sources} onImport={props.onImport} />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
