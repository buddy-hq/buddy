import { createFileRoute } from "@tanstack/react-router"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import { FlashcardBenchReview } from "@/components/bench/flashcard-bench-review"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { decodeDirectory } from "@/lib/directory-token"

export const Route = createFileRoute("/$directory/_bench/artifacts/flashcard-deck/$artifactID")({
  loader: async ({ params }) => {
    const directory = decodeDirectory(params.directory)
    return requireBuddyData(
      await getBuddyClient(directory).flashcardDeck.read({
        directory,
        artifactID: params.artifactID,
      }),
    )
  },
  pendingComponent: FlashcardBenchPending,
  errorComponent: FlashcardBenchError,
  component: FlashcardBenchRoute,
})

function FlashcardBenchPending() {
  return (
    <BenchViewerShell title="Loading flashcards">
      <div className="flex h-full items-center justify-center text-sm text-text-weak">
        <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
        Loading flashcards
      </div>
    </BenchViewerShell>
  )
}

function FlashcardBenchError() {
  return (
    <BenchViewerShell title="Flashcards unavailable">
      <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
        <AlertCircleIcon className="mr-2 size-4" aria-hidden />
        Flashcards could not be loaded.
      </div>
    </BenchViewerShell>
  )
}

function FlashcardBenchRoute() {
  const params = Route.useParams()
  const deck = Route.useLoaderData()

  try {
    const directory = decodeDirectory(params.directory)
    return (
      <FlashcardBenchReview
        directory={directory}
        artifactID={params.artifactID}
        deck={deck}
      />
    )
  } catch {
    return <DirectoryInvalidNotebook />
  }
}
