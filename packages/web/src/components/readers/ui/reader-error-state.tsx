import { AlertCircleIcon } from "@/icons/app-icons"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@buddy/ui"

type ReaderErrorStateProps = {
  error: Error
}

const DEFAULT_READER_ERROR_MESSAGE = "Buddy could not initialize the reader for this document."

export function ReaderErrorState({ error }: ReaderErrorStateProps) {
  return (
    <Empty className="h-full min-h-80 border border-border-critical-base bg-surface-critical-weak">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertCircleIcon />
        </EmptyMedia>
        <EmptyTitle>Unable to open publication</EmptyTitle>
        <EmptyDescription>{error.message || DEFAULT_READER_ERROR_MESSAGE}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
