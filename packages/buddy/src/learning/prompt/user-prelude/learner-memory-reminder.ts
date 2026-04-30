import { renderLearnerContextDelivery } from "../../shared/learner-context-delivery"
import { defineTurnReminder } from "./definition"

export const learnerMemoryReminder = defineTurnReminder({
  key: "learner-memory",
  when: (context) => context.learnerContextDelivery !== undefined,
  render: (context) =>
    context.learnerContextDelivery
      ? renderLearnerContextDelivery(context.learnerContextDelivery)
      : undefined,
})
