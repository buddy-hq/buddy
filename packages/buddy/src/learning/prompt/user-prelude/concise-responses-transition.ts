import { defineTurnReminder } from "./definition"
import { renderConciseResponseInstructions } from "../../personas/prompts/concise-response-control"

export const conciseResponsesTransitionReminder = defineTurnReminder({
  key: "concise-responses-transition",
  when: (context) =>
    context.priorConciseResponses !== undefined &&
    context.priorConciseResponses !== context.conciseResponses,
  render: (context) => {
    return context.conciseResponses
      ? [
          "Concise responses switch: off -> on. Follow these response instructions from now on:",
          renderConciseResponseInstructions(context.persona),
        ].join("\n\n")
      : "Concise responses switch: on -> off. The earlier WhatsApp-style, short-turn, sentence-count, word-count, no-header, no-bullet, and one-line response rules no longer apply. Keep following the teaching-through-conversation guidance, and use the length and structure that best fit the learner's request."
  },
})
