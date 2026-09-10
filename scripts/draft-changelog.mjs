/**
 * Drafts the `[Unreleased]` section of CHANGELOG.md from the work since the
 * last tag, using whichever agent CLI is installed.
 *
 * A draft, deliberately, and only ever run by hand — never in CI. The model
 * reads a diff, which is a record of what the code does, not of what the user
 * gets; it will happily describe a refactor nobody can see and miss the one
 * fix that mattered. So this writes into the working tree for you to correct,
 * and the release gate in CI still refuses a version with no section — a
 * generated summary can be wrong, but it cannot reach a user unreviewed.
 *
 * Usage:
 *   node scripts/draft-changelog.mjs            draft from the last tag to HEAD
 *   node scripts/draft-changelog.mjs --since v1.0.0
 *   node scripts/draft-changelog.mjs --print    print the prompt, run nothing
 */

import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md')
const UNRELEASED_HEADING = '## [Unreleased]'

/**
 * The CLIs that can take a prompt and print an answer without a TUI.
 *
 * Same three EditPilot drives, and the same boundary: KomfyEdit ships none of
 * them and holds no credential for them. Whichever is on PATH gets used.
 */
const AGENTS = [
  { command: 'claude', args: prompt => ['-p', prompt] },
  { command: 'codex', args: prompt => ['exec', prompt] },
  { command: 'antigravity', args: prompt => ['-p', prompt] },
]

function git(...args) {
  // stderr ignored: git narrates line-ending conversions on Windows, and that
  // noise would bury the one line this script actually wants to print.
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function lastTag() {
  try {
    return git('describe', '--tags', '--abbrev=0')
  } catch {
    return ''
  }
}

function onPath(command) {
  const probe = spawnSync(command, ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' })
  return probe.status === 0 || Boolean(probe.stdout)
}

/**
 * What the model is told about. Names of changed files and commit subjects, not
 * the diff itself: a full diff of a release is far larger than it needs to be,
 * and the file list plus subjects is what actually says which user-facing areas
 * moved. `--stat` keeps the size of each change visible, so a one-line tweak is
 * not written up as a headline.
 */
function collectContext(since) {
  const range = since ? `${since}..HEAD` : 'HEAD'
  const subjects = git('log', '--no-merges', '--format=- %s', range) || '(no commits)'
  const stat = git('diff', '--stat', range) || '(no files changed)'

  // Work that is not committed yet counts. publish-release.ps1 stages the whole
  // working tree at tag time, so at the moment you draft the changelog the
  // release usually exists only as uncommitted edits — reading committed
  // history alone would describe the previous release.
  const pending = git('diff', '--stat', 'HEAD')
  const untracked = git('ls-files', '--others', '--exclude-standard')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(file => `- ${file} (new)`)
    .join('\n')

  return { range, subjects, stat, pending, untracked }
}

function buildPrompt({ range, subjects, stat, pending, untracked }) {
  return [
    'You are drafting the changelog for KomfyEdit, a desktop video editor.',
    'The reader edits video. They are not a developer.',
    '',
    `Here is everything that changed in ${range}.`,
    '',
    'Commits:',
    subjects,
    '',
    'Files changed:',
    stat,
    ...(pending ? ['', 'Uncommitted changes:', pending] : []),
    ...(untracked ? ['', 'New files, not committed yet:', untracked] : []),
    '',
    'Write in English, in exactly this shape and nothing else:',
    '',
    '### Added',
    '- <one line per change the user can see>',
    '',
    '### Fixed',
    '- <one line per bug fixed, described as the symptom the user hit>',
    '',
    'Rules:',
    '- Drop a heading entirely when it has nothing under it.',
    '- Never name a file, function, variable or commit.',
    '- Leave out anything only a developer would notice — refactors, build',
    '  configuration, added tests — unless the user feels the difference.',
    '- One sentence per line: what changed, and what it means for them.',
    '- No marketing, no superlatives.',
  ].join('\n')
}

function insertDraft(draft) {
  const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8')
  const headingIndex = changelog.indexOf(UNRELEASED_HEADING)
  if (headingIndex === -1) {
    throw new Error(`[draft-changelog] ${UNRELEASED_HEADING} not found in CHANGELOG.md`)
  }

  const after = headingIndex + UNRELEASED_HEADING.length
  const nextHeading = changelog.indexOf('\n## ', after)
  const end = nextHeading === -1 ? changelog.length : nextHeading
  const existing = changelog.slice(after, end).trim()

  // Never overwrite: what is already there was reviewed by a person, and this
  // was not. The draft goes in beside it, marked, for you to merge.
  const block = existing
    ? `\n\n${existing}\n\n<!-- draft, unreviewed — edit it, then delete this line -->\n${draft.trim()}\n`
    : `\n\n<!-- draft, unreviewed — edit it, then delete this line -->\n${draft.trim()}\n`

  fs.writeFileSync(CHANGELOG_PATH, changelog.slice(0, after) + block + changelog.slice(end), 'utf8')
}

function main() {
  const args = process.argv.slice(2)
  const sinceIndex = args.indexOf('--since')
  const since = sinceIndex >= 0 ? args[sinceIndex + 1] : lastTag()

  const context = collectContext(since)
  const prompt = buildPrompt(context)

  if (args.includes('--print')) {
    process.stdout.write(`${prompt}\n`)
    return
  }

  const agent = AGENTS.find(candidate => onPath(candidate.command))
  if (!agent) {
    console.error(
      `[draft-changelog] No agent CLI found (tried ${AGENTS.map(a => a.command).join(', ')}).\n`
      + '  Run with --print to get the prompt and paste it somewhere yourself.',
    )
    process.exit(1)
  }

  console.log(`[draft-changelog] Asking ${agent.command} to summarise ${context.range}…`)
  const run = spawnSync(agent.command, agent.args(prompt), {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 32 * 1024 * 1024,
  })

  const draft = (run.stdout || '').trim()
  if (run.status !== 0 || !draft) {
    console.error(`[draft-changelog] ${agent.command} produced nothing: ${run.stderr || `exit ${run.status}`}`)
    process.exit(1)
  }

  insertDraft(draft)
  console.log(
    `[draft-changelog] Draft written into ${UNRELEASED_HEADING} in CHANGELOG.md.\n`
    + '  Read it before releasing — it was written from a diff, not from using the app.',
  )
}

main()
