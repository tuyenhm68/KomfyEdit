import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import { APP_USER_MODEL_ID, DEV_APP_USER_MODEL_ID, resolveAppUserModelId } from '../electron/app-identity'

/**
 * The AppUserModelID decides which icon Windows draws on the taskbar button.
 * Both halves of this rule were learned the hard way, so both are pinned here:
 * a packaged run must claim the installed app's id, and a dev run must not.
 */

const ROOT = path.resolve(__dirname, '..')
const builderConfig = yaml.load(
  fs.readFileSync(path.join(ROOT, 'electron-builder.yml'), 'utf8'),
) as { appId?: string }

describe('app user model id', () => {
  it('claims the installed app\'s identity when packaged', () => {
    expect(resolveAppUserModelId(true)).toBe(APP_USER_MODEL_ID)
  })

  it('stands beside it, not inside it, in dev', () => {
    expect(resolveAppUserModelId(false)).toBe(DEV_APP_USER_MODEL_ID)
    // Sharing the id folds the dev window into the installed app's taskbar
    // button, where it inherits that app's icon instead of showing its own.
    expect(resolveAppUserModelId(false)).not.toBe(APP_USER_MODEL_ID)
  })

  it('matches the appId the installer registers', () => {
    // A mismatch files notifications and jump lists under an identity no
    // shortcut owns, and Windows falls back to the running exe for the icon.
    expect(builderConfig.appId).toBe(APP_USER_MODEL_ID)
  })
})
