import NOTES_CONTEXT_TEMPLATE_SOURCE from "./notes-context.t.md"
import { defineRuntimeSection } from "./definition"
import { definePromptTemplate } from "../template/engine"

const NOTES_CONTEXT_TEMPLATE = definePromptTemplate({
  source: NOTES_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/notes-context.t.md",
})

export const notesSection = defineRuntimeSection({
  key: "notes",
  render: (context) =>
    NOTES_CONTEXT_TEMPLATE.render({
      notes_directory: context.notes.directory,
      notebook_name: context.notes.notebook,
      notebook_id_suffix: context.notes.notebookID
        ? ` (buddy-notebook-id: ${context.notes.notebookID})`
        : "",
    }),
})
