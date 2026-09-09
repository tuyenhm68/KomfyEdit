/**
 * The permission allow-rule a headless CLI run needs to reach an MCP server.
 *
 * Antigravity asks before every tool call. In print mode there is nobody to
 * ask, so it auto-denies and the run ends with "no output produced" — the tool
 * was never called. The escape hatch it offers is
 * `--dangerously-skip-permissions`, which auto-approves *everything*: on a CLI
 * that has no tool denylist to begin with, that hands the agent the shell and
 * the filesystem. A single allow-rule naming KomfyEdit's own server is the
 * narrow version of the same fix.
 */

export interface PermissionRulePatch {
  /** The file's new contents. Unchanged when the rule was already there. */
  json: string
  added: boolean
}

/**
 * Adds one rule to `permissions.allow`, preserving everything else in the file.
 *
 * This edits a config file that belongs to the user, not to KomfyEdit, so it
 * refuses rather than guesses: unparseable JSON, or a `permissions.allow` that
 * is not a list of strings, throws instead of being overwritten.
 */
export function addPermissionRule(rawJson: string, rule: string): PermissionRulePatch {
  const trimmed = rawJson.trim()
  let parsed: unknown

  if (trimmed.length === 0) {
    parsed = {}
  } else {
    try {
      parsed = JSON.parse(trimmed)
    } catch (err) {
      throw new Error(`Không đọc được settings.json của CLI: ${String(err)}`)
    }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('settings.json của CLI không phải một object.')
  }

  const settings = parsed as Record<string, unknown>
  const permissionsValue = settings.permissions

  if (permissionsValue !== undefined
    && (permissionsValue === null || typeof permissionsValue !== 'object' || Array.isArray(permissionsValue))) {
    throw new Error('Mục "permissions" trong settings.json không phải một object.')
  }

  const permissions = (permissionsValue ?? {}) as Record<string, unknown>
  const allowValue = permissions.allow

  if (allowValue !== undefined && !Array.isArray(allowValue)) {
    throw new Error('Mục "permissions.allow" trong settings.json không phải một mảng.')
  }

  const allow = (allowValue ?? []) as unknown[]
  if (allow.some(entry => entry === rule)) {
    return { json: rawJson, added: false }
  }

  const next = {
    ...settings,
    permissions: { ...permissions, allow: [...allow, rule] },
  }

  return { json: `${JSON.stringify(next, null, 2)}\n`, added: true }
}
