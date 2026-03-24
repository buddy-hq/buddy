import type { PointerEvent as ReactPointerEvent } from "react"
import { useCallback, useRef, useState } from "react"
import type { DirectoryGroup, DropPosition } from "./types"

type UseDirectoryReorderingProps = {
  directoryGroups: DirectoryGroup[]
  onReorderDirectories: (newOrder: string[]) => void
}

export function useDirectoryReordering({
  directoryGroups,
  onReorderDirectories,
}: UseDirectoryReorderingProps) {
  const [draggedDirectory, setDraggedDirectory] = useState<string | undefined>(undefined)
  const [dragOverDirectory, setDragOverDirectory] = useState<string | undefined>(undefined)
  const [dragOverPosition, setDragOverPosition] = useState<DropPosition>("after")
  const sectionRefsMap = useRef<Map<string, HTMLElement>>(new Map())

  const sectionRefCallback = useCallback(
    (directory: string) => (element: HTMLElement | null) => {
      if (element) {
        sectionRefsMap.current.set(directory, element)
      } else {
        sectionRefsMap.current.delete(directory)
      }
    },
    [],
  )

  const findDropTarget = useCallback(
    (
      clientY: number,
      draggedDir: string,
    ): { directory: string; position: DropPosition } | undefined => {
      for (const group of directoryGroups) {
        if (group.directory === draggedDir) continue
        const element = sectionRefsMap.current.get(group.directory)
        if (!element) continue

        const rect = element.getBoundingClientRect()
        if (clientY < rect.top || clientY > rect.bottom) continue

        const midpoint = rect.top + rect.height / 2
        return {
          directory: group.directory,
          position: clientY < midpoint ? "before" : "after",
        }
      }

      return undefined
    },
    [directoryGroups],
  )

  const commitReorder = useCallback(
    (sourceDir: string, targetDir: string, position: DropPosition) => {
      const currentOrder = directoryGroups.map((group) => group.directory)
      if (!currentOrder.includes(sourceDir) || !currentOrder.includes(targetDir)) return

      const withoutSource = currentOrder.filter((directory) => directory !== sourceDir)
      const targetIndex = withoutSource.indexOf(targetDir)
      if (targetIndex === -1) return

      const insertAt = position === "before" ? targetIndex : targetIndex + 1
      const nextOrder = [
        ...withoutSource.slice(0, insertAt),
        sourceDir,
        ...withoutSource.slice(insertAt),
      ]
      onReorderDirectories(nextOrder)
    },
    [directoryGroups, onReorderDirectories],
  )

  const handleLabelPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, directory: string) => {
      if (event.button !== 0) return

      const startY = event.clientY
      let isDragging = false
      const controller = new AbortController()

      function onPointerMove(pointerEvent: globalThis.PointerEvent) {
        const deltaY = Math.abs(pointerEvent.clientY - startY)
        if (!isDragging && deltaY > 3) {
          isDragging = true
          setDraggedDirectory(directory)
        }

        if (isDragging) {
          pointerEvent.preventDefault()
          const target = findDropTarget(pointerEvent.clientY, directory)
          if (target) {
            setDragOverDirectory(target.directory)
            setDragOverPosition(target.position)
          } else {
            setDragOverDirectory(undefined)
          }
        }
      }

      function onPointerUp(pointerEvent: globalThis.PointerEvent) {
        if (isDragging) {
          const target = findDropTarget(pointerEvent.clientY, directory)
          if (target) {
            commitReorder(directory, target.directory, target.position)
          }
        }

        controller.abort()
        setDraggedDirectory(undefined)
        setDragOverDirectory(undefined)
      }

      document.addEventListener("pointermove", onPointerMove, {
        signal: controller.signal,
      })
      document.addEventListener("pointerup", onPointerUp, {
        signal: controller.signal,
      })
    },
    [commitReorder, findDropTarget],
  )

  return {
    draggedDirectory,
    dragOverDirectory,
    dragOverPosition,
    handleLabelPointerDown,
    sectionRefCallback,
  }
}
