import { afterEach, describe, expect, test } from "bun:test"
import { Instance as OpenCodeInstance } from "@buddy/opencode-adapter/instance"
import { ToolRegistry } from "@buddy/opencode-adapter/registry"
import { ToolJsonSchema } from "@buddy/opencode-adapter/tool"
import { syncOpenCodeProjectConfig } from "../../src/config/runtime/opencode-sync"
import { getDynamicToolSearchTools } from "../../src/learning/runtime/dynamic-tool-discovery"
import { allBuddyTools } from "../../src/learning/runtime/feature-registry"
import { BenchPresentInputSchema } from "../../src/learning/features/bench/tools/present"
import { PresentHtmlWidgetInputSchema } from "../../src/learning/features/html-widgets/tools/present-html-widget"
import { CreateWhiteboardViewInputSchema } from "../../src/learning/features/whiteboard/tools/create-view"
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
const PRESENT_HTML_WIDGET_REQUIRED_FIELDS = ["action"] as const
const BENCH_PRESENT_REQUIRED_FIELDS = ["action"] as const
const WHITEBOARD_CREATE_REQUIRED_FIELDS = [
  "objectAction",
  "boardAction",
  "elements",
] as const
const TEST_OBJECT_ID = "01KG1A0KH77HJ9QGAQ5QK0N4BD"

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

function expectStringProperty(
  properties: TJsonSchemaObject,
  propertyName: string,
): TJsonSchemaObject {
  const property = expectJsonSchemaObject(
    properties[propertyName],
    `schema property ${propertyName}`,
  )
  expect(property.anyOf).toBeUndefined()
  expect(property.type).toBe("string")
  expect(Array.isArray(property.enum) ? property.enum.includes(null) : false).toBeFalse()
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
    const pathProperty = expectStringProperty(properties, "path")
    expect(pathProperty.description).toContain("workspace-relative")
    expect(pathProperty.description).toContain("absolute paths")
    expect(pathProperty.description).toContain("resolve inside the current workspace")
    expectStringProperty(properties, "objectID")
    expectStringProperty(properties, "entryPath")
    expectStringProperty(properties, "title")
    expectStringProperty(properties, "description")
    const viewportPresetProperty = expectStringProperty(properties, "viewportPreset")
    expect(viewportPresetProperty.enum).toContain("standard_16_10")

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
    const benchPathProperty = expectStringProperty(benchProperties, "path")
    expect(benchPathProperty.description).toContain("workspace-relative")
    expect(benchPathProperty.description).toContain("absolute paths")
    expect(benchPathProperty.description).toContain("external-folder permission")
    expect(benchPathProperty.description).toContain("present_html_widget")
    const resourceKeyProperty = expectStringProperty(benchProperties, "resourceKey")
    expect(resourceKeyProperty.description).toContain("object id or alias")
    const benchObjectIDProperty = expectStringProperty(benchProperties, "objectID")
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
    const whiteboardObjectActionProperty = expectJsonSchemaObject(
      whiteboardCreateProperties.objectAction,
      "whiteboard_create_view.objectAction",
    )
    expect(whiteboardObjectActionProperty.type).toBe("string")
    expect(whiteboardObjectActionProperty.enum).toEqual(["create", "update"])
    expectStringProperty(whiteboardCreateProperties, "objectID")
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

  test("portable action contracts use omission and reject null sentinels", () => {
    expect(BenchPresentInputSchema.safeParse({ action: "close" }).success).toBeTrue()
    expect(
      BenchPresentInputSchema.safeParse({ action: "present_file", path: "notes.md" }).success,
    ).toBeTrue()
    expect(BenchPresentInputSchema.safeParse({ action: "close", path: null }).success).toBeFalse()
    expect(
      BenchPresentInputSchema.safeParse({ action: "present_file", objectID: TEST_OBJECT_ID })
        .success,
    ).toBeFalse()

    expect(
      PresentHtmlWidgetInputSchema.safeParse({
        action: "present_path",
        path: "widgets/lesson.html",
        title: "Lesson",
        viewportPreset: "standard_16_10",
      }).success,
    ).toBeTrue()
    expect(
      PresentHtmlWidgetInputSchema.safeParse({
        action: "present_object",
        objectID: TEST_OBJECT_ID,
      }).success,
    ).toBeTrue()
    expect(
      PresentHtmlWidgetInputSchema.safeParse({
        action: "present_path",
        path: "widgets/lesson.html",
        objectID: null,
        title: "Lesson",
        viewportPreset: "standard_16_10",
      }).success,
    ).toBeFalse()

    const whiteboardBase = {
      boardAction: "continue_current_board",
      elements: "[]",
    } as const
    expect(
      CreateWhiteboardViewInputSchema.safeParse({
        ...whiteboardBase,
        objectAction: "create",
      }).success,
    ).toBeTrue()
    expect(
      CreateWhiteboardViewInputSchema.safeParse({
        ...whiteboardBase,
        objectAction: "update",
        objectID: TEST_OBJECT_ID,
      }).success,
    ).toBeTrue()
    expect(
      CreateWhiteboardViewInputSchema.safeParse({
        ...whiteboardBase,
        objectAction: "create",
        objectID: TEST_OBJECT_ID,
      }).success,
    ).toBeFalse()
    expect(
      CreateWhiteboardViewInputSchema.safeParse({
        ...whiteboardBase,
        objectAction: "update",
      }).success,
    ).toBeFalse()
    expect(
      CreateWhiteboardViewInputSchema.safeParse({
        ...whiteboardBase,
        objectAction: "create",
        objectID: null,
      }).success,
    ).toBeFalse()
    expect(
      CreateWhiteboardViewInputSchema.safeParse({
        ...whiteboardBase,
        objectAction: "update",
        objectID: "null",
      }).success,
    ).toBeFalse()
  })
})
