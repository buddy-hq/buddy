import type { ReactNode } from "react"

export function SkillsRailListRow(props: {
  title: string
  description: string
  ariaLabel: string
  control: ReactNode
  onSelect: () => void
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start hover:bg-surface-base-hover">
      <button
        type="button"
        className="h-auto min-w-0 bg-transparent px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-interactive-base/50"
        aria-label={props.ariaLabel}
        onClick={props.onSelect}
      >
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5 py-0.5">
          <span className="w-full truncate text-sm font-medium text-text-base">{props.title}</span>
          <span className="line-clamp-2 w-full whitespace-normal text-xs font-normal leading-snug text-text-weak">
            {props.description}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center px-4 py-3 pl-2">{props.control}</div>
    </div>
  )
}

export function SkillsRailSearchResultGroup(props: { label: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-text-weaker">
        {props.label}
      </h3>
      {props.children}
    </section>
  )
}

export function SkillsRailDetailField(props: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_1fr] items-start gap-3">
      <dt className="text-xs font-medium text-text-weaker">{props.label}</dt>
      <dd className="min-w-0 text-sm text-text-weak">{props.children}</dd>
    </div>
  )
}
