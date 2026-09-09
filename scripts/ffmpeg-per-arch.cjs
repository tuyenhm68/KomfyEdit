'use strict'

/**
 * electron-builder afterPack hook: put the right ffmpeg inside each packed app.
 *
 * ffmpeg-static downloads exactly one binary at install time, chosen by the
 * build machine's own architecture. That is fine while every release is built
 * on a machine of the target architecture, and quietly wrong the moment one
 * run packs two architectures — the mac release does, because electron-updater
 * needs a single latest-mac.yml listing both the arm64 and the x64 zip
 * (MacUpdater picks between them by looking for "arm64" in the filename), and
 * that file only lists both when one electron-builder run produces both.
 *
 * So the x64 app would ship an arm64 ffmpeg and fail on every Intel Mac, with
 * nothing in CI to catch it. This hook fetches the binary matching the app
 * being packed and swaps it in, and does nothing at all when the packed
 * architecture already matches the builder.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const https = require('https')
const zlib = require('zlib')

// electron-builder's Arch enum, which reaches the hook as a plain number.
const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }

// ffmpeg-static names its release assets with these.
const FFMPEG_ARCH = { ia32: 'ia32', x64: 'x64', arm64: 'arm64', armv7l: 'arm' }
const FFMPEG_PLATFORM = { darwin: 'darwin', win32: 'win32', linux: 'linux' }

function ffmpegReleaseTag() {
  const pkg = require('ffmpeg-static/package.json')
  return pkg[pkg.name]['binary-release-tag']
}

function download(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'user-agent': 'komfyedit-build' } }, response => {
        const { statusCode, headers } = response
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          response.resume()
          if (redirectsLeft === 0) {
            reject(new Error(`Too many redirects for ${url}`))
            return
          }
          resolve(download(headers.location, redirectsLeft - 1))
          return
        }
        if (statusCode !== 200) {
          response.resume()
          reject(new Error(`GET ${url} failed with HTTP ${statusCode}`))
          return
        }

        const chunks = []
        const unzipped = response.pipe(zlib.createGunzip())
        unzipped.on('data', chunk => chunks.push(chunk))
        unzipped.on('end', () => resolve(Buffer.concat(chunks)))
        unzipped.on('error', reject)
      })
      .on('error', reject)
  })
}

/** Where the unpacked ffmpeg-static binary lives inside a packed app. */
function packedFfmpegPath(context) {
  const isMac = context.electronPlatformName === 'darwin'
  const executable = context.electronPlatformName === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const resources = isMac
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources')

  return path.join(resources, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', executable)
}

module.exports = async function afterPack(context) {
  const targetArch = ARCH_NAMES[context.arch]
  const platform = FFMPEG_PLATFORM[context.electronPlatformName]

  if (!targetArch || !platform) {
    throw new Error(`[ffmpeg-per-arch] Unknown target ${context.electronPlatformName}/${context.arch}`)
  }

  // A universal build carries both slices already; ffmpeg-static has no
  // universal asset, so leave it to whoever adds that target to solve it.
  if (targetArch === 'universal') {
    throw new Error('[ffmpeg-per-arch] Universal builds are not supported: ffmpeg-static ships no universal binary')
  }

  const builderArch = os.arch()
  if (targetArch === builderArch) {
    console.log(`[ffmpeg-per-arch] ${platform}/${targetArch} matches the build machine; keeping the installed binary`)
    return
  }

  const binaryPath = packedFfmpegPath(context)
  if (!fs.existsSync(binaryPath)) {
    // Better to stop than to publish an installer whose exporter cannot start.
    throw new Error(`[ffmpeg-per-arch] Expected an unpacked ffmpeg at ${binaryPath}, found nothing`)
  }

  const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${ffmpegReleaseTag()}/ffmpeg-${platform}-${FFMPEG_ARCH[targetArch]}.gz`
  console.log(`[ffmpeg-per-arch] Packing ${platform}/${targetArch} on a ${builderArch} machine — fetching ${url}`)

  const binary = await download(url)

  // Mach-O and ELF both start with a 4-byte magic; a truncated or HTML error
  // page would sail straight into the installer otherwise.
  if (binary.length < 1024 * 1024) {
    throw new Error(`[ffmpeg-per-arch] Downloaded ffmpeg is only ${binary.length} bytes; refusing to use it`)
  }

  fs.writeFileSync(binaryPath, binary)
  fs.chmodSync(binaryPath, 0o755)
  console.log(`[ffmpeg-per-arch] Replaced ${binaryPath} with the ${platform}/${targetArch} build (${binary.length} bytes)`)
}
