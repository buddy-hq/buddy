import type { Meta, StoryObj } from "@storybook/react-vite"
import { SubagentArtifactCard } from "../subagent-artifact-card"
import { ToolOutputPanel } from "../../../tool-output-panel"
import { makeToolState } from "../../__stories__/tool-state-helpers"

const meta = {
  title: "Web/Tools/Task/SubagentArtifactCard",
  component: SubagentArtifactCard,
  parameters: { layout: "padded" },
} satisfies Meta<typeof SubagentArtifactCard>

export default meta
type Story = StoryObj<typeof meta>

export const Completed: Story = {
  args: {
    state: makeToolState({ status: "completed" }),
    displayAgent: "flashcard-author",
    taskResultOutput: "Created 5 flashcards covering photosynthesis",
    children: <div className="text-sm text-text-strong">Flashcard deck preview here</div>,
  },
}

export const Running: Story = {
  args: {
    state: makeToolState({ status: "running" }),
    displayAgent: "flashcard-author",
    taskResultOutput: "",
    children: null,
  },
}

export const Pending: Story = {
  args: {
    state: makeToolState({ status: "pending" }),
    displayAgent: "question-set-author",
    taskResultOutput: "",
    children: null,
  },
}

export const ErrorState: Story = {
  args: {
    state: makeToolState({
      status: "error",
      error: "Failed to create flashcard deck: invalid input",
    }),
    displayAgent: "flashcard-author",
    taskResultOutput: "Failed to create flashcard deck: invalid input",
    children: null,
  },
}

export const WithOutputFallback: Story = {
  args: {
    state: makeToolState({ status: "completed" }),
    displayAgent: "coder",
    taskResultOutput: "Refactored auth module into separate service and types files",
    children: (
      <ToolOutputPanel output="Refactored auth module into separate service and types files" />
    ),
  },
}
