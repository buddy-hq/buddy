import { Button } from "@buddy/ui"
import { BookOpenIcon } from "@/icons/app-icons"
import { ObjectCard } from "../../object-card"
import { ToolOutputPanel } from "../../tool-output-panel"
import type { ToolPartProps } from "../../registry"
import { BENCH_MODE_REQUEST_POLICY, useOpenBench } from "@/lib/bench-navigation"
import {
  objectBenchTarget,
  readInlinePresentation,
  type BuddyPresentationDescriptor,
} from "../buddy-object-result"
import { useHydratedInlinePresentation } from "../use-hydrated-inline-presentation"

function CompletedFlashcardDeckTool(props: {
  toolProps: ToolPartProps
  presentation: BuddyPresentationDescriptor
}) {
  const openBenchRoute = useOpenBench()
  const hydrated = useHydratedInlinePresentation({
    directory: props.toolProps.directory,
    presentation: props.presentation,
  })
  const data =
    hydrated.presentation.data?.renderer === "flashcard-deck"
      ? hydrated.presentation.data
      : undefined

  if (!data) {
    return (
      <ObjectCard
        title={props.toolProps.info.title}
        subtitle={hydrated.isPending ? "Loading flashcard deck" : "Flashcard deck unavailable"}
        status={props.toolProps.state.status}
      />
    )
  }

  const directory = props.toolProps.directory
  return (
    <ObjectCard
      title={data.title}
      subtitle={`${data.noteCount} ${data.noteCount === 1 ? "note" : "notes"} · ${data.cardCount} ${data.cardCount === 1 ? "card" : "cards"}`}
      badge="Flashcards"
      status={props.toolProps.state.status}
      actions={
        directory ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void openBenchRoute({
                directory,
                target: objectBenchTarget({
                  kind: "flashcard-deck",
                  objectID: hydrated.presentation.ref.objectID,
                  viewID: "review",
                }),
                mode: BENCH_MODE_REQUEST_POLICY,
                autoOpen: null,
              })
            }}
          >
            <BookOpenIcon className="size-3.5" aria-hidden />
            Review
          </Button>
        ) : null
      }
    />
  )
}

export function renderSavedFlashcardDeckTool(props: ToolPartProps) {
  const running = props.state.status === "pending" || props.state.status === "running"
  const presentation =
    props.state.status === "completed"
      ? readInlinePresentation(props.state.metadata, "flashcard-deck")
      : undefined

  if (presentation) {
    return <CompletedFlashcardDeckTool toolProps={props} presentation={presentation} />
  }

  const output = props.state.output || (props.state.error ?? "")
  return (
    <ObjectCard
      title={props.info.title}
      subtitle={props.info.subtitle}
      status={props.state.status}
      innerClassName="p-3"
    >
      {!running && output.trim().length > 0 ? <ToolOutputPanel output={output} /> : null}
    </ObjectCard>
  )
}
