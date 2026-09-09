import { describe, it, expect } from 'vitest'
import { addPermissionRule } from '../src/editpilot-permissions'

const RULE = 'mcp(komfyedit/*)'

describe('addPermissionRule', () => {
  it('appends the rule and leaves the rest of the file alone', () => {
    const before = JSON.stringify({
      permissions: { allow: ['command(Copy-Item)'] },
      trustedWorkspaces: ['C:\\Users\\ai'],
      statusLine: { enabled: false },
    }, null, 2)

    const patch = addPermissionRule(before, RULE)
    expect(patch.added).toBe(true)

    const after = JSON.parse(patch.json)
    expect(after.permissions.allow).toEqual(['command(Copy-Item)', RULE])
    // The user's other settings are theirs; nothing else may move.
    expect(after.trustedWorkspaces).toEqual(['C:\\Users\\ai'])
    expect(after.statusLine).toEqual({ enabled: false })
  })

  it('is a no-op when the rule is already there', () => {
    const before = JSON.stringify({ permissions: { allow: [RULE] } }, null, 2)
    const patch = addPermissionRule(before, RULE)
    expect(patch.added).toBe(false)
    expect(patch.json).toBe(before)
  })

  it('creates the permissions block when the file has none', () => {
    const patch = addPermissionRule(JSON.stringify({ statusLine: { enabled: true } }), RULE)
    expect(JSON.parse(patch.json).permissions.allow).toEqual([RULE])
  })

  it('handles a file that does not exist yet', () => {
    expect(JSON.parse(addPermissionRule('', RULE).json)).toEqual({ permissions: { allow: [RULE] } })
  })

  it('refuses to overwrite a file it cannot parse', () => {
    // This file belongs to the user; a broken parse must never become a
    // silently rewritten config.
    expect(() => addPermissionRule('{ not json', RULE)).toThrow(/Không đọc được/)
  })

  it('refuses when permissions or allow are the wrong shape', () => {
    expect(() => addPermissionRule('{"permissions": []}', RULE)).toThrow(/không phải một object/)
    expect(() => addPermissionRule('{"permissions": {"allow": "all"}}', RULE)).toThrow(/không phải một mảng/)
    expect(() => addPermissionRule('[]', RULE)).toThrow(/không phải một object/)
  })
})
