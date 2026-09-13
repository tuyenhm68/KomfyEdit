#!/usr/bin/env node
/**
 * Put KomfyEdit's icon into the Electron binary the dev run launches.
 *
 * Why this exists, measured on a real desktop:
 *
 * Windows draws a taskbar button's icon from the AppUserModelID the app claims.
 * When that id has no registered Start Menu shortcut — and neither KomfyEdit
 * shortcut declares one — Windows stops using the window's icon for the button
 * and falls back to the icon embedded in the running executable. Alt+Tab keeps
 * using the window icon, which is why the app shows a correct "K" there and the
 * Electron atom on the taskbar at the same time.
 *
 * The installed build is right by accident rather than by design: its fallback
 * is `KomfyEdit.exe`, which carries the icon. A dev run falls back to
 * `node_modules/electron/dist/electron.exe`, which carries Electron's own. So
 * the fix is to give the dev binary the same icon the packaged one has, and let
 * the identical mechanism produce the identical result.
 *
 * Runs as `postinstall` because installing Electron restores the stock binary,
 * which is exactly why this kept coming back.
 *
 * Windows only. Safe to run repeatedly: it checks first and does nothing when
 * the binary already carries the icon. If it ever corrupts the binary, the
 * recovery is `pnpm install --force`.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const ICON = path.join(ROOT, 'resources', 'icon.ico')
const EXE = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe')

function log(message) {
  console.log(`[patch-dev-icon] ${message}`)
}

/**
 * Whether the binary already carries this icon.
 *
 * Compared by content rather than by a marker file: a marker would survive a
 * reinstall that replaced the binary, and then quietly skip the work that
 * reinstall just undid.
 */
function alreadyPatched(exePath, needle) {
  const size = fs.statSync(exePath).size
  const fd = fs.openSync(exePath, 'r')
  const CHUNK = 8 * 1024 * 1024
  const buffer = Buffer.alloc(CHUNK + needle.length)
  let position = 0
  let carry = 0
  try {
    while (position < size) {
      const read = fs.readSync(fd, buffer, carry, CHUNK, position)
      if (read <= 0) break
      if (buffer.subarray(0, carry + read).includes(needle)) return true
      buffer.copy(buffer, 0, carry + read - needle.length, carry + read)
      carry = needle.length
      position += read
    }
  } finally {
    fs.closeSync(fd)
  }
  return false
}

/** A slice of one icon image, used as the "is it in there" fingerprint. */
function iconFingerprint(icoBuffer) {
  const count = icoBuffer.readUInt16LE(4)
  for (let i = 0; i < count; i += 1) {
    const entry = 6 + i * 16
    const width = icoBuffer[entry] || 256
    if (width === 48) {
      const offset = icoBuffer.readUInt32LE(entry + 12)
      return icoBuffer.subarray(offset, offset + 96)
    }
  }
  const offset = icoBuffer.readUInt32LE(6 + 12)
  return icoBuffer.subarray(offset, offset + 96)
}

function main() {
  if (process.platform !== 'win32') {
    log('not Windows, nothing to do')
    return
  }
  if (!fs.existsSync(EXE)) {
    log(`no dev Electron binary at ${EXE}, skipping`)
    return
  }
  if (!fs.existsSync(ICON)) {
    // Loud: a missing icon here means the packaged build is about to be wrong
    // too, and that is worth noticing now rather than after shipping.
    console.error(`[patch-dev-icon] Icon missing: ${ICON}`)
    process.exitCode = 1
    return
  }

  const ico = fs.readFileSync(ICON)
  if (alreadyPatched(EXE, iconFingerprint(ico))) {
    log('dev Electron binary already carries the app icon')
    return
  }

  let ResEdit
  try {
    ResEdit = require('resedit')
  } catch {
    // Not fatal: a dev run with the wrong taskbar icon still works.
    log('resedit is not installed, leaving the binary alone')
    return
  }

  log('embedding the app icon into the dev Electron binary…')
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(EXE))
  const resource = ResEdit.NtExecutableResource.from(exe)
  const iconFile = ResEdit.Data.IconFile.from(ico)

  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resource.entries,
    1,      // the main icon group, which Explorer and the taskbar read
    1033,   // en-US; Electron ships its resources under this language
    iconFile.icons.map(icon => icon.data),
  )

  resource.outputResource(exe)
  // Written through a temp file and renamed: a half-written 200 MB binary is a
  // dev environment that will not start at all.
  const output = Buffer.from(exe.generate())
  const temp = `${EXE}.patching`
  fs.writeFileSync(temp, output)
  try {
    fs.renameSync(temp, EXE)
  } catch (err) {
    // Windows locks a running executable, and the dev app is the likeliest
    // thing holding it. Leaving a 200 MB orphan behind on every failed attempt
    // would be worse than the problem being fixed.
    try { fs.unlinkSync(temp) } catch { /* best effort */ }
    if (err && (err.code === 'EPERM' || err.code === 'EBUSY')) {
      console.error('[patch-dev-icon] The dev app is running and holding electron.exe.')
      console.error('[patch-dev-icon] Close it, then run: node scripts/patch-dev-icon.cjs')
      process.exitCode = 1
      return
    }
    throw err
  }

  if (!alreadyPatched(EXE, iconFingerprint(ico))) {
    console.error('[patch-dev-icon] Wrote the binary but the icon is not in it. Run `pnpm install --force`.')
    process.exitCode = 1
    return
  }
  log('done — restart the dev app to see it')
}

main()
