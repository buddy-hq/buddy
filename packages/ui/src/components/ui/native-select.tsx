import * as React from "react"

import { cn } from "@buddy/ui/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { UnfoldMoreIcon } from "@hugeicons/core-free-icons"

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
  wrapperClassName?: string
}

function NativeSelect({
  className,
  wrapperClassName,
  size = "default",
  ...props
}: NativeSelectProps) {
  return (
    <div
      className={cn(
        "group/native-select relative w-fit overflow-hidden rounded-lg has-[select:disabled]:opacity-50",
        wrapperClassName,
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "border-border-base data-placeholder:text-text-weak bg-input-base hover:bg-input-hover focus-visible:border-border-interactive-base focus-visible:ring-border-interactive-base/50 aria-invalid:ring-border-critical-base/35 aria-invalid:border-border-critical-base text-text-base w-full min-w-0 appearance-none rounded-lg border py-2 pr-9 pl-2.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-[background-color,border-color,color,box-shadow] select-none whitespace-nowrap outline-none focus-visible:ring-2 aria-invalid:ring-3 data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-[size=sm]:py-0.5 disabled:pointer-events-none disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
      <div
        className="bg-surface-weak/45 text-text-weak group-hover/native-select:bg-surface-weak/70 group-focus-within/native-select:bg-surface-weak/70 group-focus-within/native-select:text-text-base pointer-events-none absolute top-1/2 right-1.5 flex h-4.5 w-4.5 -translate-y-1/2 items-center justify-center rounded-[6px] transition-colors"
        aria-hidden="true"
        data-slot="native-select-icon-wrapper"
      >
        <HugeiconsIcon
          icon={UnfoldMoreIcon}
          strokeWidth={2}
          className="size-3.5 select-none"
          aria-hidden="true"
          data-slot="native-select-icon"
        />
      </div>
    </div>
  )
}

function NativeSelectOption({ ...props }: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<"optgroup">) {
  return <optgroup data-slot="native-select-optgroup" className={cn(className)} {...props} />
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
