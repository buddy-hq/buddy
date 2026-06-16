import { createFileRoute, useLocation } from "@tanstack/react-router"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import { BenchStaticContextProvider } from "@/components/bench/bench-static-context-provider"
import { QuestionSetBenchReview } from "@/components/bench/question-set-bench-review"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { decodeDirectory } from "@/lib/directory-token"
import { routeString } from "@/components/bench/bench-context-utils"

export const Route = createFileRoute("/$directory/_bench/artifacts/question-set/$artifactID")({
  loader: async ({ params }) => {
    const directory = decodeDirectory(params.directory)
    return requireBuddyData(
      await getBuddyClient(directory).questionSet.read({
        directory,
        artifactID: params.artifactID,
      }),
    )
  },
  pendingComponent: QuestionSetBenchPending,
  errorComponent: QuestionSetBenchError,
  component: QuestionSetBenchRoute,
})

function QuestionSetBenchPending() {
  return (
    <BenchStaticContextProvider
      status="loading"
      metadata={["surface_status: loading"]}
      content="Question set is visible on Bench and loading."
      hints={["Try bench_read_context again after the question set finishes loading."]}
    >
      <BenchViewerShell title="Loading question set">
        <div className="flex h-full items-center justify-center text-sm text-text-weak">
          <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
          Loading question set
        </div>
      </BenchViewerShell>
    </BenchStaticContextProvider>
  )
}

function QuestionSetBenchError() {
  return (
    <BenchStaticContextProvider
      status="error"
      metadata={["surface_status: error"]}
      content="Question set is visible on Bench, but it could not be loaded."
      hints={["Check that the question set artifact exists."]}
    >
      <BenchViewerShell title="Question set unavailable">
        <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
          <AlertCircleIcon className="mr-2 size-4" aria-hidden />
          Question set could not be loaded.
        </div>
      </BenchViewerShell>
    </BenchStaticContextProvider>
  )
}

function QuestionSetBenchRoute() {
  const location = useLocation()
  const params = Route.useParams()
  const artifact = Route.useLoaderData()

  try {
    const directory = decodeDirectory(params.directory)
    return (
      <QuestionSetBenchReview
        directory={directory}
        route={routeString({
          pathname: location.pathname,
          searchStr: location.searchStr,
        })}
        artifact={artifact}
        onSubmit={async (answers) => {
          const response = await getBuddyClient(directory).questionSet.submitAttempt({
            directory,
            artifactID: artifact.artifactID,
            answers: artifact.questions.map((question) => ({
              questionID: question.id,
              selectedChoiceIds: answers[question.id] ?? [],
            })),
          })
          return requireBuddyData(response).result
        }}
      />
    )
  } catch {
    return <DirectoryInvalidNotebook />
  }
}
