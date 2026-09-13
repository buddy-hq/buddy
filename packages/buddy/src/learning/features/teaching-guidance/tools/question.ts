import z from "zod"
import { createBuddyTool } from "../../../runtime/create-buddy-tool"
import { askBuddyPiQuestions } from "../../../../pi-backend/ui-requests"
import QUESTION_DESCRIPTION from "./question.md"

const OptionSchema = z.object({
  label: z.string().describe("Display text (1-5 words, concise)"),
  description: z.string().describe("Explanation of choice"),
})

const QuestionPromptSchema = z.object({
  question: z.string().describe("Complete question"),
  header: z.string().describe("Very short label (max 30 chars)"),
  options: z.array(OptionSchema).describe("Available choices"),
  multiple: z.boolean().optional().describe("Allow selecting multiple choices"),
  custom: z.boolean().optional().describe("Allow typing a custom answer (default: true)"),
})

const QuestionToolParameters = z.object({
  questions: z.array(QuestionPromptSchema).describe("Questions to ask"),
})

export const questionTool = createBuddyTool({
  id: "question",
  description: QUESTION_DESCRIPTION,
  parameters: QuestionToolParameters,
  async execute(params, ctx) {
    const answers = await askBuddyPiQuestions({
      directory: ctx.directory,
      sessionID: ctx.sessionID,
      questions: params.questions.map((q) => ({
        ...q,
        options: q.options.map((opt) => ({
          label: opt.label,
          description: opt.description,
        })),
      })),
      tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : null,
    })

    const formatted = params.questions
      .map(
        (q, i) => `"${q.question}"="${answers[i]?.length ? answers[i].join(", ") : "Unanswered"}"`,
      )
      .join(", ")

    return {
      title: `Asked ${params.questions.length} question${params.questions.length > 1 ? "s" : ""}`,
      output: `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`,
      metadata: {
        answers,
      },
    }
  },
})
