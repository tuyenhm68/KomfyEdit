import { describe, it, expect } from 'vitest'
import { buildArgs, BLOCKED_TOOLS } from '../agent-runner'
import { EDIT_PILOT_AGENTS } from '../../../core/src/editpilot-agents'

const SYS = 'Bạn là trợ lý dựng phim.'

describe('buildArgs — tool blocking (S5-7)', () => {
  it('blocks the CLI toolbox for Claude, which supports it', () => {
    const args = buildArgs(EDIT_PILOT_AGENTS.claude, 'xin chào', SYS, 'C:/tmp/mcp.json')
    const index = args.indexOf('--disallowedTools')
    expect(index).toBeGreaterThan(-1)
    expect(args[index + 1]).toBe(BLOCKED_TOOLS)
  })

  it('blocks shell tools by every name they go by', () => {
    // Blocking `Read` alone was not enough: the agent reached for `PowerShell`.
    for (const tool of ['Bash', 'PowerShell', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch']) {
      expect(BLOCKED_TOOLS.split(',')).toContain(tool)
    }
  })

  it(`never blocks KomfyEdit own MCP tools`, () => {
    expect(BLOCKED_TOOLS).not.toMatch(/komfyedit/i)
    expect(BLOCKED_TOOLS).not.toMatch(/mcp__/)
  })

  it('omits the flag for CLIs that do not have one', () => {
    for (const id of ['codex', 'antigravity'] as const) {
      const args = buildArgs(EDIT_PILOT_AGENTS[id], 'xin chào', SYS, null)
      expect(args).not.toContain('--disallowedTools')
    }
  })
})

describe('buildArgs — system prompt', () => {
  it('passes the framing as a flag when the CLI has one', () => {
    const args = buildArgs(EDIT_PILOT_AGENTS.claude, 'xin chào', SYS, 'C:/tmp/mcp.json')
    const index = args.indexOf('--append-system-prompt')
    expect(index).toBeGreaterThan(-1)
    expect(args[index + 1]).toBe(SYS)
    // The user prompt stays its own argument, unmerged.
    expect(args).toContain('xin chào')
  })

  it('folds the framing into the prompt when the CLI has no flag and no doc file', () => {
    const bare = {
      ...EDIT_PILOT_AGENTS.antigravity,
      systemPromptFlag: null,
      projectDocFile: null,
      foldFramingIntoPrompt: false,
    }
    const args = buildArgs(bare, 'xin chào', SYS, null)
    const prompt = args.find(arg => arg.includes('xin chào'))
    expect(prompt).toBeDefined()
    expect(prompt).toContain(SYS)
  })
})

describe('buildArgs — MCP wiring', () => {
  const target = {
    serverName: 'komfyedit',
    command: 'C:\\node.exe',
    args: ['C:\\entry.js'],
    env: { KOMFYEDIT_MCP_PROFILE: 'edit' },
  }

  it('passes a config file to the CLI that takes one', () => {
    const args = buildArgs(EDIT_PILOT_AGENTS.claude, 'xin chào', SYS, 'C:/tmp/mcp.json', null, target)
    expect(args).toContain('--mcp-config')
    // Claude takes the file; the inline form is not its shape.
    expect(args.join(' ')).not.toContain('mcp_servers.')
  })

  it('passes the server as inline overrides to Codex, which has no file flag', () => {
    const args = buildArgs(EDIT_PILOT_AGENTS.codex, 'xin chào', SYS, null, null, target)
    expect(args.filter(arg => arg === '-c')).toHaveLength(3)
    expect(args.join(' ')).toContain("mcp_servers.komfyedit.command='C:\\node.exe'")
  })

  it('lets Codex start outside a git repo, since the run has its own scratch dir', () => {
    const args = buildArgs(EDIT_PILOT_AGENTS.codex, 'xin chào', SYS, null)
    expect(args).toContain('--skip-git-repo-check')
    // The flag has to precede the positional prompt or Codex reads it as one.
    expect(args.indexOf('--skip-git-repo-check')).toBeLessThan(
      args.findIndex(arg => arg.includes('xin chào')),
    )
  })

  /**
   * `codex exec` pins approval to `never`, and an MCP tool call needs an
   * approval that never arrives: every call failed with `MCP tool call
   * requires approval, but approval policy is never`, so the agent reported
   * that its permissions blocked access to the video.
   */
  it('lets Codex approve its own MCP calls, which exec cannot ask a human for', () => {
    const args = buildArgs(EDIT_PILOT_AGENTS.codex, 'xin chào', SYS, null, null, target)
    expect(args).toContain('--approve-for-me')
    expect(args.indexOf('--approve-for-me')).toBeLessThan(
      args.findIndex(arg => arg.includes('xin chào')),
    )
    // The blunt instrument stays out: it drops the sandbox entirely.
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox')
  })
})
