import { describe, it, expect } from 'vitest'
import { buildEditPilotSystemPrompt } from '../src/editpilot-prompt'

/**
 * The prompt is the whole reason the agent behaves like a video editor rather
 * than a coding agent, so these assertions are about the framing surviving —
 * not about exact wording.
 */
describe('buildEditPilotSystemPrompt', () => {
  it('states the role and rules out filesystem work', () => {
    const prompt = buildEditPilotSystemPrompt({ projectId: 'p1' })
    expect(prompt).toMatch(/dựng phim/i)
    expect(prompt).toMatch(/KHÔNG phải trợ lý lập trình/i)
    // The observed failure was the agent grepping the disk for a subtitle.
    expect(prompt).toMatch(/KHÔNG:/)
    expect(prompt).toMatch(/tìm kiếm file|thư mục trên đĩa/i)
    expect(prompt).toMatch(/lệnh shell/i)
  })

  it('names the tools and the mandatory write sequence', () => {
    const prompt = buildEditPilotSystemPrompt({ projectId: 'p1' })
    for (const tool of ['timeline_describe', 'subtitle_list', 'edit_propose', 'edit_apply', 'qc_check']) {
      expect(prompt).toContain(tool)
    }
    // propose must come before apply in the text, or the sequence reads wrong.
    expect(prompt.indexOf('edit_propose')).toBeLessThan(prompt.lastIndexOf('edit_apply'))
  })

  it('carries the exact case that failed, so the agent has a worked example', () => {
    const prompt = buildEditPilotSystemPrompt({ projectId: 'p1' })
    expect(prompt).toMatch(/hello/)
    expect(prompt).toMatch(/subtitle_list|timeline_describe/)
  })

  it('names the open project', () => {
    const prompt = buildEditPilotSystemPrompt({ projectId: 'project-42', projectName: 'Phim cưới' })
    expect(prompt).toContain('project-42')
    expect(prompt).toContain('Phim cưới')
  })

  it('says so when no project is open instead of staying silent', () => {
    const prompt = buildEditPilotSystemPrompt({ projectId: null })
    expect(prompt).toMatch(/Chưa có project nào đang mở/i)
  })

  it('lists referenced clips with their ids', () => {
    const prompt = buildEditPilotSystemPrompt({
      projectId: 'p1',
      references: [{ clipId: 'c-7', label: 'boy.png' }],
    })
    expect(prompt).toContain('c-7')
    expect(prompt).toContain('boy.png')
  })

  it('instructs agent to present plan in chat before execution', () => {
    const prompt = buildEditPilotSystemPrompt({ projectId: 'p1' })
    expect(prompt).toMatch(/TRƯỚC KHI THỰC HIỆN/i)
    expect(prompt).toMatch(/SAU KHI ĐƯA RA CÁCH LÀM MỚI BẮT ĐẦU GỌI TOOL/i)
  })

  it('strictly bans technical diffs and qc warnings from user chat', () => {
    const prompt = buildEditPilotSystemPrompt({ projectId: 'p1' })
    expect(prompt).toMatch(/TUYỆT ĐỐI KHÔNG DÙNG THUẬT NGỮ KỸ THUẬT/i)
    expect(prompt).toMatch(/Không bao giờ trình diff kỹ thuật hay báo cáo lỗi QC/i)
  })

  it('mentions keyframe capabilities and operations', () => {
    const prompt = buildEditPilotSystemPrompt({ projectId: 'p1' })
    expect(prompt).toContain('set_keyframes')
    expect(prompt).toContain('clear_keyframes')
  })

  it('mentions transcribe and contrasts it with observe_silence', () => {
    const prompt = buildEditPilotSystemPrompt({ projectId: 'p1' })
    expect(prompt).toContain('transcribe')
    expect(prompt).toMatch(/transcribe vs observe_silence/i)
    expect(prompt).toMatch(/ngữ nghĩa lời nói/i)
  })

  /**
   * The agent runs in an empty temp directory, so the repo's cut-silence skill
   * file never reaches it — whatever the run must obey has to be in here. The
   * observed failure: silences were measured, cut and reported as done, and the
   * user never saw which ranges were going before they went.
   */
  it('makes the silence checklist a blocking confirmation, not a sentence in the reply', () => {
    const prompt = buildEditPilotSystemPrompt({ projectId: 'p1' })
    const rules = prompt.slice(prompt.indexOf('CẮT KHOẢNG LẶNG'))

    expect(rules).toContain('ask_confirm')
    expect(rules).toMatch(/TRƯỚC edit_propose|trước khi cắt/i)
    // One entry per range, with its timecode and length — that is the checklist.
    expect(rules).toMatch(/MỘT item/i)
    expect(rules).toMatch(/tổng số đoạn|tổng thời lượng/i)
  })

  it('tells the agent to report what a shorter threshold would have caught', () => {
    const prompt = buildEditPilotSystemPrompt({ projectId: 'p1' })
    const rules = prompt.slice(prompt.indexOf('CẮT KHOẢNG LẶNG'))

    expect(rules).toContain('minDurationSec')
    expect(rules).toMatch(/ít hơn người dùng mong đợi/i)
  })
})
