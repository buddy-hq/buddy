import { Button } from "@buddy/ui"
import { language } from "@/context/language"
import { ArrowDownIcon } from "@/icons/app-icons"

type JumpToLatestButtonProps = {
  onClick: () => void
}

export function JumpToLatestButton(props: JumpToLatestButtonProps) {
  const label = language.t("chat.jumpToLatest")

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      title={label}
      className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background-stronger/75 text-text-weaker backdrop-blur-sm hover:text-text-strong"
      onClick={props.onClick}
    >
      <ArrowDownIcon className="size-4" aria-hidden="true" />
    </Button>
  )
}
