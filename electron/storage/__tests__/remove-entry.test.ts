import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { removeEntry, removeEntryQuietly } from '../remove-entry'

/*
 * These all pass with `fs.rmSync(target, { recursive: true, force: true })` for
 * ASCII names and fail silently for the rest, which is exactly what made the
 * bug invisible: every cache the app offers to clear reported success and
 * stayed on disk for anyone whose Windows account name is not plain ASCII.
 */
describe('removeEntry', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'komfyedit-remove-'))
  })
  afterEach(() => {
    // Its own clean-up uses the function under test, since rmSync cannot be
    // trusted with the very names these tests create.
    removeEntryQuietly(dir)
  })

  const writeFile = (relative: string, body = 'x') => {
    const target = path.join(dir, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, body, 'utf8')
    return target
  }

  it('removes a plain file', () => {
    const target = writeFile('plain.txt')
    removeEntry(target)
    expect(fs.existsSync(target)).toBe(false)
  })

  it('removes a file whose name carries Vietnamese characters', () => {
    const target = writeFile('Xoá bộ nhớ đệm.mp4')
    removeEntry(target)
    expect(fs.existsSync(target)).toBe(false)
  })

  it('removes a whole tree, however deep', () => {
    writeFile('cache/a.mp4')
    writeFile('cache/nested/deep/b.mp4')
    const target = path.join(dir, 'cache')

    removeEntry(target)
    expect(fs.existsSync(target)).toBe(false)
  })

  it('removes a folder whose name carries Vietnamese characters', () => {
    writeFile(path.join('Có nhạc (tpl-1)', 'media', 'beat.mp3'))
    const target = path.join(dir, 'Có nhạc (tpl-1)')

    removeEntry(target)
    expect(fs.existsSync(target)).toBe(false)
  })

  /*
   * The sharpest edge: the leaf is plain ASCII and it still fails, because the
   * bug is in the path as a whole. This is the shape of every cache entry under
   * `C:\\Users\\Nguyễn\\AppData\\…`, which is why clearing the cache freed
   * nothing for those users.
   */
  it('removes an ASCII entry that lives under a Vietnamese parent', () => {
    const file = writeFile(path.join('Nguyễn', 'cache', 'abc123.mp4'))
    removeEntry(file)
    expect(fs.existsSync(file)).toBe(false)

    const folder = path.join(dir, 'Nguyễn', 'cache')
    fs.mkdirSync(path.join(folder, 'more'), { recursive: true })
    removeEntry(folder)
    expect(fs.existsSync(folder)).toBe(false)
  })

  it('treats a path that is already gone as done, not as an error', () => {
    expect(() => removeEntry(path.join(dir, 'never-existed'))).not.toThrow()
  })

  it('leaves everything beside the target alone', () => {
    writeFile('keep.txt')
    const target = writeFile('drop.txt')

    removeEntry(target)
    expect(fs.readdirSync(dir)).toEqual(['keep.txt'])
  })

  it('swallows failure in the quiet form', () => {
    expect(() => removeEntryQuietly(path.join(dir, 'never-existed'))).not.toThrow()
  })
})
