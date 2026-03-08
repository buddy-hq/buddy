import path from "node:path"
import type { LearnerArtifactKind } from "./types.js"
import { Global } from "../../../storage/global.js"

const KINDS_WITH_DIRECTORIES: Record<Exclude<LearnerArtifactKind, "workspace-context" | "profile">, string> = {
  goal: "goals",
  message: "messages",
  practice: "practice",
  assessment: "assessments",
  evidence: "evidence",
  feedback: "feedback",
  misconception: "misconceptions",
  "decision-interpret-message": path.join("decisions", "interpret-message"),
  "decision-feedback": path.join("decisions", "feedback"),
  "decision-plan": path.join("decisions", "plan"),
}

export namespace LearnerArtifactPath {
  function assertSafeArtifactId(artifactId: string) {
    if (!/^[^/\\]+$/.test(artifactId) || artifactId.includes("..")) {
      throw new Error(`Invalid artifact id: ${artifactId}`)
    }
  }

  export function workspaceRoot(directory: string) {
    return path.join(directory, ".buddy", "learner")
  }

  export function workspaceContextFile(directory: string) {
    return path.join(workspaceRoot(directory), "workspace", "context.md")
  }

  export function kindDirectory(directory: string, kind: Exclude<LearnerArtifactKind, "workspace-context" | "profile">) {
    return path.join(workspaceRoot(directory), KINDS_WITH_DIRECTORIES[kind])
  }

  export function artifactFile(
    directory: string,
    kind: Exclude<LearnerArtifactKind, "workspace-context" | "profile">,
    artifactId: string,
  ) {
    assertSafeArtifactId(artifactId)
    return path.join(kindDirectory(directory, kind), `${artifactId}.md`)
  }

  export function profileRoot() {
    return path.join(Global.Path.home, ".buddy", "profile", "learner")
  }

  export function profileFile() {
    return path.join(profileRoot(), "profile.md")
  }
}
