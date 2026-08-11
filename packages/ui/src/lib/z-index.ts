/**
 * Application-wide layers for elements that can escape their owning surface.
 *
 * Components inside an isolated surface should keep using small local layers
 * (for example `z-10` and `z-20`). Only portals, fixed application chrome,
 * and overlays shared by multiple surfaces belong on this scale.
 */
export const Z_INDEX = {
  applicationChrome: 100,
  workspaceOverlay: 200,
  /**
   * Backdrop and content share one layer on purpose. Every modal portals its
   * overlay and content as adjacent siblings, overlay first, so DOM order
   * already paints content above its own backdrop. Giving the backdrop its own
   * lower layer would break nested modals instead: the second dialog's backdrop
   * would sit under the first dialog's content and leave it undimmed.
   */
  modal: 300,
  floating: 400,
  tooltip: 410,
  notification: 420,
  devtools: 500,
  devtoolsFloating: 510,
} as const
