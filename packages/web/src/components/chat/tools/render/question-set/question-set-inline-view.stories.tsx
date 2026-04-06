import type { Decorator, Meta, StoryObj } from "@storybook/react-vite"
import { QuestionSetInlineView } from "./question-set-inline-view"
import { QuestionSetToolCard } from "./question-set-tool-card"

const withToolCard: Decorator = (Story) => (
  <div className="w-full max-w-3xl">
    <QuestionSetToolCard title="Sample Quiz" subtitle="quiz • 2 questions" status="completed">
      <Story />
    </QuestionSetToolCard>
  </div>
)

const meta = {
  title: "Web/QuestionSetInlineView",
  component: QuestionSetInlineView,
  parameters: {
    layout: "padded",
  },
  decorators: [withToolCard],
} satisfies Meta<typeof QuestionSetInlineView>

export default meta

type Story = StoryObj<typeof meta>

export const Basic: Story = {
  args: {
    artifact: {
      artifactID: "test-artifact",
      title: "Sample Quiz",
      groupType: "quiz",
      questions: [
        {
          id: "q1",
          prompt: "What is the capital of France?",
          goalIds: ["g1"],
          payload: {
            multipleSelect: false,
            choices: [
              { id: "c1", content: "London" },
              { id: "c2", content: "Paris" },
              { id: "c3", content: "Berlin" },
            ],
          },
        },
        {
          id: "q2",
          prompt: "Which of these are programming languages?",
          goalIds: ["g2"],
          payload: {
            multipleSelect: true,
            numCorrect: 2,
            choices: [
              { id: "c1", content: "JavaScript" },
              { id: "c2", content: "HTML" },
              { id: "c3", content: "Rust" },
            ],
          },
        },
      ],
    },
    onSubmit: async (answers: Record<string, string[]>) => {
      // Mock submit handler that resolves successfully
      console.log("Submitted answers:", answers)
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            totalQuestions: 2,
            correctQuestions: 1,
            status: "completed",
            questions: [
              {
                questionID: "q1",
                correct: answers["q1"]?.[0] === "c2",
                selectedChoiceIds: answers["q1"] || [],
                correctChoiceIds: ["c2"],
                choices: [
                  { choiceID: "c1", selected: answers["q1"]?.[0] === "c1", correct: false },
                  { choiceID: "c2", selected: answers["q1"]?.[0] === "c2", correct: true },
                  { choiceID: "c3", selected: answers["q1"]?.[0] === "c3", correct: false },
                ],
              },
              {
                questionID: "q2",
                correct: false,
                selectedChoiceIds: answers["q2"] || [],
                correctChoiceIds: ["c1", "c3"],
                choices: [
                  {
                    choiceID: "c1",
                    selected: answers["q2"]?.includes("c1") || false,
                    correct: true,
                  },
                  {
                    choiceID: "c2",
                    selected: answers["q2"]?.includes("c2") || false,
                    correct: false,
                  },
                  {
                    choiceID: "c3",
                    selected: answers["q2"]?.includes("c3") || false,
                    correct: true,
                  },
                ],
              },
            ],
          })
        }, 1000)
      })
    },
  },
}

export const SubmitError: Story = {
  args: {
    ...Basic.args,
    onSubmit: async () => {
      // Mock submit handler that mimics a failure
      return new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Network error communicating with the server."))
        }, 800)
      })
    },
  },
}
