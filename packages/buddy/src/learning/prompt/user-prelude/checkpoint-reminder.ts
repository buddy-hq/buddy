import { defineTurnReminder } from "./definition"

const CHECKPOINT_UNACCEPTED_REMINDER =
  "There are unaccepted lesson changes since the last checkpoint. Verify before accepting progress."

export const checkpointReminder = defineTurnReminder({
  key: "checkpoint",
  when: (context) => context.changedSinceCheckpoint === true,
  render: () => CHECKPOINT_UNACCEPTED_REMINDER,
})
