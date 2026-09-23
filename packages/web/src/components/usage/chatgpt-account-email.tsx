import { useState } from "react"
import { cn } from "@buddy/ui"
import { language } from "@/context/language"

const BLURRED_EMAIL_SUFFIX = "••••@••••"

export function ChatGptAccountEmail(props: { email: string; compact?: boolean }) {
  return <AccountEmail key={props.email} {...props} />
}

function AccountEmail(props: { email: string; compact?: boolean }) {
  const [blurred, setBlurred] = useState(true)
  const visiblePrefix = props.email.split("@", 1)[0]?.slice(0, 2) ?? ""
  const email = blurred ? (
    <>
      {visiblePrefix}
      <span className="select-none blur-[2px]">{BLURRED_EMAIL_SUFFIX}</span>
    </>
  ) : (
    props.email
  )
  const actionLabel = blurred
    ? language.t("settings.providers.showAccountEmail")
    : language.t("settings.providers.blurAccountEmail")

  return (
    <button
      type="button"
      data-account-email-visible={blurred ? "false" : "true"}
      data-action="toggle-chatgpt-email-blur"
      aria-label={actionLabel}
      className={cn(
        "min-w-0 cursor-pointer break-all rounded-sm font-mono text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base",
        props.compact ? "text-[11px]" : "text-xs font-medium",
      )}
      onClick={() => setBlurred(!blurred)}
    >
      {email}
    </button>
  )
}
