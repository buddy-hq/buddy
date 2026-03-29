import { useRef } from "react"
import { Badge, Button, Input, Separator, Switch } from "@buddy/ui"
import { language } from "@/context/language"
import type { McpStatusMap } from "@/state/chat-types"
import {
  VIRTUAL_DEFAULT_OVERSCAN,
  VIRTUAL_MCP_MIN_ITEMS,
  VIRTUAL_MCP_ROW_ESTIMATE_PX,
} from "@/components/virtualization/virtualization-defaults"
import { VirtualizedRows } from "@/components/virtualization/virtualized-rows"
import { formatMcpError, getMcpStatusLabel, type McpConfig } from "./mcp-config-schema"

type McpListPanelProps = {
  allNames: string[]
  entries: string[]
  showSearch: boolean
  loading: boolean
  query: string
  setQuery: (value: string) => void
  pendingName: string | null
  statusByName: McpStatusMap
  configByName: Record<string, McpConfig>
  onAddMcp: () => void
  onEditMcp: (name: string) => void
  onToggleMcp: (name: string) => Promise<void>
  onConnectMcp: (name: string) => Promise<void>
}

export function McpListPanel(props: McpListPanelProps) {
  const entriesListRef = useRef<HTMLDivElement>(null)

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border-base/60 bg-surface-weak/20 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-base">{language.t("mcp.listPanel.title")}</p>
          <p className="text-xs text-text-weak">
            {props.allNames.length > 0
              ? language.t("mcp.listPanel.descriptionWithItems")
              : language.t("mcp.listPanel.descriptionEmpty")}
          </p>
        </div>
        <Button type="button" size="sm" className="shrink-0" onClick={props.onAddMcp}>
          {language.t("mcp.listPanel.addMcp")}
        </Button>
      </div>

      {props.showSearch ? (
        <Input
          value={props.query}
          onChange={(event) => props.setQuery(event.target.value)}
          placeholder={language.t("mcp.listPanel.filterPlaceholder")}
          autoFocus
        />
      ) : null}

      <div
        ref={entriesListRef}
        className="max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto rounded-xl border"
      >
        {props.entries.length > 0 ? (
          props.entries.length >= VIRTUAL_MCP_MIN_ITEMS ? (
            <VirtualizedRows
              items={props.entries}
              getItemKey={(name) => name}
              estimateSize={() => VIRTUAL_MCP_ROW_ESTIMATE_PX}
              getScrollElement={() => entriesListRef.current}
              overscan={VIRTUAL_DEFAULT_OVERSCAN}
              measure
              renderItem={(name, index) => {
                const status = props.statusByName[name]
                const config = props.configByName[name]
                const enabled = status?.status === "connected"
                const label = status
                  ? getMcpStatusLabel(status.status)
                  : config?.enabled === false
                    ? language.t("mcp.statusLabels.disabled")
                    : language.t("mcp.listPanel.configured")
                const isPending = props.pendingName === name
                const pendingLabel =
                  status?.status === "connected"
                    ? language.t("mcp.listPanel.disconnecting")
                    : status?.status === "needs_auth"
                      ? language.t("mcp.listPanel.signingIn")
                      : language.t("mcp.listPanel.connecting")

                return (
                  <div>
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-text-base">{name}</p>
                          <Badge variant="outline" className="h-5">
                            {label}
                          </Badge>
                          {config ? (
                            <Badge variant="secondary" className="h-5">
                              {config.type}
                            </Badge>
                          ) : null}
                          {isPending ? (
                            <span className="text-xs text-text-weak">{pendingLabel}</span>
                          ) : null}
                        </div>
                        {status?.error ? (
                          <p className="mt-1 truncate text-xs text-text-weak">
                            {formatMcpError(status.error)}
                          </p>
                        ) : config ? (
                          <p className="mt-1 truncate text-xs text-text-weak">
                            {config.type === "remote" ? config.url : config.command.join(" ")}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {config ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() => props.onEditMcp(name)}
                          >
                            {language.t("mcp.listPanel.editDetails")}
                          </Button>
                        ) : null}
                        {status?.status === "needs_auth" ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => {
                              void props.onConnectMcp(name)
                            }}
                          >
                            {language.t("mcp.listPanel.connect")}
                          </Button>
                        ) : null}
                        <Switch
                          checked={enabled}
                          disabled={isPending}
                          aria-label={language.t(
                            enabled
                              ? "mcp.listPanel.switchAria.disable"
                              : "mcp.listPanel.switchAria.enable",
                            { name: name },
                          )}
                          onCheckedChange={() => {
                            void props.onToggleMcp(name)
                          }}
                        />
                      </div>
                    </div>
                    {index === props.entries.length - 1 ? null : <Separator />}
                  </div>
                )
              }}
            />
          ) : (
            props.entries.map((name, index) => {
              const status = props.statusByName[name]
              const config = props.configByName[name]
              const enabled = status?.status === "connected"
              const label = status
                ? getMcpStatusLabel(status.status)
                : config?.enabled === false
                  ? language.t("mcp.statusLabels.disabled")
                  : language.t("mcp.listPanel.configured")
              const isPending = props.pendingName === name
              const pendingLabel =
                status?.status === "connected"
                  ? language.t("mcp.listPanel.disconnecting")
                  : status?.status === "needs_auth"
                    ? language.t("mcp.listPanel.signingIn")
                    : language.t("mcp.listPanel.connecting")

              return (
                <div key={name}>
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-text-base">{name}</p>
                        <Badge variant="outline" className="h-5">
                          {label}
                        </Badge>
                        {config ? (
                          <Badge variant="secondary" className="h-5">
                            {config.type}
                          </Badge>
                        ) : null}
                        {isPending ? (
                          <span className="text-xs text-text-weak">{pendingLabel}</span>
                        ) : null}
                      </div>
                      {status?.error ? (
                        <p className="mt-1 truncate text-xs text-text-weak">
                          {formatMcpError(status.error)}
                        </p>
                      ) : config ? (
                        <p className="mt-1 truncate text-xs text-text-weak">
                          {config.type === "remote" ? config.url : config.command.join(" ")}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {config ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => props.onEditMcp(name)}
                        >
                          {language.t("mcp.listPanel.editDetails")}
                        </Button>
                      ) : null}
                      {status?.status === "needs_auth" ? (
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={isPending}
                          onClick={() => {
                            void props.onConnectMcp(name)
                          }}
                        >
                          {language.t("mcp.listPanel.connect")}
                        </Button>
                      ) : null}
                      <Switch
                        checked={enabled}
                        disabled={isPending}
                        aria-label={language.t(
                          enabled
                            ? "mcp.listPanel.switchAria.disable"
                            : "mcp.listPanel.switchAria.enable",
                          { name: name },
                        )}
                        onCheckedChange={() => {
                          void props.onToggleMcp(name)
                        }}
                      />
                    </div>
                  </div>
                  {index === props.entries.length - 1 ? null : <Separator />}
                </div>
              )
            })
          )
        ) : (
          <div className="flex flex-col items-start gap-3 px-4 py-8 text-sm text-text-weak">
            <p>
              {props.loading
                ? language.t("mcp.listPanel.loading")
                : props.showSearch
                  ? language.t("mcp.listPanel.noMatch")
                  : language.t("mcp.listPanel.noneConfigured")}
            </p>
            {!props.loading && !props.showSearch ? (
              <Button type="button" size="sm" variant="outline" onClick={props.onAddMcp}>
                {language.t("mcp.listPanel.addFirstMcp")}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </>
  )
}
