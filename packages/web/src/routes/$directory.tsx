import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router"
import { motion, AnimatePresence } from "motion/react"
import { DirectoryNotebookRouteProvider } from "@/components/directory-chat/directory-notebook-route-context"

export const Route = createFileRoute("/$directory")({
  component: DirectoryRouteLayout,
})

function DirectoryRouteLayout() {
  const params = Route.useParams()
  const location = useLocation()

  return (
    <DirectoryNotebookRouteProvider directoryToken={params.directory}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={location.pathname}
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
