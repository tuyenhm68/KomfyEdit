import { app, dialog, shell } from 'electron'
import type { AppUpdater } from 'electron-updater'
import { logger } from './logger'
import { getMainWindow } from './window'

/**
 * Auto-update against GitHub Releases.
 *
 * The publish target lives in electron-builder.yml; electron-builder writes it
 * into `app-update.yml` inside the packaged app, which is the only place
 * electron-updater reads it from. That file does not exist in a dev run, so
 * every entry point here is a no-op unless the app is packaged — otherwise
 * electron-updater throws on the first check.
 *
 * Downloads are opt-in: an update that arrives without asking is a surprise
 * download on someone's metered connection, and an editor mid-export is the
 * worst moment to spend bandwidth.
 */

/** `dialog.showMessageBox` is modal to a window when there is one, free-floating otherwise. */
function showMessageBox(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  const window = getMainWindow()
  return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options)
}

let updaterInstance: AppUpdater | null = null
let checkInFlight = false
/** A manual check reports "you are up to date"; the startup check stays quiet. */
let currentCheckIsManual = false

export type UpdateCheckStatus =
  | 'unsupported'
  | 'checking'
  | 'busy'
  | 'error'

export interface UpdateCheckResult {
  status: UpdateCheckStatus
  error?: string
}

/** Packaged builds only — see the note above about app-update.yml. */
export function isUpdateSupported(): boolean {
  return app.isPackaged
}

async function getUpdater(): Promise<AppUpdater | null> {
  if (!isUpdateSupported()) return null
  if (updaterInstance) return updaterInstance

  // electron-updater is CommonJS and the main bundle is ESM, so the named
  // export only survives if Node's CJS interop finds it. Fall back to the
  // default namespace rather than crash the whole check on an interop miss.
  const updaterModule = await import('electron-updater')
  const autoUpdater = (updaterModule.autoUpdater
    ?? (updaterModule as unknown as { default?: { autoUpdater?: AppUpdater } }).default?.autoUpdater) as AppUpdater | undefined
  if (!autoUpdater) {
    logger.error('[updater] electron-updater did not expose autoUpdater; skipping update checks')
    return null
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = {
    info: (m: unknown) => logger.info(`[updater] ${String(m)}`),
    warn: (m: unknown) => logger.warn(`[updater] ${String(m)}`),
    error: (m: unknown) => logger.error(`[updater] ${String(m)}`),
    debug: (m: unknown) => logger.info(`[updater] ${String(m)}`),
  }

  autoUpdater.on('update-available', info => {
    logger.info(`[updater] Update available: ${info.version} (current ${app.getVersion()})`)
    void promptDownload(autoUpdater, info.version)
  })

  autoUpdater.on('update-not-available', () => {
    logger.info(`[updater] No update available (current ${app.getVersion()})`)
    checkInFlight = false
    if (currentCheckIsManual) {
      currentCheckIsManual = false
      void showMessageBox({
        type: 'info',
        title: 'KomfyEdit',
        message: `KomfyEdit ${app.getVersion()} is up to date.`,
        buttons: ['OK'],
      })
    }
  })

  autoUpdater.on('download-progress', progress => {
    logger.info(`[updater] Downloading: ${progress.percent.toFixed(1)}%`)
    getMainWindow()?.setProgressBar(progress.percent / 100)
  })

  autoUpdater.on('update-downloaded', info => {
    logger.info(`[updater] Update ${info.version} downloaded`)
    getMainWindow()?.setProgressBar(-1)
    checkInFlight = false
    void promptInstall(autoUpdater, info.version)
  })

  autoUpdater.on('error', err => {
    logger.warn(`[updater] Update check failed: ${String(err)}`)
    getMainWindow()?.setProgressBar(-1)
    checkInFlight = false
    if (currentCheckIsManual) {
      currentCheckIsManual = false
      void showMessageBox({
        type: 'error',
        title: 'KomfyEdit',
        message: 'Could not check for updates.',
        detail: String(err),
        buttons: ['OK'],
      })
    }
  })

  updaterInstance = autoUpdater
  return autoUpdater
}

async function promptDownload(updater: AppUpdater, version: string): Promise<void> {
  const { response } = await showMessageBox({
    type: 'info',
    title: 'KomfyEdit',
    message: `KomfyEdit ${version} is available.`,
    detail: `You are running ${app.getVersion()}. Download the update now? The editor keeps running while it downloads.`,
    buttons: ['Download', 'Release notes', 'Later'],
    defaultId: 0,
    cancelId: 2,
  })

  currentCheckIsManual = false

  if (response === 1) {
    await shell.openExternal(`https://github.com/tuyenhm68/KomfyEdit/releases/tag/v${version}`)
    checkInFlight = false
    return
  }
  if (response !== 0) {
    checkInFlight = false
    return
  }

  try {
    await updater.downloadUpdate()
  } catch (err) {
    logger.warn(`[updater] Download failed: ${String(err)}`)
    checkInFlight = false
  }
}

async function promptInstall(updater: AppUpdater, version: string): Promise<void> {
  const { response } = await showMessageBox({
    type: 'info',
    title: 'KomfyEdit',
    message: `KomfyEdit ${version} is ready to install.`,
    detail: 'The app will close and reopen. Unsaved work is autosaved, but finish any running export first.',
    buttons: ['Restart now', 'Install on quit'],
    defaultId: 1,
    cancelId: 1,
  })

  if (response === 0) {
    // isSilent=false so the installer UI shows; isForceRunAfter reopens the app.
    updater.quitAndInstall(false, true)
  }
}

/** Fire-and-forget check a little after launch, silent unless something is found. */
export function checkForUpdatesOnStartup(): void {
  if (!isUpdateSupported()) {
    logger.info('[updater] Skipping update check: not a packaged build')
    return
  }
  setTimeout(() => {
    void runCheck(false)
  }, 8000)
}

/** Menu-driven check: reports "up to date" and surfaces errors. */
export async function checkForUpdatesManually(): Promise<UpdateCheckResult> {
  return runCheck(true)
}

async function runCheck(manual: boolean): Promise<UpdateCheckResult> {
  if (!isUpdateSupported()) {
    return { status: 'unsupported' }
  }
  if (checkInFlight) {
    return { status: 'busy' }
  }

  const updater = await getUpdater()
  if (!updater) return { status: 'unsupported' }

  checkInFlight = true
  currentCheckIsManual = manual
  try {
    await updater.checkForUpdates()
    return { status: 'checking' }
  } catch (err) {
    checkInFlight = false
    currentCheckIsManual = false
    return { status: 'error', error: String(err) }
  }
}
