import type { ToolPartProps } from "../../registry"
import { ObjectCard } from "../../object-card"

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
