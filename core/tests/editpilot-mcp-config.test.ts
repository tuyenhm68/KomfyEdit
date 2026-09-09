import { describe, it, expect } from 'vitest'
import { buildInlineMcpConfigArgs, tomlString } from '../src/editpilot-mcp-config'

describe('tomlString', () => {
  it('uses a literal string so Windows backslashes survive as written', () => {
    expect(tomlString('C:\\Program Files\\nodejs\\node.exe')).toBe("'C:\\Program Files\\nodejs\\node.exe'")
  })

  it('falls back to an escaped basic string when a quote makes that impossible', () => {
    // TOML literal strings cannot contain a single quote at all.
    expect(tomlString("C:\\it's\\node.exe")).toBe('"C:\\\\it\'s\\\\node.exe"')
  })
})

describe('buildInlineMcpConfigArgs', () => {
  const target = {
    serverName: 'komfyedit',
    command: 'C:\\Program Files\\nodejs\\node.exe',
    args: ['C:\\app\\komfyedit-mcp.js'],
    env: { KOMFYEDIT_MCP_PROFILE: 'edit', KOMFYEDIT_LIVE_PORT: '5123' },
  }

  it('emits one flag per key, in flag/value pairs', () => {
    const args = buildInlineMcpConfigArgs('-c', target)
    expect(args).toEqual([
      '-c', "mcp_servers.komfyedit.command='C:\\Program Files\\nodejs\\node.exe'",
      '-c', "mcp_servers.komfyedit.args=['C:\\app\\komfyedit-mcp.js']",
      '-c', "mcp_servers.komfyedit.env={KOMFYEDIT_MCP_PROFILE = 'edit', KOMFYEDIT_LIVE_PORT = '5123'}",
    ])
  })

  it('omits the env table when there is nothing to set', () => {
    const args = buildInlineMcpConfigArgs('-c', { ...target, env: {} })
    expect(args.join(' ')).not.toContain('.env=')
  })
})
