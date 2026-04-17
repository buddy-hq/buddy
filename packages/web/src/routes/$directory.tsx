import { Outlet, createFileRoute } from "@tanstack/react-router"
import { motion, AnimatePresence } from "motion/react"
import { DirectoryNotebookRouteProvider } from "@/components/directory-chat/directory-notebook-route-context"
import { openProjectsWithSessionsQueryOptions } from "@/state/bootstrap-query"

export const Route = createFileRoute("/$directory")({
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.ensureQueryData(openProjectsWithSessionsQueryOptions()),
    ])
  },
  component: DirectoryRouteLayout,
})

function DirectoryRouteLayout() {
  const params = Route.useParams()

  return (
    <DirectoryNotebookRouteProvider directoryToken={params.directory}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={params.directory}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="h-full w-full overflow-hidden"
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </DirectoryNotebookRouteProvider>
  )
}
