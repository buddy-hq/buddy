import { describe, expect, test } from "bun:test"
import {
  buildGlobalStandardsPatch,
  buildNotebookStandardsOverridePatch,
  buildGlobalStandardsDefaults,
  notebookStandardUsesGlobalDefault,
  resolveNotebookStandardEnabled,
} from "../src/state/standards-settings"

describe("resolveNotebookStandardEnabled", () => {
  test("prefers notebook overrides and falls back to the global default", () => {
    expect(
      resolveNotebookStandardEnabled(
        {
          tools: {
            search_standards: true,
          },
        },
        {
          tools: {
            search_standards: false,
          },
        },
        "search_standards",
      ),
    ).toBe(false)
  })
})

describe("buildNotebookStandardsOverridePatch", () => {
  test("clears inherited notebook overrides when toggled back to the default", () => {
    expect(
      buildNotebookStandardsOverridePatch({
        globalConfig: {
          tools: {
            search_standards: true,
          },
        },
        rawProjectConfig: {
          tools: {
            search_standards: false,
          },
        },
        toolId: "search_standards",
        enabled: true,
      }),
    ).toEqual({
      tools: {
        search_standards: null,
      },
    })
  })

  test("writes an explicit notebook override when changing the default", () => {
    expect(
      buildNotebookStandardsOverridePatch({
        globalConfig: {
          tools: {
            query_standards_sql: false,
          },
        },
        rawProjectConfig: {},
        toolId: "query_standards_sql",
        enabled: true,
      }),
    ).toEqual({
      tools: {
        query_standards_sql: true,
      },
    })
  })
})

describe("global standards defaults", () => {
  test("buildGlobalStandardsPatch only includes changed tool defaults", () => {
    expect(
      buildGlobalStandardsPatch(
        {
          tools: {
            search_standards: true,
            get_standard: true,
          },
        },
        {
          ...buildGlobalStandardsDefaults({}),
          search_standards: false,
        },
      ),
    ).toEqual({
      tools: {
        search_standards: false,
      },
    })
  })

  test("reports when a notebook is inheriting the global default", () => {
    expect(
      notebookStandardUsesGlobalDefault(
        {
          tools: {
            get_standard: false,
          },
        },
        "search_standards",
      ),
    ).toBe(true)
  })
})
