import { describe, it, expect } from 'vitest'
import { pathToFileUrl } from '../file-url'

/**
 * Media reaches the renderer two ways, and they need different URLs.
 *
 * A user's own file is an absolute path and loads over `file://`. An asset that
 * ships inside the app — a sticker — is stored relative, because it has no
 * fixed home on the user's disk. Sending that through `file://` resolves it
 * against the root of the drive, which loads nothing: the sticker sat on the
 * timeline but never appeared in the preview.
 */

describe('pathToFileUrl', () => {
  it('keeps a bundled sticker relative to the page', () => {
    expect(pathToFileUrl('stickers/fire.png')).toBe('./stickers/fire.png')
    expect(pathToFileUrl('stickers\\fire.png')).toBe('./stickers/fire.png')
  })

  it('never turns a bundled path into a drive-root file URL', () => {
    expect(pathToFileUrl('stickers/fire.png')).not.toContain('file://')
  })

  it('still builds a file URL for a POSIX path', () => {
    expect(pathToFileUrl('/Users/me/clip.mp4')).toBe('file:///Users/me/clip.mp4')
  })

  it('still builds a file URL for a Windows path', () => {
    // The drive colon comes out percent-encoded. That is long-standing
    // behaviour which Electron accepts; the doc comment claimed otherwise and
    // was simply wrong.
    expect(pathToFileUrl('C:\\Users\\me\\clip.mp4')).toBe('file:///C%3A/Users/me/clip.mp4')
  })

  it('encodes each segment without eating the separators', () => {
    expect(pathToFileUrl('/Users/me/my file.mp4')).toBe('file:///Users/me/my%20file.mp4')
    expect(pathToFileUrl('C:\\Users\\me\\video#1.mp4')).toBe('file:///C%3A/Users/me/video%231.mp4')
    expect(pathToFileUrl('stickers/my sticker.png')).toBe('./stickers/my%20sticker.png')
  })
})
