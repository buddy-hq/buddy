import { createFileRoute, useLocation } from "@tanstack/react-router"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
import { FlashcardBenchReview } from "@/components/bench/flashcard-bench-review"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { decodeDirectory } from "@/lib/directory-token"
import { routeString } from "@/components/bench/bench-context-utils"

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
    <BenchStaticContextProvider
      status="loading"
      metadata={["surface_status: loading"]}
      content="Flashcard deck is visible on Bench and loading."
      hints={["Try bench_read_context again after the flashcard deck finishes loading."]}
    >
      <BenchViewerShell title="Loading flashcards">
        <div className="flex h-full items-center justify-center text-sm text-text-weak">
          <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
          Loading flashcards
        </div>
      </BenchViewerShell>
    </BenchStaticContextProvider>
  )
}

function FlashcardBenchError() {
  return (
    <BenchStaticContextProvider
      status="error"
      metadata={["surface_status: error"]}
      content="Flashcard deck is visible on Bench, but it could not be loaded."
      hints={["Check that the flashcard deck artifact exists."]}
    >
      <BenchViewerShell title="Flashcards unavailable">
        <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
          <AlertCircleIcon className="mr-2 size-4" aria-hidden />
          Flashcards could not be loaded.
        </div>
      </BenchViewerShell>
    </BenchStaticContextProvider>
  )
}

function FlashcardBenchRoute() {
  const location = useLocation()
  const params = Route.useParams()
  const deck = Route.useLoaderData()

  try {
    const directory = decodeDirectory(params.directory)
    return (
      <FlashcardBenchReview
        directory={directory}
        artifactID={params.artifactID}
        route={routeString({
          pathname: location.pathname,
          searchStr: location.searchStr,
        })}
        deck={deck}
      />
    )
  } catch {
    return <DirectoryInvalidNotebook />
  }
}
