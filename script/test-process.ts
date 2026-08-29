import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { parseTErrorCode } from "./parse-values"

const TERMINATION_GRACE_PERIOD_MILLISECONDS = 5_000
const WINDOWS_FORCE_TERMINATION_FLAG = "/F"
const WINDOWS_PROCESS_TREE_FLAG = "/T"
const WINDOWS_PROCESS_ID_FLAG = "/PID"

export const TEST_PROCESS_SIGNALS = ["SIGHUP", "SIGINT", "SIGTERM"] as const

export type TestProcessSignal = (typeof TEST_PROCESS_SIGNALS)[number]

export type SupervisedTestProcessResult = {
  exitCode: number
  signal: TestProcessSignal | undefined
}

export type SupervisedTestProcessInput = {
  abortSignal?: AbortSignal
  command: readonly string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export function testProcessFailed(result: Pick<SupervisedTestProcessResult, "exitCode">): boolean {
  return result.exitCode !== 0
}

const SIGNAL_EXIT_CODES = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
} satisfies Readonly<Record<TestProcessSignal, number>>

function isTestProcessSignal(signal: NodeJS.Signals | null): signal is TestProcessSignal {
  return signal !== null && TEST_PROCESS_SIGNALS.some((candidate) => candidate === signal)
}

function isMissingProcessError<TError>(error: TError): boolean {
  return parseTErrorCode(error) === "ESRCH"
}

function signalPosixProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
  try {
    process.kill(-child.pid, signal)
  } catch (error) {
    if (!isMissingProcessError(error)) throw error
  }
}

function terminateWindowsProcessTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
  spawnSync(
    "taskkill",
    [
      WINDOWS_PROCESS_ID_FLAG,
      String(child.pid),
      WINDOWS_PROCESS_TREE_FLAG,
      WINDOWS_FORCE_TERMINATION_FLAG,
    ],
    { stdio: "ignore" },
  )
}

function signalChildTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (process.platform === "win32") {
    terminateWindowsProcessTree(child)
    return
  }
  signalPosixProcessGroup(child, signal)
}

function waitForExitWithin(
  exitPromise: Promise<unknown>,
  timeoutMilliseconds: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMilliseconds)
    void exitPromise.then(() => {
      clearTimeout(timeout)
      resolve(true)
    })
  })
}

async function terminateChildTree(
  child: ChildProcess,
  exitPromise: Promise<unknown>,
  signal: TestProcessSignal,
): Promise<void> {
  signalChildTree(child, signal)
  if (process.platform === "win32") {
    await exitPromise
    return
  }

  const exited = await waitForExitWithin(exitPromise, TERMINATION_GRACE_PERIOD_MILLISECONDS)
  if (exited) return
  signalChildTree(child, "SIGKILL")
  await exitPromise
}

export async function runSupervisedTestProcess(
  input: SupervisedTestProcessInput,
): Promise<SupervisedTestProcessResult> {
  const [executable, ...args] = input.command
  if (executable === undefined) throw new Error("A supervised test command is required")

  const child = spawn(executable, args, {
    cwd: input.cwd,
    detached: process.platform !== "win32",
    env: input.env,
    stdio: ["inherit", "inherit", "inherit"],
  })
  const exitPromise = new Promise<{
    exitCode: number | null
    signal: NodeJS.Signals | null
  }>((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (exitCode, signal) => resolve({ exitCode, signal }))
  })

  let receivedSignal: TestProcessSignal | undefined
  let terminationPromise: Promise<void> | undefined
  const signalHandlers = new Map<TestProcessSignal, () => void>()
  const requestTermination = (signal: TestProcessSignal): void => {
    receivedSignal ??= signal
    terminationPromise ??= terminateChildTree(child, exitPromise, receivedSignal)
  }
  for (const signal of TEST_PROCESS_SIGNALS) {
    const handler = () => requestTermination(signal)
    signalHandlers.set(signal, handler)
    process.once(signal, handler)
  }
  const abortHandler = () => requestTermination("SIGTERM")
  if (input.abortSignal !== undefined) {
    input.abortSignal.addEventListener("abort", abortHandler, { once: true })
    if (input.abortSignal.aborted) abortHandler()
  }

  try {
    const result = await exitPromise
    await terminationPromise
    const signal =
      receivedSignal ?? (isTestProcessSignal(result.signal) ? result.signal : undefined)
    return {
      exitCode: signal === undefined ? (result.exitCode ?? 1) : SIGNAL_EXIT_CODES[signal],
      signal,
    }
  } finally {
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler)
    }
    input.abortSignal?.removeEventListener("abort", abortHandler)
  }
}
