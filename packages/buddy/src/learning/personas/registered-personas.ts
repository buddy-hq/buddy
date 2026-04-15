import { BUDDY } from "./buddy"
import { CODE_BUDDY } from "./code-buddy"
import { MATH_BUDDY } from "./math-buddy"
import { READING_BUDDY } from "./reading-buddy"
import { registerPersona } from "./wiring/register-persona"

export const REGISTERED_BUDDY_PERSONAS = registerPersona({
  personas: [BUDDY, CODE_BUDDY, MATH_BUDDY, READING_BUDDY],
})
