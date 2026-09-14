import type { MarkdownBenchProperty } from "@/components/bench/markdown/property-values"
import { InfoIcon } from "@/icons/app-icons"

const MARKDOWN_BENCH_PROPERTY_LIST_SEPARATOR = ", "

function MarkdownBenchPropertyValue(props: { property: MarkdownBenchProperty }) {
  const { property } = props
  switch (property.kind) {
    case "checkbox":
      return property.checked ? "Yes" : "No"
    case "list":
    case "tags":
      if (property.items.length === 0) return <span className="text-text-weakest">Empty</span>
      return property.items.join(MARKDOWN_BENCH_PROPERTY_LIST_SEPARATOR)
    case "date":
    case "datetime":
      return (
        <time dateTime={property.iso} title={property.iso}>
          {property.text}
        </time>
      )
    case "number":
    case "text":
      return property.text || <span className="text-text-weakest">Empty</span>
  }
}

/** Title-row control that shows or hides the note's YAML properties. */
export function MarkdownBenchPropertiesToggle(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <button
      type="button"
      data-component="markdown-bench-properties-toggle"
      data-markdown-export-ignore
      aria-pressed={props.open}
      aria-label={props.open ? "Hide properties" : "Show properties"}
      className="m-0 shrink-0 border-0 bg-transparent p-0 text-text-weakest transition-colors duration-150 ease-out hover:text-text-weaker"
      onClick={() => {
        props.onOpenChange(!props.open)
      }}
    >
      <InfoIcon className="size-3.5" aria-hidden />
    </button>
  )
}

/** Quiet YAML table shown under the title after the info control is opened. */
export function MarkdownBenchPropertiesView(props: {
  properties: readonly MarkdownBenchProperty[]
}) {
  if (props.properties.length === 0) return null

  return (
    <div
      data-component="markdown-bench-properties"
      data-markdown-export-ignore
      className="pb-[1.25em] leading-[1.5] [font-size:calc(var(--buddy-font-size-base)*var(--markdown-bench-document-font-scale))]"
    >
      <table
        aria-label="Properties"
        className="w-full table-fixed border-collapse text-[0.8125em] text-text-weaker"
      >
        <tbody>
          {props.properties.map((property) => (
            <tr key={property.name}>
              <th
                scope="row"
                className="w-[34%] py-[0.2em] pr-[1em] pl-0 text-left align-top font-normal text-text-weakest [overflow-wrap:anywhere]"
              >
                {property.name}
              </th>
              <td className="py-[0.2em] align-top text-text-weaker [overflow-wrap:anywhere]">
                <MarkdownBenchPropertyValue property={property} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
