import { z } from 'zod'

/**
 * The agent CLIs EditPilot knows how to drive.
 *
 * KomfyEdit never ships or bundles these, never holds a credential for them and
 * never bills for their use: the user installs one, signs in with their own
 * account, and EditPilot runs the unmodified binary on their behalf. See
 * docs/ai-agent-integration-plan.md for why that boundary matters.
 */
export const EDIT_PILOT_AGENT_IDS = ['claude', 'codex', 'antigravity'] as const
export type EditPilotAgentId = (typeof EDIT_PILOT_AGENT_IDS)[number]

export interface EditPilotAgentDefinition {
  id: EditPilotAgentId
  label: string
  vendor: string
  /** Executable names to look for, in order of preference. */
  commands: string[]
  /** Arguments that make the CLI print its version and exit. */
  versionArgs: string[]
  /**
   * How this CLI takes a single prompt and runs to completion without a TUI.
   * `{prompt}` is substituted at spawn time.
   */
  headlessArgs: string[]
  /** Flag that limits the run to an explicit tool allowlist, when the CLI has one. */
  allowedToolsFlag: string | null
  /**
   * Flag that continues an earlier conversation by id, so a follow-up message
   * arrives with the previous turns. Null when the CLI cannot be resumed by id —
   * every message then starts from nothing, and answers like "yes" mean nothing.
   */
  resumeFlag: string | null
  /**
   * Flag that refuses a list of tools outright. Unlike an allowlist, which only
   * decides what is auto-approved, this is the one that actually blocks.
   */
  disallowedToolsFlag: string | null
  /**
   * Flag that appends a system prompt for the run. Null when the CLI has none —
   * the caller then prepends the framing to the user prompt instead, which is
   * weaker but better than letting the CLI keep its default identity.
   */
  systemPromptFlag: string | null
  /**
   * File the CLI reads out of its working directory as standing instructions.
   * A second-best channel for framing, used only when there is no
   * `systemPromptFlag` — but far better than folding the framing into the user
   * message, which the CLI then echoes back at the user as if they had typed
   * it. Null when the CLI reads no such file.
   */
  projectDocFile: string | null
  /**
   * Whether the framing must ALSO be folded into the user message.
   *
   * Belt and braces for a CLI whose project-doc support is not confirmed. It
   * costs an ugly, newline-flattened preamble; skipping it when the CLI turns
   * out not to read the file costs the framing entirely, and an agent with no
   * framing and no tool denylist goes straight for the shell.
   */
  foldFramingIntoPrompt: boolean
  /** Flag that points the CLI at an MCP server config file, when the CLI has one. */
  mcpConfigFlag: string | null
  /**
   * Flag that takes one inline `key=value` config override, for CLIs that
   * accept an MCP server as config rather than a file. Repeated once per key.
   * Null when the CLI takes a config file, or has no MCP support.
   */
  mcpInlineConfigFlag: string | null
  /**
   * CLIs without a per-run config flag register MCP servers persistently
   * instead. `{name}`, `{command}` and `{entry}` are substituted at call time.
   * Null when the CLI takes a config file per run, or has no MCP support.
   */
  mcpRegisterArgs: string[] | null
  /**
   * Config file, as path segments under the user's home directory, holding the
   * CLI's permission rules. Null when the CLI does not gate tool calls, or
   * gates them somewhere KomfyEdit does not know how to reach.
   */
  permissionsFilePath: string[] | null
  /**
   * Allow-rule that lets a headless run call KomfyEdit's MCP server without a
   * prompt. `{name}` is the registered server name. Null when the CLI needs no
   * such rule.
   */
  mcpPermissionRule: string | null
  installHint: string
  docsUrl: string
}

export const EDIT_PILOT_AGENTS: Record<EditPilotAgentId, EditPilotAgentDefinition> = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    vendor: 'Anthropic',
    commands: ['claude'],
    versionArgs: ['--version'],
    headlessArgs: ['-p', '{prompt}', '--output-format', 'stream-json', '--verbose'],
    allowedToolsFlag: '--allowedTools',
    resumeFlag: '--resume',
    disallowedToolsFlag: '--disallowedTools',
    systemPromptFlag: '--append-system-prompt',
    projectDocFile: null,
    foldFramingIntoPrompt: false,
    mcpConfigFlag: '--mcp-config',
    mcpInlineConfigFlag: null,
    mcpRegisterArgs: null,
    permissionsFilePath: null,
    mcpPermissionRule: null,
    installHint: 'npm i -g @anthropic-ai/claude-code',
    docsUrl: 'https://code.claude.com/docs',
  },
  codex: {
    id: 'codex',
    label: 'Codex CLI',
    vendor: 'OpenAI',
    commands: ['codex'],
    versionArgs: ['--version'],
    // EditPilot runs the CLI in an empty scratch directory, which is neither a
    // git repo nor a directory Codex has been told to trust; without this flag
    // it refuses to start at all.
    headlessArgs: ['exec', '--skip-git-repo-check', '{prompt}'],
    allowedToolsFlag: null,
    resumeFlag: null,
    disallowedToolsFlag: null,
    systemPromptFlag: null,
    // Codex has no system-prompt flag, but it reads AGENTS.md out of its
    // working directory. EditPilot gives every run its own scratch directory,
    // so the file lives and dies with the run.
    projectDocFile: 'AGENTS.md',
    foldFramingIntoPrompt: false,
    mcpConfigFlag: null,
    // Codex has no per-run MCP config file, but `-c` overrides accept a whole
    // server definition as TOML — per run, so it never lands in the user's own
    // config.toml and cannot outlive the project it was pointed at.
    mcpInlineConfigFlag: '-c',
    mcpRegisterArgs: null,
    permissionsFilePath: null,
    mcpPermissionRule: null,
    installHint: 'npm i -g @openai/codex',
    docsUrl: 'https://developers.openai.com/codex/cli/reference',
  },
  antigravity: {
    id: 'antigravity',
    label: 'Antigravity CLI',
    vendor: 'Google',
    // The binary is `agy`; `antigravity` is accepted as an alias on some installs.
    commands: ['agy', 'antigravity'],
    versionArgs: ['--version'],
    headlessArgs: ['-p', '{prompt}'],
    allowedToolsFlag: null,
    // `agy` resumes by id too, but its plain-text output never reveals one.
    resumeFlag: null,
    disallowedToolsFlag: null,
    systemPromptFlag: null,
    // `agy` reads AGENTS.md out of its working directory, same as Codex. It
    // needs the framing more than either: with no tool denylist and no
    // system-prompt flag, guidance is the only thing keeping it off the disk.
    projectDocFile: 'AGENTS.md',
    // Observed in a real run: the file was written, and `agy` still started the
    // turn with an empty rules section and reached for a shell command. So the
    // framing rides in the message too until that is understood.
    foldFramingIntoPrompt: true,
    // `agy` has no per-run MCP flag: servers are registered once with
    // `agy mcp add` and persist in the user's own CLI config.
    mcpConfigFlag: null,
    mcpInlineConfigFlag: null,
    // ELECTRON_RUN_AS_NODE is not optional: `{command}` is Electron's binary,
    // and without it the "server" launches as a GUI app that never speaks a
    // word of MCP. Registered without it, the agent saw no timeline tools at
    // all and fell back to reading files off the disk.
    mcpRegisterArgs: [
      'mcp', 'add',
      '--env', 'KOMFYEDIT_MCP_PROFILE=edit',
      '--env', 'ELECTRON_RUN_AS_NODE=1',
      '{name}', '{command}', '{entry}',
    ],
    // Print mode cannot prompt for permission, so an MCP call with no standing
    // allow-rule is auto-denied and the run produces nothing at all.
    permissionsFilePath: ['.gemini', 'antigravity-cli', 'settings.json'],
    mcpPermissionRule: 'mcp({name}/*)',
    installHint: 'Xem antigravity.google/docs/cli',
    docsUrl: 'https://antigravity.google/docs/cli/mcp/',
  },
}

export function listAgentDefinitions(): EditPilotAgentDefinition[] {
  return EDIT_PILOT_AGENT_IDS.map(id => EDIT_PILOT_AGENTS[id])
}

/** What detection found for one agent on this machine. */
export const editPilotAgentStatusSchema = z.object({
  id: z.enum(EDIT_PILOT_AGENT_IDS),
  installed: z.boolean(),
  /** Resolved command that answered, e.g. "agy" rather than "antigravity". */
  command: z.string().nullable(),
  /** First line of `--version` output, trimmed. Null when not installed. */
  version: z.string().nullable(),
  /** Why detection failed, for the settings UI. Null on success. */
  error: z.string().nullable(),
})
export type EditPilotAgentStatus = z.infer<typeof editPilotAgentStatusSchema>

/**
 * Per-agent command override, for installs that are not on PATH.
 * Every key is optional; an absent or empty value means "use PATH".
 */
export const editPilotCommandOverridesSchema = z.object({
  claude: z.string().optional(),
  codex: z.string().optional(),
  antigravity: z.string().optional(),
})
export type EditPilotCommandOverrides = z.infer<typeof editPilotCommandOverridesSchema>

export const editPilotConfigSchema = z.object({
  /** The agent EditPilot uses. Null means "not configured yet". */
  defaultAgentId: z.enum(EDIT_PILOT_AGENT_IDS).nullable(),
  commandOverrides: editPilotCommandOverridesSchema.default({}),
})
export type EditPilotConfig = z.infer<typeof editPilotConfigSchema>

export const DEFAULT_EDIT_PILOT_CONFIG: EditPilotConfig = {
  defaultAgentId: null,
  commandOverrides: {},
}

/**
 * Read a stored config back, tolerating anything: this comes off disk and an
 * unreadable value must degrade to "not configured" rather than break startup.
 */
export function parseEditPilotConfig(value: unknown): EditPilotConfig {
  const parsed = editPilotConfigSchema.safeParse(value)
  return parsed.success ? parsed.data : { ...DEFAULT_EDIT_PILOT_CONFIG }
}

/**
 * The agent EditPilot should actually use, given the config and what is
 * installed. An explicit choice wins even if detection failed — the user may
 * know better than a probe that timed out — but a config pointing at nothing
 * installed falls back to the first agent that is.
 */
export function resolveActiveAgent(
  config: EditPilotConfig,
  statuses: EditPilotAgentStatus[],
): EditPilotAgentId | null {
  const installed = statuses.filter(status => status.installed).map(status => status.id)
  if (config.defaultAgentId) {
    if (installed.includes(config.defaultAgentId)) return config.defaultAgentId
    if (installed.length === 0) return config.defaultAgentId
  }
  return installed[0] ?? null
}
