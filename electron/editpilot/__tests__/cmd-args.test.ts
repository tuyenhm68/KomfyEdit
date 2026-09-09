import { describe, it, expect } from 'vitest'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildWindowsSpawn, flattenArgsForCmd, resolveWindowsExecutable, buildSpawnPlan } from '../windows-spawn'
import { buildEditPilotSystemPrompt } from '../../../core/src/editpilot-prompt'

/**
 * Regression guard for the bug that made EditPilot look broken: the system
 * prompt is multi-line, and a newline inside an argument makes `cmd.exe /c`
 * truncate that argument and drop every argument after it — which silently
 * removed `--mcp-config` and `--allowedTools`, so the agent ran with no tools.
 */
describe('flattenArgsForCmd', () => {
  it('removes newlines so nothing downstream is dropped', () => {
    const flattened = flattenArgsForCmd(['a\nb', '--flag', 'sau'])
    expect(flattened[0]).not.toMatch(/\n/)
    expect(flattened).toHaveLength(3)
    expect(flattened[1]).toBe('--flag')
  })

  it('keeps both halves of the text rather than truncating', () => {
    const [flattened] = flattenArgsForCmd(['DONG1\nDONG2'])
    expect(flattened).toContain('DONG1')
    expect(flattened).toContain('DONG2')
  })

  it('handles CRLF as well as LF', () => {
    const [flattened] = flattenArgsForCmd(['a\r\nb'])
    expect(flattened).not.toMatch(/[\r\n]/)
  })

  it('leaves single-line arguments untouched', () => {
    expect(flattenArgsForCmd(['--mcp-config', 'C:/x/y.json'])).toEqual(['--mcp-config', 'C:/x/y.json'])
  })

  it('flattens the real system prompt, which is multi-line by design', () => {
    const prompt = buildEditPilotSystemPrompt({ projectId: 'p1' })
    expect(prompt).toMatch(/\n/) // the source really is multi-line
    expect(flattenArgsForCmd([prompt])[0]).not.toMatch(/\n/)
  })
})

// The truncation is a cmd.exe behaviour, so prove it on the platform that has it.
describe.runIf(process.platform === 'win32')('cmd.exe argument truncation', () => {
  const printer = path.join(os.tmpdir(), `argprint-${Date.now()}.cjs`)

  function argvThroughCmd(args: string[]): string[] {
    fs.writeFileSync(printer, 'console.log(JSON.stringify(process.argv.slice(2)))')
    const result = spawnSync('cmd.exe', ['/c', process.execPath, printer, ...args], { encoding: 'utf8' })
    try { fs.unlinkSync(printer) } catch { /* best effort */ }
    try { return JSON.parse(result.stdout.trim() || '[]') } catch { return [] }
  }

  it('drops everything after a newline — the bug this guards against', () => {
    const received = argvThroughCmd(['DONG1\nDONG2', '--mcp-config', 'x.json'])
    expect(received).toEqual(['DONG1'])
    expect(received).not.toContain('--mcp-config')
  })

  // Note: flattening alone is not enough on the naive `cmd /c <exe> <args>` form —
  // that shape also mangles paths with spaces. buildWindowsSpawn below is what the
  // runner uses, and its tests cover the flattened case end to end.
})

describe.runIf(process.platform === 'win32')('buildWindowsSpawn quoting', () => {
  const printer = path.join(os.tmpdir(), `argprint2-${Date.now()}.cjs`)

  function argvThrough(command: string, args: string[]): string[] {
    fs.writeFileSync(printer, 'console.log(JSON.stringify(process.argv.slice(2)))')
    const plan = buildWindowsSpawn(command, [printer, ...args])
    const result = spawnSync(plan.file, plan.args, {
      encoding: 'utf8',
      windowsVerbatimArguments: plan.verbatim,
    })
    try { fs.unlinkSync(printer) } catch { /* best effort */ }
    try { return JSON.parse(result.stdout.trim() || '[]') } catch { return [] }
  }

  it('survives a command path containing a space', () => {
    // process.execPath is usually C:\Program Files\nodejs\node.exe — the exact
    // shape that made cmd.exe report "'C:\Program' is not recognized".
    expect(argvThrough(process.execPath, ['plain'])).toEqual(['plain'])
  })

  it('survives arguments containing spaces, including the last one', () => {
    // The old form only worked while the final argument had no spaces.
    expect(argvThrough(process.execPath, ['a b', '--flag', 'x y'])).toEqual(['a b', '--flag', 'x y'])
  })

  it('keeps later arguments when an earlier one is multi-line', () => {
    const received = argvThrough(process.execPath, ['DONG1' + String.fromCharCode(10) + 'DONG2', '--mcp-config', 'x.json'])
    expect(received).toHaveLength(3)
    expect(received[1]).toBe('--mcp-config')
  })
})

describe.runIf(process.platform === 'win32')('buildSpawnPlan native exe resolution', () => {
  it('resolves direct .exe for node or existing commands', () => {
    const resolved = resolveWindowsExecutable(process.execPath)
    expect(resolved).toBeTruthy()
    expect(resolved?.toLowerCase()).toMatch(/\.exe$/)
  })

  it('bypasses cmd.exe when an .exe is available, allowing long arguments', () => {
    const plan = buildSpawnPlan(process.execPath, ['-e', 'console.log("ok")'])
    // Should run process.execPath directly, not cmd.exe
    expect(plan.file).toBe(process.execPath)
    expect(plan.verbatim).toBe(false)
  })

  it('can pass arguments longer than 8191 characters when spawning direct .exe', () => {
    // 12,000 characters would trigger "The command line is too long" in cmd.exe
    const longArg = 'a'.repeat(12000)
    const plan = buildSpawnPlan(process.execPath, ['-e', 'console.log(process.argv[1].length)', longArg])
    expect(plan.file).toBe(process.execPath)

    const result = spawnSync(plan.file, plan.args, { encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('12000')
  })
})

