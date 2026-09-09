import { describe, it, expect } from 'vitest'
import { buildArgs, summarizeFailureDetail } from '../agent-runner'
import { EDIT_PILOT_AGENTS } from '../../../core/src/editpilot-agents'

const SYS = [
  'Bạn là trợ lý dựng phim bên trong KomfyEdit, một trình biên tập video.',
  'Bạn KHÔNG phải trợ lý lập trình và không làm việc trên mã nguồn.',
].join('\n')

describe('summarizeFailureDetail', () => {
  it('drops the turn a failing CLI replays on its way out', () => {
    // Shape observed from a real failed `codex exec`: it prints the whole
    // conversation back, and on Windows the framing arrives as one long line
    // because newlines inside an argument are flattened for cmd.exe.
    const stderr = [
      '--------',
      'user',
      SYS.replace(/\n/g, ' -- '),
      'ERROR: {"type":"invalid_request_error","message":"The model requires a newer version of Codex."}',
    ].join('\n')

    const detail = summarizeFailureDetail(stderr, [SYS, 'xin chào'])
    expect(detail).toBe('ERROR: {"type":"invalid_request_error","message":"The model requires a newer version of Codex."}')
    expect(detail).not.toContain('trợ lý dựng phim')
    expect(detail).not.toContain('user')
  })

  it('drops the user message echoed back too', () => {
    const stderr = ['user', 'xin chào bạn nhé', 'ERROR: không kết nối được'].join('\n')
    expect(summarizeFailureDetail(stderr, [SYS, 'xin chào bạn nhé'])).toBe('ERROR: không kết nối được')
  })

  it('keeps the real complaint when the CLI echoes nothing', () => {
    const stderr = 'command not found: codex'
    expect(summarizeFailureDetail(stderr, [SYS, 'xin chào'])).toBe('command not found: codex')
  })

  it('ignores echo needles too short to identify anything', () => {
    // A one-word prompt must not blank out every line that happens to use it.
    const stderr = 'ERROR: cắt thất bại'
    expect(summarizeFailureDetail(stderr, ['cắt'])).toBe('ERROR: cắt thất bại')
  })

  it('still caps how much of a noisy failure reaches the chat', () => {
    const stderr = Array.from({ length: 20 }, (_, i) => `dòng ${i + 1}`).join('\n')
    expect(summarizeFailureDetail(stderr, []).split('\n')).toHaveLength(6)
  })
})

describe('buildArgs — where the framing travels', () => {
  it('keeps the framing out of the message for a CLI that reads a project doc', () => {
    const args = buildArgs(EDIT_PILOT_AGENTS.codex, 'xin chào', SYS, null)
    const prompt = args.find(arg => arg.includes('xin chào'))
    expect(prompt).toBe('xin chào')
    expect(args.join(' ')).not.toContain('trợ lý dựng phim')
  })

  it('still folds the framing in for a CLI with neither a flag nor a doc file', () => {
    // No shipped agent is in this shape any more, so the fallback is exercised
    // against a stand-in rather than quietly going untested.
    const bare = {
      ...EDIT_PILOT_AGENTS.antigravity,
      systemPromptFlag: null,
      projectDocFile: null,
      foldFramingIntoPrompt: false,
    }
    const args = buildArgs(bare, 'xin chào', SYS, null)
    const prompt = args.find(arg => arg.includes('xin chào'))
    expect(prompt).toContain(SYS)
  })
})
