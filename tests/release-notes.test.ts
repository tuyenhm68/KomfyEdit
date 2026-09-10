import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { extractVersionSection, composeReleaseNotes } = require('../scripts/release-notes.cjs')

/**
 * The changelog section for a version becomes the GitHub Release body, and
 * electron-updater hands that same text to the in-app update prompt. Cutting
 * the wrong slice out of the file therefore reaches users, so the boundaries
 * are pinned here.
 */

const ROOT = path.resolve(__dirname, '..')

const sample = `# Changelog

## [Unreleased]

### Fixed
- Not released yet.

## [1.2.0] - 2026-01-02

### Added
- Added A.

### Fixed
- Fixed B.

## [1.1.9] - 2025-12-30

- Older.
`

describe('extractVersionSection', () => {
  it('takes the section and stops at the next version', () => {
    const section = extractVersionSection(sample, '1.2.0')
    expect(section).toContain('Added A.')
    expect(section).toContain('Fixed B.')
    expect(section).not.toContain('Older.')
    expect(section).not.toContain('Not released yet.')
  })

  it('does not confuse a version with one that merely starts the same', () => {
    // "1.1.9" must not be matched by a request for "1.1"
    expect(extractVersionSection(sample, '1.1')).toBeNull()
  })

  it('accepts a leading v on the heading', () => {
    expect(extractVersionSection('## [v2.0.0]\n- x\n', '2.0.0')).toBe('- x')
  })

  it('returns null for a version that is not there', () => {
    expect(extractVersionSection(sample, '9.9.9')).toBeNull()
  })

  it('returns an empty string for a heading with nothing under it', () => {
    expect(extractVersionSection('## [1.0.0]\n\n## [0.9.0]\n- x\n', '1.0.0')).toBe('')
  })
})

describe('composeReleaseNotes', () => {
  it('puts what changed above the download guide', () => {
    const body = composeReleaseNotes('### Fixed\n- Fixed B.', '### Which file do I download?\n- Windows: setup.exe')
    expect(body.indexOf('Fixed B.')).toBeLessThan(body.indexOf('Which file do I download?'))
    expect(body).toContain('\n---\n')
  })

  it('leaves out the separator when there is no guide', () => {
    expect(composeReleaseNotes('- just this', '')).toBe('- just this\n')
  })
})

describe('the repository changelog', () => {
  it('describes the version in package.json', () => {
    const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
    const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')
    // The same check the release workflow runs before it builds anything.
    expect(extractVersionSection(changelog, version)).toBeTruthy()
  })
})
