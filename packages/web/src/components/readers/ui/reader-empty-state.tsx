import type { ReactNode } from "react"
import { ScrollTextIcon } from "@/icons/app-icons"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@buddy/ui"

type ReaderEmptyStateProps = {
  children?: ReactNode
}

const DEFAULT_READER_EMPTY_MESSAGE = "Select a compatible document to preview it here."

export function ReaderEmptyState({ children }: ReaderEmptyStateProps) {
  return (
    <Empty className="h-full min-h-80 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ScrollTextIcon />
        </EmptyMedia>
        <EmptyTitle>Reader ready</EmptyTitle>
        <EmptyDescription>{children ?? DEFAULT_READER_EMPTY_MESSAGE}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
