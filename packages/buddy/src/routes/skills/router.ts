import { Hono } from "hono"
import {
  createSkillHandler,
  installLibrarySkillHandler,
  listSkillsHandler,
  removeSkillHandler,
  updateSkillHandler,
} from "./route-handlers.js"
import {
  createSkillRoute,
  installLibrarySkillRoute,
  listSkillsRoute,
  removeSkillRoute,
  updateSkillRoute,
} from "./route-definitions.js"

export const SkillsRoutes = (): Hono =>
  new Hono()
    .get("/", listSkillsRoute, listSkillsHandler)
    .post("/", createSkillRoute, createSkillHandler)
    .post("/library/:skillID/install", installLibrarySkillRoute, installLibrarySkillHandler)
    .patch("/:name", updateSkillRoute, updateSkillHandler)
    .delete("/:name", removeSkillRoute, removeSkillHandler)
