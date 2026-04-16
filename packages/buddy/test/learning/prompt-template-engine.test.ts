import { describe, expect, test } from "bun:test"
import {
  definePromptTemplate,
  parsePromptTemplate,
  PromptTemplateParseError,
  PromptTemplateRenderError,
} from "../../src/learning/prompt/template/engine"

function expectParseError(
  action: () => void,
  expected: {
    kind:
      | "empty-placeholder"
      | "nested-placeholder"
      | "unmatched-closing-delimiter"
      | "unterminated-placeholder"
  },
) {
  try {
    action()
    throw new Error("expected parse error")
  } catch (error) {
    expect(error).toBeInstanceOf(PromptTemplateParseError)
    if (!(error instanceof PromptTemplateParseError)) {
      throw error
    }
    expect(error.kind).toBe(expected.kind)
  }
}

function expectRenderError(
  action: () => void,
  expected: { kind: "duplicate-value" | "extra-value" | "missing-value"; variableName: string },
) {
  try {
    action()
    throw new Error("expected render error")
  } catch (error) {
    expect(error).toBeInstanceOf(PromptTemplateRenderError)
    if (!(error instanceof PromptTemplateRenderError)) {
      throw error
    }
    expect(error.kind).toBe(expected.kind)
    expect(error.variableName).toBe(expected.variableName)
  }
}

describe("prompt template engine", () => {
  test("replaces placeholders with and without whitespace", () => {
    const rendered = parsePromptTemplate(
      "Hello, {{ name }}. You are in {{place}}. {{ name }} is repeated.",
    ).render({
      name: "Buddy",
      place: "workspace",
    })

    expect(rendered).toBe("Hello, Buddy. You are in workspace. Buddy is repeated.")
  })

  test("supports multiline templates, adjacent placeholders, and escaped delimiters", () => {
    const rendered = parsePromptTemplate(
      "Line 1: {{first}}{{second}}\nLine 2: {{ third }}\nliteral open: {{{{ literal close: }}}}",
    ).render({
      first: "A",
      second: "B",
      third: "C",
    })

    expect(rendered).toBe("Line 1: AB\nLine 2: C\nliteral open: {{ literal close: }}")
  })

  test("can reuse parsed templates and reports sorted placeholder names", () => {
    const template = parsePromptTemplate("{{ b }} {{ a }} {{ b }}")

    expect(template.placeholderNames()).toEqual(["a", "b"])
    expect(
      template.render([
        ["a", "one"],
        ["b", "two"],
      ]),
    ).toBe("two one two")
    expect(
      template.render([
        ["a", "alpha"],
        ["b", "beta"],
      ]),
    ).toBe("beta alpha beta")
  })

  test("rejects invalid parse structures", () => {
    expectParseError(() => parsePromptTemplate("Hello, {{   }}."), {
      kind: "empty-placeholder",
    })
    expectParseError(() => parsePromptTemplate("Hello, {{ name."), {
      kind: "unterminated-placeholder",
    })
    expectParseError(() => parsePromptTemplate("Hello, {{ outer {{ inner }} }}."), {
      kind: "nested-placeholder",
    })
    expectParseError(() => parsePromptTemplate("Hello, }} world."), {
      kind: "unmatched-closing-delimiter",
    })
  })

  test("rejects missing, extra, and duplicate render variables", () => {
    const template = parsePromptTemplate("Hello, {{ name }}.")

    expectRenderError(() => template.render([]), {
      kind: "missing-value",
      variableName: "name",
    })
    expectRenderError(() => template.render({ name: "Buddy", unused: "extra" }), {
      kind: "extra-value",
      variableName: "unused",
    })
    expectRenderError(
      () =>
        template.render([
          ["name", "Buddy"],
          ["name", "other"],
        ]),
      {
        kind: "duplicate-value",
        variableName: "name",
      },
    )
  })

  test("normalizes embedded template line endings", () => {
    const template = definePromptTemplate({
      source: "Header\r\n{{ name }}\r\nFooter\r",
      debugName: "test-template.md",
    })

    expect(template.render({ name: "Buddy" })).toBe("Header\nBuddy\nFooter\n")
  })

  test("reports the debug name when embedded template parsing fails", () => {
    try {
      definePromptTemplate({
        source: "Hello, {{ name.",
        debugName: "test-template.md",
      })
      throw new Error("expected parse error")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      if (!(error instanceof Error)) {
        throw error
      }
      expect(error.message).toContain('embedded template "test-template.md" is invalid:')
    }
  })
})
