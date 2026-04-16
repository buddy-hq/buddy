import { join } from "node:path/posix"
import dedent from "dedent"
import ABOUT_SECTION_TEMPLATE_SOURCE from "./about-section.t.md"
import NOTEBOOK_RESOURCES_CONTEXT_TEMPLATE_SOURCE from "./notebook-resources-context.t.md"
import NOTEBOOK_RESOURCES_EMPTY_TEMPLATE_SOURCE from "./notebook-resources-empty.t.md"
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

const truncateWithEllipsis = (str: string, maxLen: number): string =>
  str.length <= maxLen ? str : `${str.slice(0, maxLen - 3)}...`

const normalizeWhitespace = (str: string): string => str.trim().replace(/\s+/g, " ")

const NOTEBOOK_RESOURCES_CONTEXT_TEMPLATE = definePromptTemplate({
  source: NOTEBOOK_RESOURCES_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/resource-context/notebook-resources-context.t.md",
})

const NOTEBOOK_RESOURCES_EMPTY_TEMPLATE = definePromptTemplate({
  source: NOTEBOOK_RESOURCES_EMPTY_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/resource-context/notebook-resources-empty.t.md",
})

const ABOUT_SECTION_TEMPLATE = definePromptTemplate({
  source: ABOUT_SECTION_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/resource-context/about-section.t.md",
})

export const resourcesSection = defineRuntimeSection({
  key: "resources",
  render: (context) => {
    const resources = context.resources
    const about_section = ABOUT_SECTION_TEMPLATE.render({
      entrypoint_file_name: RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
      toc_file_name: RESOURCE_PACK_TOC_FILE_NAME,
      chunks_dir_name: RESOURCE_PACK_CHUNKS_DIR_NAME,
      pages_dir_name: RESOURCE_PACK_PAGES_DIR_NAME,
      full_text_file_prefix: RESOURCE_PACK_FULL_TEXT_FILE_PREFIX,
    })

    // Empty state: use dedicated template
    if (resources.length === 0) {
      return NOTEBOOK_RESOURCES_EMPTY_TEMPLATE.render({ about_section })
    }

    // With resources: build inventory list inline
    const detailedResources = resources.slice(0, RESOURCE_INVENTORY_DETAILED_MAX_ITEMS)
    const inventoryList = detailedResources
      .map((resource) => {
        const sourcePreview = truncateWithEllipsis(
          resource.sourceRelpath,
          RESOURCE_PATH_PREVIEW_MAX_CHARS,
        )
        const packPath = join(
          RESOURCE_PACK_ROOT_DIR,
          resource.alias,
          RESOURCE_PACK_PROCESSED_DIR_NAME,
        )

        const warningRaw = resource.warnings.find((entry) => entry.trim().length > 0)
        const warning = warningRaw
          ? truncateWithEllipsis(
              normalizeWhitespace(warningRaw),
              RESOURCE_WARNING_PREVIEW_MAX_CHARS,
            )
          : undefined

        return `- id=${resource.id} | alias=${resource.alias} | format=${resource.format} | status=${resource.status} | source=${sourcePreview} | pack=${packPath}${resource.fullTextPath ? ` | full_text=${resource.fullTextPath}` : ""}${resource.fullTextEstTokens !== undefined ? ` | full_text_est_tokens=${resource.fullTextEstTokens}` : ""}${resource.fullTextChars !== undefined ? ` | full_text_chars=${resource.fullTextChars}` : ""}${warning ? ` | note=${warning}` : ""}`
      })
      .join("\n")

    // Build additional resources line inline
    const remainingResources = resources.slice(detailedResources.length)
    const aliasOnlyResources = remainingResources.slice(0, RESOURCE_INVENTORY_ALIAS_ONLY_MAX_ITEMS)
    const hiddenCount = remainingResources.length - aliasOnlyResources.length
    const additionalResourcesLine =
      remainingResources.length > 0
        ? "\n" +
          (hiddenCount > 0
            ? dedent`
                Additional resources (alias only): ${aliasOnlyResources.map((r) => r.alias).join(", ")}
                - ... ${hiddenCount} more resources not listed
              `
            : `Additional resources (alias only): ${aliasOnlyResources.map((r) => r.alias).join(", ")}`)
        : ""

    const truncationNotice =
      remainingResources.length > 0
        ? "\n\nInventory is truncated for prompt budget. Inspect `resources/` directly when you need the full list."
        : ""

    return NOTEBOOK_RESOURCES_CONTEXT_TEMPLATE.render({
      about_section,
      inventory_header: "\nInventory:\n",
      inventory_list: inventoryList,
      additional_resources_line: additionalResourcesLine,
      truncation_notice: truncationNotice,
    })
  },
})
