import { ALargeSmall } from "lucide-react"
import { Button, Popover, PopoverContent, PopoverTrigger } from "@buddy/ui"
import { FoliatePreferencesPanel } from "./foliate-preferences-panel"
import type { FoliateReaderPreferences } from "../foliate-reader-types"

export interface FoliatePreferencesPopoverProps {
  preferences: FoliateReaderPreferences
  setPreferences: React.Dispatch<React.SetStateAction<FoliateReaderPreferences>>
  canChangeFlow: boolean
}

export function FoliatePreferencesPopover({
  preferences,
  setPreferences,
  canChangeFlow,
}: FoliatePreferencesPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Reader preferences"
          className="shrink-0 text-text-weaker hover:text-text-base"
        >
          <ALargeSmall className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex w-[360px] max-h-[85vh] flex-col overflow-hidden p-0 sm:max-h-[75vh]"
      >
        <FoliatePreferencesPanel
          preferences={preferences}
          setPreferences={setPreferences}
          canChangeFlow={canChangeFlow}
        />
      </PopoverContent>
    </Popover>
  )
}
