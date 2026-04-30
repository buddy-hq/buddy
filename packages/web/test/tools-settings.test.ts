import { describe, expect, test } from "bun:test"
import {
  TOOL_OVERRIDE_MODE,
  buildGlobalToolsPatch,
  buildProjectToolsPatch,
  createToolsSettingsStore,
  resolveEffectiveToolSelection,
} from "../src/state/tools-settings-store"

describe("resolveEffectiveToolSelection", () => {
  test("prefers notebook overrides and falls back to global defaults", () => {
    expect(
      resolveEffectiveToolSelection(
        {
          search_standards: true,
          get_standard: true,
          get_learning_components: true,
          get_prerequisites: true,
          get_next_standards: true,
          get_crosswalk: false,
          query_standards_sql: false,
        },
        {
          search_standards: TOOL_OVERRIDE_MODE.inherit,
          get_standard: TOOL_OVERRIDE_MODE.disabled,
          get_learning_components: TOOL_OVERRIDE_MODE.inherit,
          get_prerequisites: TOOL_OVERRIDE_MODE.enabled,
          get_next_standards: TOOL_OVERRIDE_MODE.inherit,
          get_crosswalk: TOOL_OVERRIDE_MODE.inherit,
          query_standards_sql: TOOL_OVERRIDE_MODE.enabled,
        },
      ),
    ).toEqual({
      search_standards: true,
      get_standard: false,
      get_learning_components: true,
      get_prerequisites: true,
      get_next_standards: true,
      get_crosswalk: false,
      query_standards_sql: true,
    })
  })
})

describe("tools settings patches", () => {
  test("buildProjectToolsPatch clears inherited notebook overrides", () => {
    expect(
      buildProjectToolsPatch(
        {
          tools: {
            search_standards: true,
          },
        },
        {
          search_standards: TOOL_OVERRIDE_MODE.inherit,
          get_standard: TOOL_OVERRIDE_MODE.inherit,
          get_learning_components: TOOL_OVERRIDE_MODE.inherit,
          get_prerequisites: TOOL_OVERRIDE_MODE.inherit,
          get_next_standards: TOOL_OVERRIDE_MODE.inherit,
          get_crosswalk: TOOL_OVERRIDE_MODE.inherit,
          query_standards_sql: TOOL_OVERRIDE_MODE.inherit,
        },
      ),
    ).toEqual({
      tools: {
        search_standards: null,
      },
    })
  })

  test("buildGlobalToolsPatch only includes changed tool defaults", () => {
    expect(
      buildGlobalToolsPatch(
        {
          tools: {
            search_standards: true,
            get_standard: true,
          },
        },
        {
          search_standards: false,
          get_standard: true,
          get_learning_components: true,
          get_prerequisites: true,
          get_next_standards: true,
          get_crosswalk: true,
          query_standards_sql: true,
        },
      ),
    ).toEqual({
      tools: {
        search_standards: false,
      },
    })
  })
})

describe("createToolsSettingsStore", () => {
  test("initializeFromBundle preserves unsaved edits for the active directory", () => {
    const store = createToolsSettingsStore()
    const bundle = {
      globalConfig: {
        tools: {
          search_standards: true,
        },
      },
      rawProjectConfig: {},
    }

    store.getState().initializeFromBundle("/repo", bundle)
    store.getState().setGlobalToolEnabled("search_standards", false)
    store.getState().initializeFromBundle("/repo", bundle)

    expect(store.getState().globalDraft.search_standards).toBe(false)
  })
})
