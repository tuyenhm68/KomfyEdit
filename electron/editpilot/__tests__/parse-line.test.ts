import { describe, it, expect } from 'vitest'
import { parseLine } from '../agent-runner'

/**
 * Fixtures captured from a real `claude -p --output-format stream-json` run
 * against KomfyEdit's own MCP config, not hand-written guesses at the shape.
 */
const INIT_LINE = '{"type":"system","subtype":"init","cwd":"C:\\\\Users\\\\x","session_id":"9ba88efc","tools":["Bash","Read"],"mcp_servers":[{"name":"komfyedit","status":"pending"}],"model":"claude-sonnet-4-6"}'

const ASSISTANT_LINE = JSON.stringify({
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'Failed to authenticate. API Error: 401 OAuth access token has expired.' }],
  },
  session_id: '9ba88efc',
})

const TOOL_USE_LINE = JSON.stringify({
  type: 'assistant',
  message: {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Đang xem project. ' },
      { type: 'tool_use', id: 'tu_1', name: 'mcp__komfyedit__project.list', input: {} },
    ],
  },
})

const RESULT_LINE = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: true,
  result: 'Failed to authenticate.',
  duration_ms: 1168,
})

describe('parseLine — Claude Code stream-json', () => {
  it('surfaces assistant text', () => {
    expect(parseLine('claude', ASSISTANT_LINE)?.text).toContain('401 OAuth access token has expired')
    expect(parseLine('claude', ASSISTANT_LINE)?.isFinal).toBe(false)
  })

  it('keeps text blocks and drops tool_use blocks from the same message', () => {
    const parsed = parseLine('claude', TOOL_USE_LINE)
    expect(parsed?.text).toBe('Đang xem project. ')
    expect(parsed?.text).not.toContain('tool_use')
  })

  it('marks the closing summary as final so the caller can drop the duplicate', () => {
    const parsed = parseLine('claude', RESULT_LINE)
    expect(parsed?.text).toContain('Failed to authenticate.')
    // The same sentence already arrived as an assistant message; without this
    // flag the panel printed every reply twice.
    expect(parsed?.isFinal).toBe(true)
  })

  it('stays quiet for protocol chatter the user should not see', () => {
    expect(parseLine('claude', INIT_LINE)).toBeNull()
    expect(parseLine('claude', '   ')).toBeNull()
    expect(parseLine('claude', JSON.stringify({ type: 'system', subtype: 'api_retry' }))).toBeNull()
  })

  it('passes through a non-JSON line rather than swallowing it', () => {
    // Silence looks like a hang; an unexpected line is better shown than lost.
    expect(parseLine('claude', 'command not found: claude')?.text).toBe('command not found: claude\n')
    expect(parseLine('claude', '{not json')?.text).toBe('{not json\n')
  })
})

describe('parseLine — plain-text CLIs', () => {
  it('passes Codex and Antigravity output straight through', () => {
    expect(parseLine('codex', 'Đã cắt 3 đoạn.')?.text).toBe('Đã cắt 3 đoạn.\n')
    expect(parseLine('antigravity', 'done')?.text).toBe('done\n')
  })

  it('does not try to interpret their JSON-looking lines', () => {
    const line = '{"type":"assistant"}'
    expect(parseLine('codex', line)?.text).toBe(`${line}\n`)
    // Only Claude emits a closing summary; nothing here should be marked final.
    expect(parseLine('codex', line)?.isFinal).toBe(false)
  })
})

describe('parseLine — CLI housekeeping', () => {
  it('drops the stdin notice Codex prints on every headless run', () => {
    expect(parseLine('codex', 'Reading additional input from stdin...')).toBeNull()
  })

  it('still passes through ordinary Codex output', () => {
    expect(parseLine('codex', 'Đã cắt 3 clip.')?.text).toContain('Đã cắt 3 clip.')
  })
})
