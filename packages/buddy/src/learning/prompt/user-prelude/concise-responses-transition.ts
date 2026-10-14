import { defineTurnReminder } from "./definition"
import { renderConciseResponseInstructions } from "../../personas/prompts/concise-response-control"

/** Override the previous concision preference on change without rewriting the chat's base prompt. */
export const conciseResponsesTransitionReminder = defineTurnReminder({
  key: "concise-responses-transition",
  when: (context) =>
    context.priorConciseResponses !== undefined &&
    context.priorConciseResponses !== context.conciseResponses,
  render: (context) => {
    return context.conciseResponses
      ? [
          "Use the following concise-response preference from now on:",
          renderConciseResponseInstructions(context.persona),
        ].join("\n\n")
      : "The earlier concise-response preference no longer applies. Any earlier instructions imposing word or sentence limits, WhatsApp-style replies, or restrictions on headings and bullet lists no longer apply either."
  },
})
