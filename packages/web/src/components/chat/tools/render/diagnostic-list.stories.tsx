import type { Meta, StoryObj } from "@storybook/react-vite"
import { DiagnosticList } from "./diagnostic-list"

const meta = {
  title: "Web/Tools/Shared/DiagnosticList",
  component: DiagnosticList,
  parameters: { layout: "padded" },
} satisfies Meta<typeof DiagnosticList>

export default meta
type Story = StoryObj<typeof meta>

export const SingleDiagnostic: Story = {
  args: {
    diagnostics: [
      {
        range: { start: { line: 5, character: 7 } },
        message: "Type 'number' is not assignable to type 'string'.",
        severity: 1,
      },
    ],
  },
}

export const MultipleDiagnostics: Story = {
  args: {
    diagnostics: [
      {
        range: { start: { line: 3, character: 0 } },
        message: "Cannot find module './missing' or its corresponding type declarations.",
        severity: 1,
      },
      {
        range: { start: { line: 12, character: 15 } },
        message: "Variable 'x' is used before being assigned.",
        severity: 1,
      },
      {
        range: { start: { line: 45, character: 22 } },
        message: "Property 'name' does not exist on type 'object'.",
        severity: 1,
      },
    ],
  },
}

export const Empty: Story = {
  args: {
    diagnostics: [],
  },
}
