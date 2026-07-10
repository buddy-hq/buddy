import { BUDDY } from "./buddy"
import { TEACHING_BUDDY } from "./teaching-buddy"
import { registerPersona } from "./wiring/register-persona"

export const REGISTERED_BUDDY_PERSONAS = registerPersona({
  personas: [BUDDY, TEACHING_BUDDY],
})
