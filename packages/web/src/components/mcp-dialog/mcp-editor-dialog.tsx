import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
  Field,
  FieldLabel,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@buddy/ui"
import { PlugIcon } from "@/icons/app-icons"
import { language } from "@/context/language"
import {
  getFieldErrorId,
  type McpEditorMode,
  type McpFieldErrors,
  type McpFieldName,
  type McpFormDraft,
} from "./mcp-config-schema"
import { McpLocalFields } from "./mcp-local-fields"
import { McpRemoteFields } from "./mcp-remote-fields"

type McpEditorDialogProps = {
  open: boolean
  onOpenChange: (nextOpen: boolean) => void
  mode: McpEditorMode
  description?: string
  draft: McpFormDraft
  setDraft: (next: McpFormDraft | ((current: McpFormDraft) => McpFormDraft)) => void
  showOAuthClientFields: boolean
  setShowOAuthClientFields: (next: boolean | ((current: boolean) => boolean)) => void
  fieldErrors: McpFieldErrors
  editorError?: string
  editorSaving: boolean
  clearFieldError: (field: McpFieldName) => void
  getFieldProps: (
    field: McpFieldName,
    describedBy?: string,
  ) => {
    "aria-describedby": string | undefined
    "aria-errormessage": string | undefined
    "aria-invalid": true | undefined
  }
  onSave: () => Promise<void>
}

export function McpEditorDialog(props: McpEditorDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="flex flex-col items-start space-y-3.5">
          <div className="flex items-center gap-3 w-full">
            <div className="flex size-10 items-center justify-center rounded-xl border border-border-weak bg-surface-weak/50 text-icon-brand-base shrink-0">
              <PlugIcon className="size-5" />
            </div>
            <div className="min-w-0 text-left w-full">
              <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                <span>
                  {props.mode === "create"
                    ? language.t("mcp.editorDialog.addTitle")
                    : language.t("mcp.editorDialog.editTitle", { name: props.draft.name })}
                </span>
                {props.editorSaving && (
                  <Spinner className="size-3.5 text-text-interactive-base shrink-0" />
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-text-weak leading-normal mt-1 select-none">
                {props.description ?? language.t("mcp.editorDialog.description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-1.5">
          <Field className="space-y-1.5">
            <FieldLabel
              className="text-xs font-medium text-text-weak"
              htmlFor="mcp-name"
            >
              {language.t("mcp.editorDialog.name")}
            </FieldLabel>
            <Input
              id="mcp-name"
              value={props.draft.name}
              disabled={props.mode === "edit"}
              onChange={(event) => {
                const value = event.target.value
                props.setDraft((current) => ({
                  ...current,
                  name: value,
                }))
                props.clearFieldError("name")
              }}
              placeholder={language.t("mcp.editorDialog.namePlaceholder")}
              className="h-10 text-sm px-3 rounded-lg border-border-base focus-visible:ring-1 focus-visible:ring-border-interactive-base"
              {...props.getFieldProps("name")}
            />
            {props.fieldErrors.name ? (
              <p id={getFieldErrorId("name")} className="text-xs text-icon-critical-base">
                {props.fieldErrors.name}
              </p>
            ) : null}
          </Field>

          <Tabs
            value={props.draft.type}
            onValueChange={(value) => {
              if (value !== "local" && value !== "remote") return
              props.setDraft((current) => ({
                ...current,
                type: value,
              }))
            }}
            className="w-full my-1"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="remote" disabled={props.mode === "edit"}>
                {language.t("mcp.editorDialog.remote")}
              </TabsTrigger>
              <TabsTrigger value="local" disabled={props.mode === "edit"}>
                {language.t("mcp.editorDialog.local")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {props.draft.type === "remote" ? (
            <McpRemoteFields
              draft={props.draft}
              fieldErrors={{
                url: props.fieldErrors.url,
                headers: props.fieldErrors.headers,
              }}
              showOAuthClientFields={props.showOAuthClientFields}
              setShowOAuthClientFields={props.setShowOAuthClientFields}
              setDraft={props.setDraft}
              clearFieldError={(field) => props.clearFieldError(field)}
              getFieldProps={(field) => props.getFieldProps(field)}
            />
          ) : (
            <McpLocalFields
              draft={props.draft}
              fieldErrors={{
                command: props.fieldErrors.command,
                environment: props.fieldErrors.environment,
              }}
              setDraft={props.setDraft}
              clearFieldError={(field) => props.clearFieldError(field)}
              getFieldProps={(field, describedBy) => props.getFieldProps(field, describedBy)}
            />
          )}

          <div className="h-[1px] bg-border-base/40 w-full mt-1.5" />

          <Field
            orientation="horizontal"
            className="items-center justify-between gap-4 px-1 py-1.5"
          >
            <FieldLabel htmlFor="mcp-timeout" className="text-sm font-semibold text-text-strong">
              {language.t("mcp.editorDialog.timeoutSeconds")}
            </FieldLabel>
            <div className="w-24">
              <Input
                id="mcp-timeout"
                value={props.draft.timeout}
                onChange={(event) => {
                  const value = event.target.value
                  props.setDraft((current) => ({
                    ...current,
                    timeout: value,
                  }))
                  props.clearFieldError("timeout")
                }}
                placeholder={language.t("mcp.editorDialog.timeoutPlaceholder")}
                inputMode="numeric"
                className="h-9 text-sm px-2 text-center rounded-lg border-border-base focus-visible:ring-1 focus-visible:ring-border-interactive-base"
                {...props.getFieldProps("timeout")}
              />
            </div>
          </Field>
          {props.fieldErrors.timeout ? (
            <p
              id={getFieldErrorId("timeout")}
              className="text-xs text-icon-critical-base px-1 -mt-2"
            >
              {props.fieldErrors.timeout}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-4 py-1.5 px-1">
            <span className="text-sm font-semibold text-text-strong">
              {language.t("mcp.editorDialog.enabledByDefault")}
            </span>
            <Switch
              checked={props.draft.enabled}
              onCheckedChange={(checked) => {
                props.setDraft((current) => ({
                  ...current,
                  enabled: checked,
                }))
              }}
            />
          </div>
        </div>

        {props.editorError ? (
          <p className="text-sm text-text-critical-base bg-surface-critical-weak/10 border border-border-critical-weak/30 rounded-lg p-2.5">
            {props.editorError}
          </p>
        ) : null}

        <DialogFooter className="gap-2 mt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => props.onOpenChange(false)}
            disabled={props.editorSaving}
            className="active:scale-[0.97] transition-transform"
          >
            {language.t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              void props.onSave()
            }}
            disabled={props.editorSaving}
            className="active:scale-[0.97] transition-transform"
          >
            {props.editorSaving
              ? language.t("common.saving")
              : props.mode === "create"
                ? language.t("mcp.editorDialog.saveAdd")
                : language.t("mcp.editorDialog.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
