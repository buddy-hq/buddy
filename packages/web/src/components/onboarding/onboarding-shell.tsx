import type { ReactNode } from "react"
import { cn } from "@buddy/ui"
import type { OnboardingShellProps } from "./types"

function ShellBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_34%),radial-gradient(circle_at_85%_20%,_rgba(120,166,255,0.18),_transparent_26%),linear-gradient(160deg,_#080b14_0%,_#0b1020_54%,_#07090f_100%)]" />
      <div className="absolute inset-0 opacity-[0.22] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
      <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-indigo-500/10 blur-3xl" />
    </div>
  )
}

function FrameHeader(props: { eyebrow?: ReactNode; title: ReactNode; description: ReactNode }) {
  return (
    <div className="space-y-5">
      {props.eyebrow ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
          {props.eyebrow}
        </div>
      ) : null}
      <div className="space-y-3">
        <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          {props.title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
          {props.description}
        </p>
      </div>
    </div>
  )
}

export function OnboardingShell(props: OnboardingShellProps) {
  return (
    <div className={cn("relative min-h-full overflow-hidden text-white", props.className)}>
      <ShellBackdrop />
      <div className="relative mx-auto flex min-h-full w-full max-w-7xl flex-col px-6 py-8 sm:px-8 lg:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/buddy-icon.png"
              alt=""
              className="h-10 w-10 rounded-2xl shadow-2xl shadow-sky-500/20"
            />
            <div>
              <p className="text-sm font-medium tracking-[0.24em] text-white/55 uppercase">Buddy</p>
              <p className="text-xs text-white/45">Desktop first-run setup</p>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center py-8 sm:py-10">
          <div className="grid min-h-0 w-full gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="flex min-h-0 flex-col justify-center">
              <FrameHeader
                eyebrow={props.eyebrow ?? "Welcome"}
                title={props.title}
                description={props.description}
              />
              <div className="mt-8 hidden max-w-lg grid-cols-3 gap-4 text-sm text-white/65 sm:grid">
                <div className="rounded-2xl border border-white/8 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/45">1</p>
                  <p className="mt-2 font-medium text-white">Splash</p>
                  <p className="mt-1 text-white/60">Set the tone before the app opens.</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/45">2</p>
                  <p className="mt-2 font-medium text-white">Auth</p>
                  <p className="mt-1 text-white/60">Choose ChatGPT Plus or free models.</p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/5 p-4 backdrop-blur-sm">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/45">3</p>
                  <p className="mt-2 font-medium text-white">Folder</p>
                  <p className="mt-1 text-white/60">Point Buddy at the first notebook.</p>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 items-center lg:justify-end">
              <div className="w-full max-w-xl rounded-[32px] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6">
                {props.children}
                {props.footer ? <div className="mt-6">{props.footer}</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
