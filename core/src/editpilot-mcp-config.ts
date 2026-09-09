/**
 * Handing an MCP server to a CLI that has no `--mcp-config` file flag.
 *
 * Codex takes config as repeated `-c key=value` overrides whose value is
 * parsed as TOML, so the whole server definition can be passed per run without
 * writing anything into the user's own `~/.codex/config.toml`. That matters:
 * EditPilot's server points at one project and one live-bridge port, so it must
 * not outlive the run that created it.
 */

export interface InlineMcpTarget {
  /** Server name the agent will see, e.g. "komfyedit". */
  serverName: string
  /** Executable that starts the server. */
  command: string
  /** Arguments it takes — normally the single entry-point script. */
  args: string[]
  env: Record<string, string>
}

/**
 * Renders a string as a TOML scalar.
 *
 * Literal strings (single quotes) are the default because a Windows path is
 * full of backslashes and TOML basic strings would need every one escaped —
 * one missed escape and the server silently fails to start. Literal strings
 * cannot contain a quote at all, so a path that has one falls back to a basic
 * string with proper escaping.
 */
export function tomlString(value: string): string {
  if (!value.includes("'") && !/[\n\r]/.test(value)) return `'${value}'`
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"'
}

function tomlArray(values: string[]): string {
  return '[' + values.map(tomlString).join(', ') + ']'
}

function tomlInlineTable(entries: Record<string, string>): string {
  const pairs = Object.entries(entries).map(([key, value]) => `${key} = ${tomlString(value)}`)
  return '{' + pairs.join(', ') + '}'
}

/**
 * The `-c` arguments that register one MCP server for a single run.
 *
 * Returned flat (flag, value, flag, value…) so the caller can splice them
 * straight into the argv it is already building.
 */
export function buildInlineMcpConfigArgs(flag: string, target: InlineMcpTarget): string[] {
  const prefix = `mcp_servers.${target.serverName}`
  const args = [
    flag, `${prefix}.command=${tomlString(target.command)}`,
    flag, `${prefix}.args=${tomlArray(target.args)}`,
  ]
  if (Object.keys(target.env).length > 0) {
    args.push(flag, `${prefix}.env=${tomlInlineTable(target.env)}`)
  }
  return args
}
