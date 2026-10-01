import type { DirectoryWorkspaceController } from "@/lib/directory-workspace-controller"
import { workspaceCollectionForDrawer } from "@/lib/directory-chat/workspace-presentation"
import type { DrawerKind } from "@/state/directory-workspace-store"
import { useUiPreferences } from "@/state/ui-preferences"

/**
 * Opens `drawer` with its list showing. Choosing a section always shows its list; a hidden list
 * only stays hidden when the section is restored (after a restart, say).
 */
export function showWorkspaceDrawer(
  controller: DirectoryWorkspaceController,
  drawer: DrawerKind,
): void {
  const collection = workspaceCollectionForDrawer(drawer)
  if (collection) useUiPreferences.getState().setWorkspaceListOpen(collection, true)
  void controller.execute({ type: "open-drawer", drawer })
}
