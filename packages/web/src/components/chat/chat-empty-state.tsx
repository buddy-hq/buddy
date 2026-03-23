import buddyIcon from "../../../public/buddy-icon.png"

type ChatEmptyStateProps = {
  directoryLabel: string
}

const logoFilter = "saturate(1.06) contrast(1.04)"

export function ChatEmptyState(props: ChatEmptyStateProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-1 items-center justify-center duration-700">
      <div className="flex flex-col items-center text-center">
        <img
          src={buddyIcon}
          alt="Buddy"
          className="mb-6 size-12 rounded-xl opacity-90 transition-all duration-300 hover:scale-[1.02] hover:opacity-100 [mix-blend-mode:var(--text-mix-blend-mode)]"
          style={{ filter: logoFilter }}
        />

        <h1 className="text-2xl font-bold tracking-tight text-text-base">Let&apos;s understand</h1>
        <p className="mt-1 text-lg font-medium text-text-weak">{props.directoryLabel}</p>
      </div>
    </div>
  )
}
