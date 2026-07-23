import { BUDDY } from "./buddy"
import { CODE } from "./code"
import { TEACHING_BUDDY } from "./teaching-buddy"
import { registerPersona } from "./wiring/register-persona"

export const REGISTERED_BUDDY_PERSONAS = registerPersona({
  personas: [BUDDY, TEACHING_BUDDY, CODE],
})
