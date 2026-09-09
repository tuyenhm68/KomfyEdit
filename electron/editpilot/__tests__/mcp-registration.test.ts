import { describe, it, expect } from 'vitest'
import { EDIT_PILOT_AGENTS } from '../../../core/src/editpilot-agents'

describe('persistent MCP registration', () => {
  const args = EDIT_PILOT_AGENTS.antigravity.mcpRegisterArgs ?? []

  it('runs the Electron binary as plain Node', () => {
    // Verified against the real server: launched without this, the process
    // starts as a GUI app, never speaks MCP, and exits silently — so the agent
    // sees no timeline tools and reaches for the filesystem instead.
    const pairs = args.reduce<string[]>((acc, arg, i) => (
      args[i - 1] === '--env' ? [...acc, arg] : acc
    ), [])
    expect(pairs).toContain('ELECTRON_RUN_AS_NODE=1')
    expect(pairs).toContain('KOMFYEDIT_MCP_PROFILE=edit')
  })

  it('keeps every flag ahead of the positional arguments', () => {
    // `agy mcp add` rejects a flag placed after <name>.
    const firstPositional = args.indexOf('{name}')
    expect(firstPositional).toBeGreaterThan(-1)
    expect(args.lastIndexOf('--env')).toBeLessThan(firstPositional)
  })

  it('is the only agent that registers persistently', () => {
    expect(EDIT_PILOT_AGENTS.claude.mcpRegisterArgs).toBeNull()
    expect(EDIT_PILOT_AGENTS.codex.mcpRegisterArgs).toBeNull()
  })
})

describe('framing channel per agent', () => {
  it('gives every agent some way to receive the framing', () => {
    for (const definition of Object.values(EDIT_PILOT_AGENTS)) {
      const hasChannel = Boolean(definition.systemPromptFlag || definition.projectDocFile)
      expect(hasChannel, `${definition.id} has no framing channel`).toBe(true)
    }
  })
})

describe('framing actually reaches the model', () => {
  it('keeps folding it in for Antigravity, whose doc-file support is unconfirmed', () => {
    // Trusting the file alone left a real run with no framing at all, and the
    // agent went for a shell command on a request about the timeline.
    expect(EDIT_PILOT_AGENTS.antigravity.foldFramingIntoPrompt).toBe(true)
  })

  it('does not fold it in for CLIs with a confirmed channel', () => {
    expect(EDIT_PILOT_AGENTS.claude.foldFramingIntoPrompt).toBe(false)
    expect(EDIT_PILOT_AGENTS.codex.foldFramingIntoPrompt).toBe(false)
  })
})
