import { describe, it, expect } from 'vitest'
import {
  DEFAULT_EDIT_PILOT_CONFIG,
  EDIT_PILOT_AGENTS,
  EDIT_PILOT_AGENT_IDS,
  listAgentDefinitions,
  parseEditPilotConfig,
  resolveActiveAgent,
  type EditPilotAgentStatus,
} from '../src/editpilot-agents'

const status = (
  id: EditPilotAgentStatus['id'],
  installed: boolean,
  version: string | null = installed ? '1.0.0' : null,
): EditPilotAgentStatus => ({
  id,
  installed,
  command: installed ? id : null,
  version,
  error: installed ? null : 'Không tìm thấy',
})

describe('EditPilot agent registry', () => {
  it('defines every advertised agent, keyed consistently', () => {
    expect(listAgentDefinitions()).toHaveLength(EDIT_PILOT_AGENT_IDS.length)
    for (const id of EDIT_PILOT_AGENT_IDS) {
      const definition = EDIT_PILOT_AGENTS[id]
      expect(definition.id).toBe(id)
      expect(definition.commands.length).toBeGreaterThan(0)
      expect(definition.versionArgs.length).toBeGreaterThan(0)
      // The prompt placeholder must survive into the spawn args, or the CLI
      // would be launched with no work to do.
      expect(definition.headlessArgs.join(' ')).toContain('{prompt}')
      // A CLI either takes an MCP config per run or registers servers once —
      // never both, and claiming both would mean one path is dead.
      expect(definition.mcpConfigFlag === null || definition.mcpRegisterArgs === null).toBe(true)
    }
  })

  it('drives Antigravity through `agy`, whose MCP servers are registered once', () => {
    const agy = EDIT_PILOT_AGENTS.antigravity
    // Detection tries commands in order, and the real binary on disk is `agy`.
    expect(agy.commands[0]).toBe('agy')
    expect(agy.headlessArgs[0]).toBe('-p')
    // `agy` has no --mcp-config; it uses `agy mcp add <name> <command> [args]`.
    expect(agy.mcpConfigFlag).toBeNull()
    expect(agy.mcpRegisterArgs).not.toBeNull()
    const args = agy.mcpRegisterArgs!
    expect(args.slice(0, 2)).toEqual(['mcp', 'add'])
    // Flags must precede the positional name — `agy mcp add --help` rejects
    // a flag placed after it.
    expect(args.indexOf('--env')).toBeLessThan(args.indexOf('{name}'))
    expect(args.slice(-3)).toEqual(['{name}', '{command}', '{entry}'])
  })
})

describe('parseEditPilotConfig', () => {
  it('falls back to "not configured" for junk on disk', () => {
    expect(parseEditPilotConfig(undefined)).toEqual(DEFAULT_EDIT_PILOT_CONFIG)
    expect(parseEditPilotConfig('nonsense')).toEqual(DEFAULT_EDIT_PILOT_CONFIG)
    expect(parseEditPilotConfig({ defaultAgentId: 'gemini' })).toEqual(DEFAULT_EDIT_PILOT_CONFIG)
  })

  it('keeps a valid stored choice and its overrides', () => {
    const parsed = parseEditPilotConfig({
      defaultAgentId: 'codex',
      commandOverrides: { codex: 'D:/tools/codex.cmd' },
    })
    expect(parsed.defaultAgentId).toBe('codex')
    expect(parsed.commandOverrides.codex).toBe('D:/tools/codex.cmd')
  })
})

describe('resolveActiveAgent', () => {
  const allInstalled = [status('claude', true), status('codex', true), status('antigravity', true)]

  it('uses the explicit choice when it is installed', () => {
    const config = { defaultAgentId: 'codex' as const, commandOverrides: {} }
    expect(resolveActiveAgent(config, allInstalled)).toBe('codex')
  })

  it('falls back to an installed agent when the chosen one is missing', () => {
    const config = { defaultAgentId: 'codex' as const, commandOverrides: {} }
    const statuses = [status('claude', true), status('codex', false), status('antigravity', false)]
    expect(resolveActiveAgent(config, statuses)).toBe('claude')
  })

  it('keeps the explicit choice when detection found nothing at all', () => {
    // Detection can fail for reasons that are not the user's fault (a probe
    // timeout, a locked-down PATH). Do not silently discard their choice.
    const config = { defaultAgentId: 'claude' as const, commandOverrides: {} }
    const statuses = [status('claude', false), status('codex', false), status('antigravity', false)]
    expect(resolveActiveAgent(config, statuses)).toBe('claude')
  })

  it('auto-selects the first installed agent when nothing is chosen', () => {
    expect(resolveActiveAgent(DEFAULT_EDIT_PILOT_CONFIG, allInstalled)).toBe('claude')
    expect(resolveActiveAgent(DEFAULT_EDIT_PILOT_CONFIG, [
      status('claude', false), status('codex', true), status('antigravity', false),
    ])).toBe('codex')
  })

  it('returns null when nothing is chosen and nothing is installed', () => {
    expect(resolveActiveAgent(DEFAULT_EDIT_PILOT_CONFIG, [
      status('claude', false), status('codex', false), status('antigravity', false),
    ])).toBeNull()
  })
})
