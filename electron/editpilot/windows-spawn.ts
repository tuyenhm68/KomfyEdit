/**
 * Spawning a CLI on Windows so that cmd.exe actually parses the arguments.
 *
 * Two separate traps live here, both found by running the real thing:
 *
 * 1. `cmd.exe /c <exe> <args...>` strips the outer quote pair whenever the
 *    resulting line both begins and ends with a quote. A path with a space —
 *    `C:\Program Files\nodejs\node.exe` — then fails with
 *    `'C:\Program' is not recognized`. Earlier runs only survived because the
 *    last argument happened to have no spaces and so was not quoted.
 *
 * 2. A raw newline inside an argument terminates the command line: cmd keeps
 *    the text up to the newline and **silently drops every argument after it**.
 *    A multi-line system prompt therefore ate `--mcp-config` and
 *    `--allowedTools`, leaving the agent with no tools and no error.
 *
 * `/d /s /c` with one pre-quoted command line and `windowsVerbatimArguments`
 * fixes (1) — the same form npm and execa use. Nothing fixes (2), because cmd
 * has no escape for a newline, so arguments are flattened first.
 */

import fs from 'fs'
import path from 'path'

export interface WindowsSpawnPlan {
  file: string
  args: string[]
  /** Pass to `spawn` as `windowsVerbatimArguments`. */
  verbatim: boolean
}

/** Replacement for a newline inside an argument. Plain ASCII: cmd mangles the rest. */
const NEWLINE_REPLACEMENT = ' -- '

/**
 * Strip newlines so no argument is truncated and nothing after it is lost.
 * Safe to call on any platform; a no-op when there are no newlines.
 */
export function flattenArgsForCmd(args: string[]): string[] {
  return args.map(arg => arg.replace(/\r?\n/g, NEWLINE_REPLACEMENT))
}

function quote(value: string): string {
  return '"' + value.replace(/"/g, '\\"') + '"'
}

/**
 * Checks whether an npm .cmd wrapper points to an underlying .exe binary.
 * (e.g. %dp0%\node_modules\@anthropic-ai\claude-code\bin\claude.exe)
 */
function checkNestedExe(cmdPath: string): string | null {
  try {
    const dir = path.dirname(cmdPath)
    const baseName = path.basename(cmdPath, path.extname(cmdPath))
    const candidates = [
      path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
      path.join(dir, 'node_modules', baseName, 'bin', `${baseName}.exe`),
      path.join(dir, 'node_modules', '.bin', `${baseName}.exe`),
    ]
    for (const cand of candidates) {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
        return cand
      }
    }
  } catch {
    // Ignore disk inspection errors
  }
  return null
}

/**
 * Resolves an executable command to its direct binary path on Windows (e.g. .exe).
 * Spawning an .exe directly via Win32 CreateProcess bypasses cmd.exe entirely,
 * avoiding cmd.exe's 8,191-character command line limit (CreateProcess supports up to 32,767 chars)
 * and avoiding argument newline truncation.
 */
export function resolveWindowsExecutable(command: string): string | null {
  // If already absolute or relative path with extension
  if (path.isAbsolute(command) || command.includes(path.sep) || command.includes('/')) {
    if (fs.existsSync(command) && command.toLowerCase().endsWith('.exe')) return command
    if (fs.existsSync(command + '.exe')) return command + '.exe'
    if (fs.existsSync(command) && command.toLowerCase().endsWith('.cmd')) {
      const nested = checkNestedExe(command)
      if (nested) return nested
    }
  }

  const pathEnv = process.env.PATH || ''
  const pathDirs = pathEnv.split(path.delimiter)

  for (const dir of pathDirs) {
    if (!dir) continue
    const exePath = path.join(dir, command.toLowerCase().endsWith('.exe') ? command : command + '.exe')
    try {
      if (fs.existsSync(exePath) && fs.statSync(exePath).isFile()) {
        return exePath
      }
    } catch {}

    const cmdPath = path.join(dir, command.toLowerCase().endsWith('.cmd') ? command : command + '.cmd')
    try {
      if (fs.existsSync(cmdPath) && fs.statSync(cmdPath).isFile()) {
        const nested = checkNestedExe(cmdPath)
        if (nested) return nested
      }
    } catch {}
  }

  return null
}

/** Build the `cmd.exe` invocation for a command plus arguments. */
export function buildWindowsSpawn(command: string, args: string[]): WindowsSpawnPlan {
  const line = [command, ...flattenArgsForCmd(args)].map(quote).join(' ')
  return {
    file: 'cmd.exe',
    args: ['/d', '/s', '/c', '"' + line + '"'],
    verbatim: true,
  }
}

/**
 * The spawn plan for the current platform:
 * - On Windows: resolve directly to a native .exe when available to bypass cmd.exe's 8,191-char limit;
 *   fallback to cmd.exe /c only when direct .exe cannot be located.
 * - On other platforms: spawn the command directly with clean argv.
 */
export function buildSpawnPlan(command: string, args: string[]): WindowsSpawnPlan {
  if (process.platform !== 'win32') {
    return { file: command, args, verbatim: false }
  }

  const directExe = resolveWindowsExecutable(command)
  if (directExe && directExe.toLowerCase().endsWith('.exe')) {
    return { file: directExe, args, verbatim: false }
  }

  return buildWindowsSpawn(command, args)
}
