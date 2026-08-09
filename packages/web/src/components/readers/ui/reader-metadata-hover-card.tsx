import type { ReactNode } from "react"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@buddy/ui"
import type { ReaderSnapshot } from "../reader-types"
import { ReaderMetadataPanel } from "./reader-metadata-panel"

type ReaderMetadataHoverCardProps = {
  snapshot: ReaderSnapshot | null
  children: ReactNode
}

export function ReaderMetadataHoverCard({ snapshot, children }: ReaderMetadataHoverCardProps) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="right" align="start" sideOffset={8} className="w-80">
        <ReaderMetadataPanel snapshot={snapshot} />
      </HoverCardContent>
    </HoverCard>
  )
}
