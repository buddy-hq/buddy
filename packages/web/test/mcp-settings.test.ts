import { describe, expect, test } from "bun:test"
import {
  buildNotebookMcpOverridePatch,
  mcpEnabledByDefault,
  notebookDefinesMcp,
  readNotebookMcpEnabledOverride,
  resolveNotebookMcpEnabled,
} from "../src/state/mcp-settings"

const GLOBAL_MCPS = {
  linear: {
    type: "remote" as const,
    url: "https://linear.example.com/mcp",
    enabled: true,
  },
  docs: {
    type: "local" as const,
    command: ["npx", "@modelcontextprotocol/server-filesystem"],
    enabled: false,
  },
}

describe("mcpEnabledByDefault", () => {
  test("treats missing enabled as true", () => {
    expect(
      mcpEnabledByDefault({
        type: "remote",
        url: "https://example.com/mcp",
      }),
    ).toBe(true)
  })

  test("respects an explicit disabled default", () => {
    expect(mcpEnabledByDefault(GLOBAL_MCPS.docs)).toBe(false)
  })
})

describe("readNotebookMcpEnabledOverride", () => {
  test("returns the explicit notebook override when present", () => {
    expect(
      readNotebookMcpEnabledOverride(
        {
          mcp: {
            linear: {
              enabled: false,
            },
          },
        },
        "linear",
      ),
    ).toBe(false)
  })

  test("ignores entries without an enabled flag", () => {
    expect(
      readNotebookMcpEnabledOverride(
        {
          mcp: {
            linear: {
              type: "remote",
              url: "https://linear.example.com/mcp",
            },
          },
        },
        "linear",
      ),
    ).toBeUndefined()
  })
})

describe("notebookDefinesMcp", () => {
  test("distinguishes notebook definitions from enabled-only overrides", () => {
    expect(
      notebookDefinesMcp(
        {
          mcp: {
            linear: {
              type: "remote",
              url: "https://notebook.example.com/mcp",
            },
          },
        },
        "linear",
      ),
    ).toBe(true)

    expect(
      notebookDefinesMcp(
        {
          mcp: {
            linear: {
              enabled: false,
            },
          },
        },
        "linear",
      ),
    ).toBe(false)
  })
})

describe("resolveNotebookMcpEnabled", () => {
  test("prefers a notebook override over the global default", () => {
    expect(
      resolveNotebookMcpEnabled(
        GLOBAL_MCPS,
        {
          mcp: {
            linear: {
              enabled: false,
            },
          },
        },
        "linear",
      ),
    ).toBe(false)
  })

  test("falls back to the global default when the notebook has no override", () => {
    expect(resolveNotebookMcpEnabled(GLOBAL_MCPS, {}, "docs")).toBe(false)
  })

  test("inherits an explicitly disabled matching global MCP", () => {
    expect(
      resolveNotebookMcpEnabled(
        GLOBAL_MCPS,
        {
          mcp: {
            docs: {
              type: "remote",
              url: "https://docs.example.com/mcp",
            },
          },
        },
        "docs",
      ),
    ).toBe(false)
  })
})

describe("buildNotebookMcpOverridePatch", () => {
  test("writes a notebook override when disabling an enabled global MCP", () => {
    expect(
      buildNotebookMcpOverridePatch({
        globalConfigByName: GLOBAL_MCPS,
        rawProjectConfig: {},
        name: "linear",
        enabled: false,
      }),
    ).toEqual({
      mcp: {
        linear: {
          enabled: false,
        },
      },
    })
  })

  test("clears a notebook override when returning to the global default", () => {
    expect(
      buildNotebookMcpOverridePatch({
        globalConfigByName: GLOBAL_MCPS,
        rawProjectConfig: {
          mcp: {
            linear: {
              enabled: false,
            },
          },
        },
        name: "linear",
        enabled: true,
      }),
    ).toEqual({
      mcp: {
        linear: null,
      },
    })
  })

  test("writes an opt-in override when the global default is disabled", () => {
    expect(
      buildNotebookMcpOverridePatch({
        globalConfigByName: GLOBAL_MCPS,
        rawProjectConfig: {},
        name: "docs",
        enabled: true,
      }),
    ).toEqual({
      mcp: {
        docs: {
          enabled: true,
        },
      },
    })
  })

  test("writes an opt-in override for a notebook definition matching a disabled global MCP", () => {
    expect(
      buildNotebookMcpOverridePatch({
        globalConfigByName: GLOBAL_MCPS,
        rawProjectConfig: {
          mcp: {
            docs: {
              type: "remote",
              url: "https://docs.example.com/mcp",
            },
          },
        },
        name: "docs",
        enabled: true,
      }),
    ).toEqual({
      mcp: {
        docs: {
          enabled: true,
        },
      },
    })
  })

  test("disables a notebook-defined MCP without replacing its definition", () => {
    expect(
      buildNotebookMcpOverridePatch({
        globalConfigByName: GLOBAL_MCPS,
        rawProjectConfig: {
          mcp: {
            notebookDocs: {
              type: "remote",
              url: "https://docs.example.com/mcp",
            },
          },
        },
        name: "notebookDocs",
        enabled: false,
      }),
    ).toEqual({
      mcp: {
        notebookDocs: {
          enabled: false,
        },
      },
    })
  })

  test("removes only the enabled flag when a notebook-defined MCP returns to its default", () => {
    expect(
      buildNotebookMcpOverridePatch({
        globalConfigByName: GLOBAL_MCPS,
        rawProjectConfig: {
          mcp: {
            notebookDocs: {
              type: "remote",
              url: "https://docs.example.com/mcp",
              enabled: false,
            },
          },
        },
        name: "notebookDocs",
        enabled: true,
      }),
    ).toEqual({
      mcp: {
        notebookDocs: {
          enabled: null,
        },
      },
    })
  })
})
