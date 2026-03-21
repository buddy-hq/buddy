import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const BACKEND_DIR = path.resolve(import.meta.dir, '..')
const DIST_DIR = path.resolve(BACKEND_DIR, 'dist/advanced-math-runtime')
const RUNTIME_SOURCE = path.resolve(BACKEND_DIR, 'src/local-runtimes/advanced-math/runtime/main.py')
const TARGET = process.env.BUDDY_RUST_TARGET ?? currentTargetTriple()
const VERSION =
  process.env.BUDDY_VERSION?.trim() || process.env.npm_package_version?.trim() || '0.0.1'
const EXECUTABLE_NAME = TARGET.includes('windows')
  ? 'buddy-advanced-math.exe'
  : 'buddy-advanced-math'
const BUNDLE_DIR_NAME = 'buddy-advanced-math'
const ASSET_NAME = `${EXECUTABLE_NAME}-v${VERSION}-${TARGET}.zip`
const PACKAGED_LIBRARY_NAMES = [
  'sympy',
  'numpy',
  'pandas',
  'xarray',
  'scipy',
  'matplotlib',
  'seaborn',
] as const

function currentTargetTriple() {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'aarch64-apple-darwin'
  if (process.platform === 'darwin' && process.arch === 'x64') return 'x86_64-apple-darwin'
  if (process.platform === 'linux' && process.arch === 'arm64') return 'aarch64-unknown-linux-gnu'
  if (process.platform === 'linux' && process.arch === 'x64') return 'x86_64-unknown-linux-gnu'
  if (process.platform === 'win32' && process.arch === 'x64') return 'x86_64-pc-windows-msvc'
  throw new Error(
    `Unsupported advanced math runtime build target: ${process.platform}/${process.arch}`,
  )
}

function run(command: string, args: string[], cwd?: string) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status === 0) {
    return
  }

  throw new Error(
    `${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`,
  )
}

function resolvePythonCommand() {
  const configured = process.env.BUDDY_ADVANCED_MATH_PYTHON?.trim()
  const candidates = configured
    ? [configured]
    : process.platform === 'win32'
      ? ['python', 'py']
      : ['python3', 'python']

  for (const candidate of candidates) {
    const versionArgs = candidate === 'py' ? ['-3', '--version'] : ['--version']
    const result = spawnSync(candidate, versionArgs, {
      stdio: 'ignore',
      env: process.env,
    })
    if (result.status === 0) {
      return candidate
    }
  }

  throw new Error('Python is required to build the advanced math runtime')
}

function pythonArgs(pythonCommand: string, args: string[]) {
  return pythonCommand === 'py' ? ['-3', ...args] : args
}

function sha256(filepath: string) {
  return createHash('sha256').update(readFileSync(filepath)).digest('hex')
}

function createArchive(sourceDir: string, outputArchive: string) {
  if (process.platform === 'win32') {
    run(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -LiteralPath '${sourceDir.replace(/'/g, "''")}' -DestinationPath '${outputArchive.replace(/'/g, "''")}' -Force`,
      ],
      BACKEND_DIR,
    )
    return
  }

  run(
    'ditto',
    ['-c', '-k', '--sequesterRsrc', '--keepParent', sourceDir, outputArchive],
    BACKEND_DIR,
  )
}

const pythonCommand = resolvePythonCommand()
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'buddy-advanced-math-build-'))
const venvDir = path.join(tempDir, 'venv')
const distDir = path.join(tempDir, 'dist')
const buildDir = path.join(tempDir, 'build')
const specDir = path.join(tempDir, 'spec')
const outputDir = path.join(DIST_DIR, TARGET)
const outputArchive = path.join(outputDir, ASSET_NAME)
const outputChecksum = `${outputArchive}.sha256`

rmSync(outputDir, { recursive: true, force: true })
mkdirSync(outputDir, { recursive: true })

try {
  run(pythonCommand, pythonArgs(pythonCommand, ['-m', 'venv', venvDir]))

  const venvPython =
    process.platform === 'win32'
      ? path.join(venvDir, 'Scripts', 'python.exe')
      : path.join(venvDir, 'bin', 'python')

  if (!existsSync(venvPython)) {
    throw new Error(`Virtualenv python not found at ${venvPython}`)
  }

  run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'])
  run(venvPython, [
    '-m',
    'pip',
    'install',
    'pyinstaller',
    'sympy',
    'numpy',
    'pandas',
    'xarray',
    'scipy',
    'matplotlib',
    'seaborn',
  ])
  run(venvPython, [
    '-m',
    'PyInstaller',
    '--noconfirm',
    '--clean',
    '--log-level',
    'WARN',
    '--onedir',
    '--name',
    BUNDLE_DIR_NAME,
    '--distpath',
    distDir,
    '--workpath',
    buildDir,
    '--specpath',
    specDir,
    ...PACKAGED_LIBRARY_NAMES.flatMap((libraryName) => ['--collect-all', libraryName]),
    RUNTIME_SOURCE,
  ])

  const builtBundleDir = path.join(distDir, BUNDLE_DIR_NAME)
  const builtBinary = path.join(builtBundleDir, EXECUTABLE_NAME)
  if (!existsSync(builtBinary)) {
    throw new Error(`Built advanced math runtime executable missing at ${builtBinary}`)
  }

  rmSync(outputArchive, { force: true })
  createArchive(builtBundleDir, outputArchive)
  writeFileSync(outputChecksum, `${sha256(outputArchive)}\n`, 'utf8')
  console.log(`Built advanced math runtime bundle at ${outputArchive}`)
  console.log(`Wrote checksum to ${outputChecksum}`)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
