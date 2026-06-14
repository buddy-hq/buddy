import { createFileRoute } from "@tanstack/react-router"
import { AlertCircleIcon, Loader2Icon } from "lucide-react"
import { BenchViewerShell } from "@/components/bench/bench-viewer-shell"
import { QuestionSetBenchReview } from "@/components/bench/question-set-bench-review"
import { DirectoryInvalidNotebook } from "@/components/directory-chat/directory-invalid-notebook"
import { getBuddyClient, requireBuddyData } from "@/lib/buddy-client"
import { decodeDirectory } from "@/lib/directory-token"

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
    <BenchViewerShell title="Loading question set">
      <div className="flex h-full items-center justify-center text-sm text-text-weak">
        <Loader2Icon className="mr-2 size-4 animate-spin" aria-hidden />
        Loading question set
      </div>
    </BenchViewerShell>
  )
}

function QuestionSetBenchError() {
  return (
    <BenchViewerShell title="Question set unavailable">
      <div className="flex h-full items-center justify-center p-6 text-sm text-icon-critical-base">
        <AlertCircleIcon className="mr-2 size-4" aria-hidden />
        Question set could not be loaded.
      </div>
    </BenchViewerShell>
  )
}

function QuestionSetBenchRoute() {
  const params = Route.useParams()
  const artifact = Route.useLoaderData()

  try {
    const directory = decodeDirectory(params.directory)
    return (
      <QuestionSetBenchReview
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
