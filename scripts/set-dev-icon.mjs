/**
 * Gives the dev-mode Electron binary the KomfyEdit icon.
 *
 * `pnpm dev` runs node_modules/electron/dist/electron.exe. The window icon the
 * app sets is applied correctly — WM_GETICON on the running window returns the
 * KomfyEdit icon — but the Windows taskbar identifies an unpackaged run by the
 * process image, whose class icon and embedded resource are still Electron's.
 * Neither `BrowserWindow({ icon })` nor `app.setAppUserModelId` changes that;
 * only the icon inside the exe does. Packaged builds are unaffected:
 * electron-builder embeds the icon into KomfyEdit.exe.
 *
 * Runs before Vite. A no-op off Windows, and after the first run it re-stamps
 * only when the icon file or the Electron binary changes, so `pnpm dev` stays
 * fast. Nothing here is fatal: failing to stamp costs a wrong icon in dev,
 * never a dev server. `pnpm install` restores the stock binary, and the next
 * `pnpm dev` stamps it again.
 */
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const iconPath = path.join(projectRoot, 'resources', 'icon.ico')
const electronExe = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
const stampPath = path.join(projectRoot, 'node_modules', 'electron', 'dist', '.komfyedit-icon')

/**
 * rcedit, the tool that rewrites a PE file's icon resource.
 *
 * It ships inside the winCodeSign bundle electron-builder downloads for real
 * Windows builds, so a checkout that has ever run `pnpm build` already has a
 * copy. Newest bundle first — they are content-addressed directories, and any
 * of them carries the same tool.
 */
function findRcedit() {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'ia32' : 'x64'
  const cacheRoot = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'electron-builder', 'Cache', 'winCodeSign',
  )
  if (!fs.existsSync(cacheRoot)) return null

  const candidates = fs.readdirSync(cacheRoot)
    .map(entry => path.join(cacheRoot, entry, `rcedit-${arch}.exe`))
    .filter(candidate => fs.existsSync(candidate))
    .map(candidate => ({ candidate, mtime: fs.statSync(candidate).mtimeMs }))
    .sort((left, right) => right.mtime - left.mtime)

  return candidates[0]?.candidate ?? null
}

/** PIDs of anything running from the dev Electron binary, which holds it open. */
function runningElectronPids() {
  try {
    const script = `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.ExecutablePath -like '*${path.basename(projectRoot)}*' } | ForEach-Object { $_.ProcessId }`
    const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Closes everything running from the dev Electron binary.
 *
 * Only for `pnpm dev:icon`, never for the automatic run before Vite: it takes
 * down a dev window the user may still be using. It exists because a crashed
 * run leaves main processes behind with no window to close, and those hold the
 * binary open forever — which is exactly what kept the stamp from landing.
 */
function killStaleElectron() {
  const pids = runningElectronPids()
  if (pids.length === 0) {
    console.log('[dev-icon] No Electron process is running from node_modules')
    return
  }
  for (const pid of pids) {
    try {
      process.kill(Number(pid))
      console.log(`[dev-icon] Closed Electron process ${pid}`)
    } catch (err) {
      console.warn(`[dev-icon] Could not close process ${pid}: ${String(err.message || err)}`)
    }
  }
}

function main() {
  if (process.platform !== 'win32') return
  if (!fs.existsSync(electronExe) || !fs.existsSync(iconPath)) return
  if (process.argv.includes('--kill-stale')) killStaleElectron()

  // Electron is replaced wholesale on upgrade, which drops the icon stamped
  // into it, so the binary's size goes into the stamp beside the icon's hash.
  const stamp = createHash('sha256')
    .update(fs.readFileSync(iconPath))
    .update(String(fs.statSync(electronExe).size))
    .digest('hex')

  if (fs.existsSync(stampPath) && fs.readFileSync(stampPath, 'utf8').trim() === stamp) return

  const rcedit = findRcedit()
  if (!rcedit) {
    console.warn('[dev-icon] rcedit not found; the dev window keeps the Electron taskbar icon. Run `pnpm build` once to fetch it.')
    return
  }

  try {
    execFileSync(rcedit, [electronExe, '--set-icon', iconPath], { stdio: ['ignore', 'pipe', 'pipe'] })
    fs.writeFileSync(stampPath, stamp)
    console.log('[dev-icon] Stamped the KomfyEdit icon onto the dev Electron binary')
  } catch {
    // Windows refuses to rewrite the resources of a running image, and closing
    // the dev window is not always enough: a crashed run can leave helper
    // processes behind with no window of their own. Name them, so it is clear
    // what has to go.
    const holders = runningElectronPids()
    const detail = holders.length > 0
      ? `${holders.length} Electron process(es) are still running from node_modules (PID ${holders.join(', ')}). Close them and run \`pnpm dev\` again.`
      : 'the binary could not be rewritten.'
    console.warn(`[dev-icon] Could not set the dev icon: ${detail}`)
  }
}

main()
