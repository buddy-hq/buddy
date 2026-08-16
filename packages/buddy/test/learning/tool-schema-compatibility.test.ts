import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { ToolJsonSchema } from "@buddy/opencode-adapter/tool"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { getDynamicToolSearchTools } from "../../src/learning/runtime/dynamic-tool-discovery"
import { allBuddyTools } from "../../src/learning/runtime/feature-registry"
import { AdvancedMathRuntimeService } from "../../src/local-runtimes/advanced-math/service"
import { StandardsRuntimeService } from "../../src/local-runtimes/standards/service"
import { loadOpenCodeApp } from "../../src/opencode-runtime"
import { TEST_TOOL_MODEL } from "../helpers/tools"
import { tmpdir } from "../helpers/tmpdir"
import { parseJsonObject, type TJsonObject } from "../helpers/parse"

const CREATED_BUDDY_TOOL_IDS = new Set([
  ...allBuddyTools().map((tool) => tool.id),
  ...getDynamicToolSearchTools().map((tool) => tool.id),
])
const PRESENT_HTML_WIDGET_REQUIRED_FIELDS = [
  "action",
  "path",
  "objectID",
  "entryPath",
  "title",
  "description",
  "viewportPreset",
] as const
const BENCH_PRESENT_REQUIRED_FIELDS = [
  "action",
  "path",
  "resourceKey",
  "objectID",
  "tabKey",
] as const
const WHITEBOARD_CREATE_REQUIRED_FIELDS = ["objectID", "boardAction", "elements"] as const

const originalAdvancedMathReady = AdvancedMathRuntimeService.isReady.bind(
  AdvancedMathRuntimeService,
)
const originalStandardsReady = StandardsRuntimeService.isReady.bind(StandardsRuntimeService)

afterEach(async () => {
  AdvancedMathRuntimeService.isReady = originalAdvancedMathReady
  StandardsRuntimeService.isReady = originalStandardsReady
  await OpenCodeInstance.disposeAll()
})

type TJsonSchemaObject = TJsonObject

function expectJsonSchemaObject<TValue>(value: TValue, label: string): TJsonSchemaObject {
  const parsed = parseJsonObject(value)
  if (parsed === undefined) {
    throw new Error(`${label} must be a JSON Schema object.`)
  }
  return parsed
}

function expectStringNullableProperty(
  properties: TJsonSchemaObject,
  propertyName: string,
): TJsonSchemaObject {
  const property = expectJsonSchemaObject(
    properties[propertyName],
    `schema property ${propertyName}`,
  )
  expect(property.anyOf).toBeUndefined()
  expect(property.type).toEqual(["string", "null"])
  return property
}

describe("tool schema compatibility", () => {
  test("all Buddy createBuddyTool schemas serialize to object-root JSON Schema", async () => {
    AdvancedMathRuntimeService.isReady = () => true
    StandardsRuntimeService.isReady = () => true

    await using project = await tmpdir({ git: true })

    await loadOpenCodeApp()
    await syncOpenCodeProjectConfig(project.path)

    const toolSchemas = await OpenCodeInstance.provide({
      directory: project.path,
      async fn() {
        const tools = await ToolRegistry.tools(TEST_TOOL_MODEL)
        return tools
          .filter((tool) => CREATED_BUDDY_TOOL_IDS.has(tool.id))
          .map((tool) => ({
            id: tool.id,
            schema: tool.jsonSchema ?? ToolJsonSchema.fromSchema(tool.parameters),
          }))
      },
    })

    const checkedToolIDs = new Set(toolSchemas.map((entry) => entry.id))
    const missingToolIDs = [...CREATED_BUDDY_TOOL_IDS].filter(
      (toolID) => !checkedToolIDs.has(toolID),
    )
    expect(missingToolIDs).toEqual([])

    const invalidSchemas = toolSchemas
      .filter((entry) => entry.schema.type !== "object")
      .map((entry) => ({
        id: entry.id,
        rootType: entry.schema.type,
        keys: Object.keys(entry.schema),
      }))

    expect(invalidSchemas).toEqual([])

    const presentHtmlWidgetSchema = expectJsonSchemaObject(
      toolSchemas.find((entry) => entry.id === "present_html_widget")?.schema,
      "present_html_widget schema",
    )
    expect(presentHtmlWidgetSchema.additionalProperties).toBe(false)
    expect(presentHtmlWidgetSchema.required).toEqual([...PRESENT_HTML_WIDGET_REQUIRED_FIELDS])
    const properties = expectJsonSchemaObject(
      presentHtmlWidgetSchema.properties,
      "present_html_widget properties",
    )
    const actionProperty = expectJsonSchemaObject(properties.action, "present_html_widget.action")
    expect(actionProperty.type).toBe("string")
    expect(actionProperty.enum).toEqual(["present_path", "present_object"])
    const pathProperty = expectStringNullableProperty(properties, "path")
    expect(pathProperty.description).toContain("workspace-relative")
    expect(pathProperty.description).toContain("absolute paths")
    expect(pathProperty.description).toContain("resolve inside the current workspace")
    expectStringNullableProperty(properties, "objectID")
    expectStringNullableProperty(properties, "entryPath")
    expectStringNullableProperty(properties, "title")
    expectStringNullableProperty(properties, "description")
    const viewportPresetProperty = expectStringNullableProperty(properties, "viewportPreset")
    expect(viewportPresetProperty.enum).toContain("standard_16_10")
    expect(viewportPresetProperty.enum).toContain(null)

    const benchPresentSchema = expectJsonSchemaObject(
      toolSchemas.find((entry) => entry.id === "bench_present")?.schema,
      "bench_present schema",
    )
    expect(benchPresentSchema.additionalProperties).toBe(false)
    expect(benchPresentSchema.required).toEqual([...BENCH_PRESENT_REQUIRED_FIELDS])
    const benchProperties = expectJsonSchemaObject(
      benchPresentSchema.properties,
      "bench_present properties",
    )
    const benchActionProperty = expectJsonSchemaObject(
      benchProperties.action,
      "bench_present.action",
    )
    expect(benchActionProperty.type).toBe("string")
    expect(benchActionProperty.enum).toEqual([
      "present_object",
      "present_file",
      "present_resource",
      "focus_tab",
      "close",
    ])
    const benchPathProperty = expectStringNullableProperty(benchProperties, "path")
    expect(benchPathProperty.description).toContain("workspace-relative")
    expect(benchPathProperty.description).toContain("absolute paths")
    expect(benchPathProperty.description).toContain("external-folder permission")
    expect(benchPathProperty.description).toContain("present_html_widget")
    const resourceKeyProperty = expectStringNullableProperty(benchProperties, "resourceKey")
    expect(resourceKeyProperty.description).toContain("object id or alias")
    const benchObjectIDProperty = expectStringNullableProperty(benchProperties, "objectID")
    expect(benchObjectIDProperty.description).toContain("Buddy object id")

    const whiteboardCreateSchema = expectJsonSchemaObject(
      toolSchemas.find((entry) => entry.id === "whiteboard_create_view")?.schema,
      "whiteboard_create_view schema",
    )
    expect(whiteboardCreateSchema.required).toEqual([...WHITEBOARD_CREATE_REQUIRED_FIELDS])
    const whiteboardCreateProperties = expectJsonSchemaObject(
      whiteboardCreateSchema.properties,
      "whiteboard_create_view properties",
    )
    expectStringNullableProperty(whiteboardCreateProperties, "objectID")
    const whiteboardTitleProperty = expectJsonSchemaObject(
      whiteboardCreateProperties.title,
      "whiteboard_create_view.title",
    )
    expect(whiteboardTitleProperty.type).toBe("string")
    expect(whiteboardTitleProperty.description).toContain("Bench tabs")

    const whiteboardReadSchema = expectJsonSchemaObject(
      toolSchemas.find((entry) => entry.id === "whiteboard_read_context")?.schema,
      "whiteboard_read_context schema",
    )
    expect(whiteboardReadSchema.required).toEqual(["objectID"])
  }, 180_000)
})
