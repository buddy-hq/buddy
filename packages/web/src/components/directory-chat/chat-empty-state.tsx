import { language } from "@/context/language"
import buddyMascotWaveUrl from "../../../../../assets/mascot/buddy-mascot-wave.png"

type ChatEmptyStateProps = {
  directoryLabel: string
}

const INBOX_DIRECTORY_LABEL = "Inbox" as const

export function ChatEmptyState(props: ChatEmptyStateProps) {
  const isInboxDirectory =
    props.directoryLabel.trim().toLowerCase() === INBOX_DIRECTORY_LABEL.toLowerCase()

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-1 items-center justify-center duration-700">
      <div className="relative w-full max-w-xl px-4 text-center">
        <div className="relative">
          <div className="relative min-h-[19rem] overflow-hidden rounded-[2rem] border border-border-base/70 bg-surface-base/70 px-8 py-10 shadow-sm backdrop-blur-sm md:min-h-[22rem] md:px-12 md:py-12">
            <div className="relative z-10 max-w-[22rem] space-y-3 text-left">
              <h1 className="text-3xl font-bold tracking-tight text-text-base md:text-5xl">
                {isInboxDirectory
                  ? language.t("sidebar.quickChat")
                  : language.t("chat.emptyState.title")}
              </h1>
              {!isInboxDirectory && (
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-text-weak">
                  {props.directoryLabel}
                </p>
              )}
            </div>

            <img
              src={buddyMascotWaveUrl}
              alt={`${language.t("routes.chat.productName")} mascot waving`}
              className="pointer-events-none absolute bottom-0 right-0 w-36 translate-x-4 translate-y-3 md:w-48"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
