import { IdeaIcon } from "@/icons/app-icons"
import { Button } from "@buddy/ui"

type ReaderFocusExitProps = {
  onExit: () => void
}

export function ReaderFocusExit({ onExit }: ReaderFocusExitProps) {
  return (
    <div className="absolute right-2 top-2 z-40">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Leave Focus"
        title="Leave Focus  ⌘.  ·  Esc"
        onClick={onExit}
        className="bg-surface-raised-stronger-non-alpha/85 text-text-strong shadow-sm backdrop-blur"
      >
        <IdeaIcon />
      </Button>
    </div>
  )
}
