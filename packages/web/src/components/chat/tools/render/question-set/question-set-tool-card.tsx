import { ObjectCard } from "../../object-card"
import type { ToolState } from "../../types"

type QuestionSetToolCardProps = {
  title: string
  subtitle?: string
  status?: ToolState["status"]
  children?: React.ReactNode
}

export function QuestionSetToolCard({
  title,
  subtitle,
  status,
  children,
}: QuestionSetToolCardProps) {
  return (
    <ObjectCard title={title} subtitle={subtitle} status={status} innerClassName="p-3">
      {children}
    </ObjectCard>
  )
}
