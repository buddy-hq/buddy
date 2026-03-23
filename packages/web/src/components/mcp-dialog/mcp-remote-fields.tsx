import { Button, Input, Switch, Textarea } from "@buddy/ui"
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
          Remote URL
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
          placeholder="https://example.com/mcp"
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
          Headers (JSON)
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
          placeholder={`{\n  "Authorization": "Bearer ..."\n}`}
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
          <p className="text-sm font-medium text-text-base">OAuth</p>
          <p className="text-xs text-text-weak">
            Remote MCPs use browser sign-in by default. Leave headers empty for browser login, or
            turn browser sign-in off to use an Authorization header instead.
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
            <p className="text-sm font-medium text-text-base">Browser login</p>
            <p className="text-xs text-text-weak">
              Most hosted MCPs, including Linear, work without any client details here. Save with
              browser sign-in on, then turn the MCP on to start the browser login flow.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div>
              <p className="text-sm font-medium text-text-base">Custom client details</p>
              <p className="text-xs text-text-weak">
                Optional. Only use these if the MCP provider gave you a client ID/secret or
                automatic registration fails.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => props.setShowOAuthClientFields((current) => !current)}
            >
              {props.showOAuthClientFields ? "Hide details" : "Add details"}
            </Button>
          </div>

          {props.showOAuthClientFields ? (
            <>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-text-base" htmlFor="mcp-client-id">
                  Client ID (optional)
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
                  Client secret (optional)
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
                  Scope (optional)
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
                  placeholder="Leave blank to use the server default"
                />
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
