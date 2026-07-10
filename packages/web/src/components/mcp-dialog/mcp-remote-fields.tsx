import { Button, Input, Switch, Textarea, Field, FieldLabel } from "@buddy/ui"
import { language } from "@/context/language"
import { getFieldErrorId, type McpFormDraft } from "./mcp-config-schema"

type McpRemoteFieldsProps = {
  draft: McpFormDraft
  fieldErrors: Partial<Record<"url" | "headers", string>>
  showOAuthClientFields: boolean
  setShowOAuthClientFields: (next: boolean | ((current: boolean) => boolean)) => void
  setDraft: (next: McpFormDraft | ((current: McpFormDraft) => McpFormDraft)) => void
  clearFieldError: (field: "url" | "headers") => void
  getFieldProps: (field: "url" | "headers") => {
    "aria-describedby": string | undefined
    "aria-errormessage": string | undefined
    "aria-invalid": true | undefined
  }
}

export function McpRemoteFields(props: McpRemoteFieldsProps) {
  const hasHeaders = props.draft.headersText.trim().length > 0
  const showAdvancedFields =
    props.showOAuthClientFields || hasHeaders || !props.draft.oauthEnabled

  return (
    <>
      <Field className="space-y-1.5">
        <FieldLabel className="text-xs font-semibold text-text-weak uppercase tracking-wider" htmlFor="mcp-url">
          {language.t("mcp.remoteFields.remoteUrl")}
        </FieldLabel>
        <Input
          id="mcp-url"
          value={props.draft.url}
          onChange={(event) => {
            const value = event.target.value
            props.setDraft((current) => ({
              ...current,
              url: value,
            }))
            props.clearFieldError("url")
          }}
          placeholder={language.t("mcp.remoteFields.urlPlaceholder")}
          className="h-10 text-sm px-3 rounded-lg border-border-base focus-visible:ring-1 focus-visible:ring-border-interactive-base"
          {...props.getFieldProps("url")}
        />
        {props.fieldErrors.url ? (
          <p id={getFieldErrorId("url")} className="text-xs text-icon-critical-base">
            {props.fieldErrors.url}
          </p>
        ) : null}
      </Field>

      <div className="flex items-center justify-between gap-4 py-2 px-1">
        <div className="space-y-0.5">
          <span className="text-sm font-semibold text-text-strong">
            {language.t("mcp.remoteFields.oauth")}
          </span>
          <p className="text-xs text-text-weak leading-normal">
            {language.t("mcp.remoteFields.oauthDescription")}
          </p>
        </div>
        <Switch
          checked={props.draft.oauthEnabled}
          onCheckedChange={(checked) => {
            if (!checked) {
              props.setShowOAuthClientFields(false)
            }
            props.setDraft((current) => ({
              ...current,
              oauthEnabled: checked,
            }))
          }}
        />
      </div>

      {props.draft.oauthEnabled ? (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border-base bg-surface-weak/30 px-4 py-3.5 sm:px-5">
          <p className="min-w-0 text-xs text-text-weak leading-normal">
            {language.t("mcp.remoteFields.browserLoginDescription")}
          </p>
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="shrink-0 active:scale-[0.97] transition-transform"
            onClick={() => props.setShowOAuthClientFields((current) => !current)}
          >
            {props.showOAuthClientFields
              ? language.t("mcp.remoteFields.hideDetails")
              : language.t("mcp.remoteFields.addDetails")}
          </Button>
        </div>
      ) : null}

      {showAdvancedFields ? (
        <>
          <Field className="space-y-1.5">
            <FieldLabel className="text-xs font-semibold text-text-weak uppercase tracking-wider" htmlFor="mcp-headers">
              {language.t("mcp.remoteFields.headersJson")}
            </FieldLabel>
            <Textarea
              id="mcp-headers"
              value={props.draft.headersText}
              onChange={(event) => {
                const value = event.target.value
                props.setDraft((current) => ({
                  ...current,
                  headersText: value,
                }))
                props.clearFieldError("headers")
              }}
              placeholder={language.t("mcp.remoteFields.headersPlaceholder")}
              className="min-h-24 text-sm px-3 py-2 rounded-lg border-border-base focus-visible:ring-1 focus-visible:ring-border-interactive-base"
              {...props.getFieldProps("headers")}
            />
            {props.fieldErrors.headers ? (
              <p id={getFieldErrorId("headers")} className="text-xs text-icon-critical-base">
                {props.fieldErrors.headers}
              </p>
            ) : null}
          </Field>

          {props.draft.oauthEnabled && props.showOAuthClientFields ? (
            <div className="grid gap-4 rounded-xl border border-border-base bg-surface-raised-base/30 p-4 sm:p-5">
              <div className="space-y-1">
                <span className="text-sm font-semibold text-text-strong">
                  {language.t("mcp.remoteFields.customClientDetails")}
                </span>
                <p className="text-xs text-text-weak leading-normal">
                  {language.t("mcp.remoteFields.customClientDetailsDescription")}
                </p>
              </div>

              <Field className="space-y-1.5">
                <FieldLabel className="text-xs font-semibold text-text-weak uppercase tracking-wider" htmlFor="mcp-client-id">
                  {language.t("mcp.remoteFields.clientIdOptional")}
                </FieldLabel>
                <Input
                  id="mcp-client-id"
                  value={props.draft.clientId}
                  onChange={(event) => {
                    props.setDraft((current) => ({
                      ...current,
                      clientId: event.target.value,
                     }))
                  }}
                  className="h-10 text-sm px-3 rounded-lg border-border-base focus-visible:ring-1 focus-visible:ring-border-interactive-base"
                />
              </Field>

              <Field className="space-y-1.5">
                <FieldLabel className="text-xs font-semibold text-text-weak uppercase tracking-wider" htmlFor="mcp-client-secret">
                  {language.t("mcp.remoteFields.clientSecretOptional")}
                </FieldLabel>
                <Input
                  id="mcp-client-secret"
                  value={props.draft.clientSecret}
                  onChange={(event) => {
                    props.setDraft((current) => ({
                      ...current,
                      clientSecret: event.target.value,
                    }))
                  }}
                  className="h-10 text-sm px-3 rounded-lg border-border-base focus-visible:ring-1 focus-visible:ring-border-interactive-base"
                />
              </Field>

              <Field className="space-y-1.5">
                <FieldLabel className="text-xs font-semibold text-text-weak uppercase tracking-wider" htmlFor="mcp-scope">
                  {language.t("mcp.remoteFields.scopeOptional")}
                </FieldLabel>
                <Input
                  id="mcp-scope"
                  value={props.draft.scope}
                  onChange={(event) => {
                    props.setDraft((current) => ({
                      ...current,
                      scope: event.target.value,
                    }))
                  }}
                  placeholder={language.t("mcp.remoteFields.scopePlaceholder")}
                  className="h-10 text-sm px-3 rounded-lg border-border-base focus-visible:ring-1 focus-visible:ring-border-interactive-base"
                />
              </Field>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  )
}
