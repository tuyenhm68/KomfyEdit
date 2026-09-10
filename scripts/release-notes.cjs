'use strict'

/**
 * Turns CHANGELOG.md into the body of a GitHub Release.
 *
 * The release body is read twice over: once by whoever opens the Releases page,
 * and once by electron-updater, which hands `latestRelease.description` to the
 * in-app update prompt. So the summary of what changed goes first and the
 * standing download / first-launch guide goes underneath it — a reader looking
 * at "should I update?" should not have to scroll past a table of installer
 * filenames to find the answer.
 *
 * Usage:
 *   node scripts/release-notes.cjs --check 1.2.3        exit 1 if that version
 *                                                       has no changelog entry
 *   node scripts/release-notes.cjs 1.2.3 --out notes.md compose the body
 *   node scripts/release-notes.cjs 1.2.3                compose it to stdout
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md')
/** The standing "which file do I download" guide, appended below every release. */
const GUIDE_PATH = path.join(ROOT, 'resources', 'release-notes.md')

/**
 * The body of one `## [version]` section, without its heading.
 *
 * Headings carry a date and sometimes a link, so the version is matched inside
 * the brackets rather than by the whole line. Returns null when the version has
 * no section at all, and an empty string when the section is there but blank —
 * the caller treats both as "nothing to publish", but only one of them is a
 * typo in the version number.
 */
function extractVersionSection(markdown, version) {
  const lines = markdown.split(/\r?\n/)
  const heading = new RegExp(`^##\\s*\\[?v?${version.replace(/\./g, '\\.')}\\]?(\\s|$|[^0-9.])`)

  let start = -1
  for (let index = 0; index < lines.length; index += 1) {
    if (heading.test(lines[index])) {
      start = index + 1
      break
    }
  }
  if (start === -1) return null

  let end = lines.length
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) {
      end = index
      break
    }
  }

  return lines.slice(start, end).join('\n').trim()
}

/** The release body: what changed, then how to install it. */
function composeReleaseNotes(section, guide) {
  const parts = [section.trim()]
  const trimmedGuide = guide.trim()
  if (trimmedGuide) parts.push('---', trimmedGuide)
  return `${parts.join('\n\n')}\n`
}

module.exports = { extractVersionSection, composeReleaseNotes }

if (require.main === module) {
  const args = process.argv.slice(2)
  const checkIndex = args.indexOf('--check')
  const outIndex = args.indexOf('--out')
  const version = (checkIndex >= 0 ? args[checkIndex + 1] : args.find(arg => !arg.startsWith('--')))
  const outPath = outIndex >= 0 ? args[outIndex + 1] : null

  if (!version) {
    console.error('[release-notes] Usage: release-notes.cjs <version> [--out file] | --check <version>')
    process.exit(2)
  }

  const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8')
  const section = extractVersionSection(changelog, version.replace(/^v/, ''))

  if (section === null) {
    console.error(
      `[release-notes] CHANGELOG.md has no "## [${version}]" section.\n`
      + '  Add one before tagging — the release body, and the update prompt inside the app,\n'
      + '  are both built from it. `pnpm run changelog:draft` writes a first draft for you.',
    )
    process.exit(1)
  }
  if (!section) {
    console.error(`[release-notes] The "## [${version}]" section in CHANGELOG.md is empty.`)
    process.exit(1)
  }

  if (checkIndex >= 0) {
    console.log(`[release-notes] CHANGELOG.md describes ${version}.`)
    process.exit(0)
  }

  const guide = fs.existsSync(GUIDE_PATH) ? fs.readFileSync(GUIDE_PATH, 'utf8') : ''
  const body = composeReleaseNotes(section, guide)

  if (outPath) {
    fs.writeFileSync(outPath, body, 'utf8')
    console.log(`[release-notes] Wrote the ${version} release body to ${outPath}`)
  } else {
    process.stdout.write(body)
  }
}
