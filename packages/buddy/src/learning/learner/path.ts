import path from "node:path"
import { Global } from "../../storage/global.js"

function learnerRoot() {
  return path.join(Global.Path.home, ".buddy", "learner")
}

export namespace LearnerPath {
  export function root() {
    return learnerRoot()
  }

  export function meta() {
    return path.join(learnerRoot(), "meta.json")
  }

  export function goals() {
    return path.join(learnerRoot(), "goals.json")
  }

  export function edges() {
    return path.join(learnerRoot(), "edges.json")
  }

  export function evidenceLog() {
    return path.join(learnerRoot(), "evidence.log")
  }

  export function constraints() {
    return path.join(learnerRoot(), "constraints.json")
  }

  export function practice() {
    return path.join(learnerRoot(), "practice.json")
  }

  export function assessments() {
    return path.join(learnerRoot(), "assessments.json")
  }

  export function misconceptions() {
    return path.join(learnerRoot(), "misconceptions.json")
  }

  export function feedback() {
    return path.join(learnerRoot(), "feedback.json")
  }

  export function projectionsDirectory() {
    return path.join(learnerRoot(), "projections")
  }

  export function progressProjection() {
    return path.join(projectionsDirectory(), "progress.json")
  }

  export function reviewProjection() {
    return path.join(projectionsDirectory(), "review.json")
  }

  export function alignmentProjection() {
    return path.join(projectionsDirectory(), "alignment.json")
  }

  export function workspaceContext(directory: string) {
    return path.join(directory, ".buddy", "context.json")
  }

  export function workspaceDirectory(directory: string) {
    return path.dirname(workspaceContext(directory))
  }
}
