import { ObjectCard } from "@/components/chat/tools/object-card"
import type { ToolPartProps } from "@/components/chat/tools/registry"

type MermaidToolCardProps = {
  title: string
  diagramType?: string
  status?: ToolPartProps["state"]["status"]
  hideStatus?: boolean
  actions?: React.ReactNode
  children?: React.ReactNode
  contentClassName?: string
}

export function MermaidToolCard({
  title,
  diagramType,
  status,
  hideStatus = false,
  actions,
  children,
  contentClassName,
}: MermaidToolCardProps) {
  return (
    <ObjectCard
      title={title}
      badge={diagramType}
      status={status}
      hideStatus={hideStatus}
      actions={actions}
      contentClassName={contentClassName}
      headerPosition="bottom"
      showGrid
    >
      {children}
    </ObjectCard>
  )
}
