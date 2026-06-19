import path from "node:path"
import dedent from "dedent"
import ABOUT_SECTION_TEMPLATE_SOURCE from "./about-section.t.md"
import NOTEBOOK_RESOURCES_CONTEXT_TEMPLATE_SOURCE from "./notebook-resources-context.t.md"
import NOTEBOOK_RESOURCES_EMPTY_TEMPLATE_SOURCE from "./notebook-resources-empty.t.md"
import { defineRuntimeSection } from "../definition"
import type { PromptResource } from "../../context"
import {
  RESOURCE_PACK_CHUNKS_DIR_NAME,
  RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
  RESOURCE_PACK_FULL_TEXT_FILE_PREFIX,
  RESOURCE_PACK_PAGES_DIR_NAME,
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

function promptAbsolutePath(input: {
  directory: string
  pathText: string | undefined
}): string | undefined {
  const trimmed = input.pathText?.trim()
  if (!trimmed) return undefined
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(input.directory, trimmed)
}

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

export function renderNotebookResourcesSection(input: {
  directory: string
  resources: PromptResource[]
}) {
  const resources = input.resources

  // Empty state: use dedicated template
  if (resources.length === 0) {
    return NOTEBOOK_RESOURCES_EMPTY_TEMPLATE.render({})
  }

  const about_section = ABOUT_SECTION_TEMPLATE.render({
    entrypoint_file_name: RESOURCE_PACK_ENTRYPOINT_FILE_NAME,
    toc_file_name: RESOURCE_PACK_TOC_FILE_NAME,
    chunks_dir_name: RESOURCE_PACK_CHUNKS_DIR_NAME,
    pages_dir_name: RESOURCE_PACK_PAGES_DIR_NAME,
    full_text_file_prefix: RESOURCE_PACK_FULL_TEXT_FILE_PREFIX,
  })

  // With resources: build inventory list inline
  const detailedResources = resources.slice(0, RESOURCE_INVENTORY_DETAILED_MAX_ITEMS)
  const inventoryList = detailedResources
    .map((resource) => {
      const namePreview = truncateWithEllipsis(
        normalizeWhitespace(resource.name),
        RESOURCE_PATH_PREVIEW_MAX_CHARS,
      )
      const sourcePreview = truncateWithEllipsis(
        promptAbsolutePath({ directory: input.directory, pathText: resource.managedSource }) ??
          resource.managedSource,
        RESOURCE_PATH_PREVIEW_MAX_CHARS,
      )
      const benchReaderPath =
        promptAbsolutePath({ directory: input.directory, pathText: resource.benchReaderRelpath }) ??
        "none"
      const packPath =
        promptAbsolutePath({ directory: input.directory, pathText: resource.packPath }) ?? "none"
      const fullTextPath = promptAbsolutePath({
        directory: input.directory,
        pathText: resource.fullTextPath,
      })

      const warningRaw = resource.warnings.find((entry) => entry.trim().length > 0)
      const warning = warningRaw
        ? truncateWithEllipsis(normalizeWhitespace(warningRaw), RESOURCE_WARNING_PREVIEW_MAX_CHARS)
        : undefined

      return `- object_id=${resource.objectID} | alias=${resource.alias} | name=${namePreview} | format=${resource.format} | status=${resource.status} | managed_source=${sourcePreview} | bench_reader=${benchReaderPath} | pack=${packPath}${fullTextPath ? ` | full_text=${fullTextPath}` : ""}${resource.fullTextEstimatedTokens !== undefined ? ` | full_text_est_tokens=${resource.fullTextEstimatedTokens}` : ""}${resource.fullTextChars !== undefined ? ` | full_text_chars=${resource.fullTextChars}` : ""}${warning ? ` | note=${warning}` : ""}`
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
      ? "\n\nInventory is truncated for prompt budget. Use listed aliases or object IDs in resource tools; do not infer old resource paths."
      : ""

  return NOTEBOOK_RESOURCES_CONTEXT_TEMPLATE.render({
    about_section,
    inventory_header: "\nInventory:\n",
    inventory_list: inventoryList,
    additional_resources_line: additionalResourcesLine,
    truncation_notice: truncationNotice,
  })
}

export const resourcesSection = defineRuntimeSection({
  key: "resources",
  render: (context) =>
    renderNotebookResourcesSection({
      directory: context.directory,
      resources: context.resources,
    }),
})
