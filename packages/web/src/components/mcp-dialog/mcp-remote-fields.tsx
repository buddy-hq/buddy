import { Button, Input, Switch, Textarea } from "@buddy/ui"
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
  return (
    <>
      <div className="grid gap-2">
        <label className="text-sm font-medium text-text-base" htmlFor="mcp-url">
          {language.t("mcp.remoteFields.remoteUrl")}
        </label>
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
          {...props.getFieldProps("url")}
        />
        {props.fieldErrors.url ? (
          <p id={getFieldErrorId("url")} className="text-xs text-icon-critical-base">
            {props.fieldErrors.url}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <label className="text-sm font-medium text-text-base" htmlFor="mcp-headers">
          {language.t("mcp.remoteFields.headersJson")}
        </label>
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
          className="min-h-24"
          {...props.getFieldProps("headers")}
        />
        {props.fieldErrors.headers ? (
          <p id={getFieldErrorId("headers")} className="text-xs text-icon-critical-base">
            {props.fieldErrors.headers}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
        <div>
          <p className="text-sm font-medium text-text-base">
            {language.t("mcp.remoteFields.oauth")}
          </p>
          <p className="text-xs text-text-weak">
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
        <div className="grid gap-4 rounded-lg border p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-text-base">
              {language.t("mcp.remoteFields.browserLogin")}
            </p>
            <p className="text-xs text-text-weak">
              {language.t("mcp.remoteFields.browserLoginDescription")}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div>
              <p className="text-sm font-medium text-text-base">
                {language.t("mcp.remoteFields.customClientDetails")}
              </p>
              <p className="text-xs text-text-weak">
                {language.t("mcp.remoteFields.customClientDetailsDescription")}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => props.setShowOAuthClientFields((current) => !current)}
            >
              {props.showOAuthClientFields
                ? language.t("mcp.remoteFields.hideDetails")
                : language.t("mcp.remoteFields.addDetails")}
            </Button>
          </div>

          {props.showOAuthClientFields ? (
            <>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-text-base" htmlFor="mcp-client-id">
                  {language.t("mcp.remoteFields.clientIdOptional")}
                </label>
                <Input
                  id="mcp-client-id"
                  value={props.draft.clientId}
                  onChange={(event) => {
                    props.setDraft((current) => ({
                      ...current,
                      clientId: event.target.value,
                    }))
                  }}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-text-base" htmlFor="mcp-client-secret">
                  {language.t("mcp.remoteFields.clientSecretOptional")}
                </label>
                <Input
                  id="mcp-client-secret"
                  value={props.draft.clientSecret}
                  onChange={(event) => {
                    props.setDraft((current) => ({
                      ...current,
                      clientSecret: event.target.value,
                    }))
                  }}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-text-base" htmlFor="mcp-scope">
                  {language.t("mcp.remoteFields.scopeOptional")}
                </label>
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
                />
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
