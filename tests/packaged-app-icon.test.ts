import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

/**
 * The packaged app must carry the icon file, not just build with it.
 *
 * Windows draws a taskbar button from the window's own icon. With none, it
 * falls back to the window class icon, which Chromium registers from its own
 * embedded resource — the Electron logo — no matter what icon the exe carries.
 * That is exactly what shipped: `directories.buildResources` fed the installer
 * and stamped KomfyEdit.exe, nothing copied `icon.ico` into the app, and
 * createWindow() logged "No app icon found" on every packaged launch.
 *
 * createWindow() reads it from `process.resourcesPath`, which is where
 * `extraResources` puts it.
 */

const ROOT = path.resolve(__dirname, '..')

interface BuilderConfig {
  extraResources?: Array<{ from: string; to: string }>
  win?: { icon?: string }
}

const config = yaml.load(
  fs.readFileSync(path.join(ROOT, 'electron-builder.yml'), 'utf8'),
) as BuilderConfig

describe('packaged app icon', () => {
  it('ships icon.ico where the window loads it from', () => {
    const copied = (config.extraResources ?? []).find(entry => entry.from === 'resources/icon.ico')
    expect(copied, 'electron-builder.yml must copy resources/icon.ico into the app').toBeDefined()
    // `to` is relative to the app's resources directory, i.e. process.resourcesPath.
    expect(copied!.to).toBe('icon.ico')
  })

  it('ships icon.png too, for the platforms that use it', () => {
    const copied = (config.extraResources ?? []).find(entry => entry.from === 'resources/icon.png')
    expect(copied?.to).toBe('icon.png')
  })

  it('has the files it promises to copy', () => {
    expect(fs.existsSync(path.join(ROOT, 'resources', 'icon.ico'))).toBe(true)
    expect(fs.existsSync(path.join(ROOT, 'resources', 'icon.png'))).toBe(true)
  })

  it('still stamps the exe with the same icon', () => {
    expect(config.win?.icon).toBe('resources/icon.ico')
  })
})
