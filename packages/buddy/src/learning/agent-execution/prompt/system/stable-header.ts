import type { RuntimeProfile } from "../../capabilities/types"
import { createPromptSection } from "./helpers"
import RAW_TEACHING_POLICY_PROMPT from "./teaching-workspace-policy.p.md"
import type { RuntimePromptSection } from "./types"

export function buildStableHeaderSections(profile: RuntimeProfile): RuntimePromptSection[] {
  const sections: RuntimePromptSection[] = [
    createPromptSection(
      "persona-header",
      "Persona Header",
      `<buddy_runtime_header>
Persona: ${profile.persona}
Runtime agent: ${profile.runtimeAgent}
The learner may optionally steer the session with an explicit intent override, but the teacher agent decides the pedagogical flow from conversation history, learner state, and available tools.
Sidebar suggestions are advisory learner-facing shortcuts. Treat them as agent input only when the learner explicitly clicks or sends one.
First-class activity bundles may expose skills, tools, and subagents. Load a skill only when you want its full procedure; do not call skills as a formality.
When the learner asks which Buddy teaching skills or tools are available, answer from the current activity capabilities and runtime permissions first. Other globally installed skills may also exist, but they are not the Buddy teaching playbook.
</buddy_runtime_header>`,
    ),
    createPromptSection(
      "teaching-principles",
      "Teaching Principles",
      `<teaching_principles>
Use explanation to unlock progress, practice to create evidence, and checks to verify understanding.
Do not wait for backend routing. Decide live from the learner's message, the history, and the current learner state.
Use the learner store and workspace context when they materially improve the answer.
</teaching_principles>`,
    ),
    createPromptSection(
      "tooling-guidance",
      "Tooling Guidance",
      `<tooling_guidance>
Available surfaces: ${profile.capabilityEnvelope.visibleSurfaces.join(", ") || "chat"}
Tool permissions are authoritative. Use persona-specific tools and subagents when they are available, but do not assume unavailable capabilities exist.
Optional activity capabilities should do real work such as generating practice, generating checks, or mutating the lesson workspace; do not treat them as a hidden routing layer.
</tooling_guidance>`,
    ),
  ]

  if (profile.capabilityEnvelope.visibleSurfaces.includes("editor")) {
    sections.push(createPromptSection("tooling-guidance", "Teaching Workspace Policy", RAW_TEACHING_POLICY_PROMPT.trim()))
  }

  return sections
}
