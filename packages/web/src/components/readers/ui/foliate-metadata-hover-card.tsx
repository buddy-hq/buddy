import { HoverCard, HoverCardContent, HoverCardTrigger } from "@buddy/ui"
import { FoliateMetadataPanel } from "./foliate-metadata-panel"
import type { FoliateReaderSnapshot } from "../foliate-reader-types"

export interface FoliateMetadataHoverCardProps {
  snapshot: FoliateReaderSnapshot | null
  children: React.ReactNode
}

export function FoliateMetadataHoverCard({ snapshot, children }: FoliateMetadataHoverCardProps) {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="right" align="start" sideOffset={8} className="w-[320px] p-3">
        <FoliateMetadataPanel snapshot={snapshot} />
      </HoverCardContent>
    </HoverCard>
  )
}
