import { useState } from "react"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@buddy/ui"

const THEMES = [
  { value: "dracula", label: "Dracula" },
  { value: "nord", label: "Nord" },
  { value: "solarized-dark", label: "Solarized Dark" },
  { value: "solarized-light", label: "Solarized Light" },
  { value: "github-dark", label: "GitHub Dark" },
  { value: "github-light", label: "GitHub Light" },
  { value: "monokai-pro", label: "Monokai Pro" },
  { value: "catppuccin-mocha", label: "Catppuccin Mocha" },
  { value: "catppuccin-latte", label: "Catppuccin Latte" },
  { value: "tokyo-night", label: "Tokyo Night" },
  { value: "rose-pine", label: "Rosé Pine" },
  { value: "one-dark-pro", label: "One Dark Pro" },
  { value: "gruvbox-dark", label: "Gruvbox Dark" },
  { value: "gruvbox-light", label: "Gruvbox Light" },
]

const FONT_SIZES = [
  { value: "11", label: "11 px" },
  { value: "12", label: "12 px" },
  { value: "13", label: "13 px" },
  { value: "14", label: "14 px" },
  { value: "15", label: "15 px" },
  { value: "16", label: "16 px" },
  { value: "18", label: "18 px" },
  { value: "20", label: "20 px" },
]

export function SelectDropdownVariantsEasel() {
  const [theme, setTheme] = useState("dracula")
  const [model, setModel] = useState("claude-3-5-sonnet")
  const [fontSize, setFontSize] = useState("13")
  const [longList, setLongList] = useState("theme-1")
  const [permission, setPermission] = useState("ask")

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-8 overflow-y-auto bg-background-base p-8">
      {/* Title */}
      <div>
        <h1 className="text-lg font-semibold text-text-strong">
          Select Component States &amp; Variants
        </h1>
        <p className="text-xs text-text-weak">
          Radix Select primitive from <code className="text-text-base">@buddy/ui</code>
        </p>
      </div>

      {/* 1. Grouped with Multiple Providers & Many Values */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-weaker">
          1. Multi-Group Select (Many items across sections)
        </h2>
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-text-strong">
              AI Models (Grouped by Provider)
            </span>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>OpenAI</SelectLabel>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="gpt-4o-mini">GPT-4o mini</SelectItem>
                  <SelectItem value="o1">o1</SelectItem>
                  <SelectItem value="o1-mini">o1-mini</SelectItem>
                  <SelectItem value="o3-mini">o3-mini</SelectItem>
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Anthropic</SelectLabel>
                  <SelectItem value="claude-3-5-sonnet">Claude 3.5 Sonnet</SelectItem>
                  <SelectItem value="claude-3-7-sonnet">Claude 3.7 Sonnet</SelectItem>
                  <SelectItem value="claude-3-5-haiku">Claude 3.5 Haiku</SelectItem>
                  <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Google</SelectLabel>
                  <SelectItem value="gemini-2-0-flash">Gemini 2.0 Flash</SelectItem>
                  <SelectItem value="gemini-2-0-pro">Gemini 2.0 Pro</SelectItem>
                  <SelectItem value="gemini-1-5-pro">Gemini 1.5 Pro</SelectItem>
                  <SelectItem value="gemini-1-5-flash">Gemini 1.5 Flash</SelectItem>
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Meta / Open Source</SelectLabel>
                  <SelectItem value="llama-3-3-70b">Llama 3.3 70B</SelectItem>
                  <SelectItem value="llama-3-1-405b">Llama 3.1 405B</SelectItem>
                  <SelectItem value="deepseek-r1">DeepSeek R1</SelectItem>
                  <SelectItem value="deepseek-v3">DeepSeek V3</SelectItem>
                  <SelectItem value="qwen-2-5-coder">Qwen 2.5 Coder 32B</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-text-strong">
              Theme List (14 items, scrolling)
            </span>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Dark Themes</SelectLabel>
                  {THEMES.filter(
                    (t) => !t.value.includes("light") && !t.value.includes("latte"),
                  ).map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Light Themes</SelectLabel>
                  {THEMES.filter((t) => t.value.includes("light") || t.value.includes("latte")).map(
                    (t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ),
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-text-strong">Font Size (Compact values)</span>
            <Select value={fontSize} onValueChange={setFontSize}>
              <SelectTrigger size="sm" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_SIZES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* 2. States Matrix */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-weaker">
          2. Trigger State Variants (Default, Placeholder, Disabled, Invalid, Small)
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {/* Normal */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-strong">Default Selected</span>
            <Select value={permission} onValueChange={setPermission}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Always Allow</SelectItem>
                <SelectItem value="ask">Ask Every Time</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Placeholder */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-strong">Unset (Placeholder)</span>
            <Select>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose action…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">Read Only</SelectItem>
                <SelectItem value="write">Read &amp; Write</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Disabled */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-strong">Disabled Trigger</span>
            <Select defaultValue="ask" disabled>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ask">Ask Every Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Invalid */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-strong">Invalid / Error</span>
            <Select defaultValue="error-val">
              <SelectTrigger aria-invalid="true" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="error-val">Missing Provider Key</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Small size */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text-strong">
              Small Size (size=&quot;sm&quot;)
            </span>
            <Select value={permission} onValueChange={setPermission}>
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Always Allow</SelectItem>
                <SelectItem value="ask">Ask Every Time</SelectItem>
                <SelectItem value="deny">Deny</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* 3. Deep List / Popper Mode */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-weaker">
          3. Deep List &amp; Popper Positioning
        </h2>
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-text-strong">
              Popper Mode (Anchored below/above)
            </span>
            <Select value={longList} onValueChange={setLongList}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start" className="w-64">
                <SelectGroup>
                  <SelectLabel>Batch 1 (1–10)</SelectLabel>
                  {Array.from({ length: 10 }, (_, i) => (
                    <SelectItem key={`item-${i + 1}`} value={`theme-${i + 1}`}>
                      Config Option #{i + 1}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Batch 2 (11–20)</SelectLabel>
                  {Array.from({ length: 10 }, (_, i) => (
                    <SelectItem key={`item-${i + 11}`} value={`theme-${i + 11}`}>
                      Config Option #{i + 11}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </div>
  )
}
