/**
 * One horizontal rail for every left-sidebar row.
 *
 * Each row leads with a fixed-width slot holding whatever identifies it — a status
 * dot, a notebook icon, a chat icon — followed by the label. Because the slot is a
 * real layout box rather than an absolute overlay, the label position never depends
 * on whether an indicator is present, and no row type needs its own offset math.
 *
 *   [ group padding ][ row padding ][ leading slot ][ gap ][ label ]
 *                                   ^ 16px                 ^ 38px   (from sidebar edge)
 */

/** Inner horizontal padding on a group's content wrapper (`px-1.5`). */
export const SIDEBAR_GROUP_PADDING_X_PX = 6

/** Left padding on the row itself, inside the group wrapper. */
export const SIDEBAR_ROW_PADDING_LEFT_PX = 4

/** Width of the leading slot — sized to the 14px notebook and chat icons. */
export const SIDEBAR_ROW_LEADING_SLOT_PX = 14

/**
 * The leading slot must never drive the row's height — only its width.
 *
 * The row is a `flex items-center`, so its height is max(slot, label). A
 * content-sized slot therefore resizes the row as the status dot mounts and
 * unmounts, and a hard-coded slot height inflates the row whenever it guesses
 * taller than the label's line box. Both are layout bugs.
 *
 * The slot uses `self-stretch` instead: it adopts whatever cross size the label
 * establishes, so it contributes nothing of its own and stays correct if the
 * label's type scale ever changes.
 */

/** Gap between the leading slot and the row label. */
export const SIDEBAR_ROW_LEADING_GAP_PX = 8

/** Extra inset per subagent nesting level. */
export const SIDEBAR_ROW_CHILD_INDENT_PX = 10

/** Label inset for rows that have no leading glyph — empty states, "show more". */
export const SIDEBAR_ROW_LABEL_INSET_PX =
  SIDEBAR_ROW_PADDING_LEFT_PX + SIDEBAR_ROW_LEADING_SLOT_PX + SIDEBAR_ROW_LEADING_GAP_PX

/** Section headers ("Pinned", "Notebooks") align to the leading slot, not the label. */
export const SIDEBAR_SECTION_LABEL_INSET_PX =
  SIDEBAR_GROUP_PADDING_X_PX + SIDEBAR_ROW_PADDING_LEFT_PX
