import { Hono } from "hono"
import {
  learnerArtifactsHandler,
  learnerPlanHandler,
  learnerSnapshotHandler,
  learnerWorkspacePatchHandler,
} from "./route-handlers.js"
import {
  learnerArtifactsRoute,
  learnerPlanRoute,
  learnerSnapshotRoute,
  learnerWorkspacePatchRoute,
} from "./route-definitions.js"

export const LearnerRoutes = (): Hono =>
  new Hono()
    .get("/snapshot", learnerSnapshotRoute, learnerSnapshotHandler)
    .post("/plan", learnerPlanRoute, learnerPlanHandler)
    .get("/artifacts", learnerArtifactsRoute, learnerArtifactsHandler)
    .patch("/workspace", learnerWorkspacePatchRoute, learnerWorkspacePatchHandler)
