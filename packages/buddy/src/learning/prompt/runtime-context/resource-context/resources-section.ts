import NOTEBOOK_RESOURCES_CONTEXT_TEMPLATE_SOURCE from "./notebook-resources-context.t.md"
import { defineRuntimeSection } from "../definition"
import {
  RESOURCE_PACK_CHUNKS_DIR_NAME,
  RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
  RESOURCE_PACK_FULL_TEXT_FILE_PREFIX,
  RESOURCE_PACK_PAGES_DIR_NAME,
  RESOURCE_PACK_PROCESSED_DIR_NAME,
  RESOURCE_PACK_ROOT_DIR,
  RESOURCE_PACK_TOC_FILE_NAME,
} from "../../../../resource-packs/contracts"
import { definePromptTemplate } from "../../template/engine"

const RESOURCE_INVENTORY_DETAILED_MAX_ITEMS = 7
const RESOURCE_INVENTORY_ALIAS_ONLY_MAX_ITEMS = 20
const RESOURCE_PATH_PREVIEW_MAX_CHARS = 120
const RESOURCE_WARNING_PREVIEW_MAX_CHARS = 140

const NOTEBOOK_RESOURCES_CONTEXT_TEMPLATE = definePromptTemplate({
  source: NOTEBOOK_RESOURCES_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/resource-context/notebook-resources-context.t.md",
})

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

function firstWarningText(warnings: string[]): string | undefined {
  const warning = warnings.find((entry) => entry.trim().length > 0)
  if (!warning) return undefined
  return clampText(warning.trim().replace(/\s+/g, " "), RESOURCE_WARNING_PREVIEW_MAX_CHARS)
}

export const resourcesSection = defineRuntimeSection({
  key: "resources",
  render: (context) => {
    const resources = context.resources

    let inventory_section: string
    if (resources.length === 0) {
      inventory_section = [
        "No notebook resources are currently available.",
        "If external material is needed, ask the learner to add a resource from the Resources panel or with `/resource add`.",
      ].join("\n")
    } else {
      const lines = ["Available resources:"]
      const detailedResources = resources.slice(0, RESOURCE_INVENTORY_DETAILED_MAX_ITEMS)
      lines.push(
        ...detailedResources.map((resource) => {
          const sourcePreview = clampText(resource.sourceRelpath, RESOURCE_PATH_PREVIEW_MAX_CHARS)
          const packPath = `${RESOURCE_PACK_ROOT_DIR}/${resource.alias}/${RESOURCE_PACK_PROCESSED_DIR_NAME}`
          const segments = [
            `id=${resource.id}`,
            `alias=${resource.alias}`,
            `format=${resource.format}`,
            `status=${resource.status}`,
            `source=${sourcePreview}`,
            `pack=${packPath}`,
          ]

          if (resource.fullTextPath) {
            segments.push(`full_text=${resource.fullTextPath}`)
          }
          if (resource.fullTextEstTokens !== undefined) {
            segments.push(`full_text_est_tokens=${resource.fullTextEstTokens}`)
          }
          if (resource.fullTextChars !== undefined) {
            segments.push(`full_text_chars=${resource.fullTextChars}`)
          }

          const warning = firstWarningText(resource.warnings)
          if (warning) {
            segments.push(`note=${warning}`)
          }

          return `- ${segments.join(" | ")}`
        }),
      )

      const remainingResources = resources.slice(detailedResources.length)
      if (remainingResources.length > 0) {
        const aliasOnlyResources = remainingResources.slice(
          0,
          RESOURCE_INVENTORY_ALIAS_ONLY_MAX_ITEMS,
        )
        lines.push(
          `Additional resources (alias only): ${aliasOnlyResources.map((resource) => resource.alias).join(", ")}`,
        )
        const hiddenCount = remainingResources.length - aliasOnlyResources.length
        if (hiddenCount > 0) {
          lines.push(`- ... ${hiddenCount} more resources not listed`)
        }
        lines.push(
          "Inventory is truncated for prompt budget. Inspect `resources/` directly when you need the full list.",
        )
      }
      inventory_section = lines.join("\n")
    }

    return NOTEBOOK_RESOURCES_CONTEXT_TEMPLATE.render({
      entrypoint_file_name: RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
      toc_file_name: RESOURCE_PACK_TOC_FILE_NAME,
      chunks_dir_name: RESOURCE_PACK_CHUNKS_DIR_NAME,
      pages_dir_name: RESOURCE_PACK_PAGES_DIR_NAME,
      full_text_file_prefix: RESOURCE_PACK_FULL_TEXT_FILE_PREFIX,
      inventory_section,
    })
  },
})
