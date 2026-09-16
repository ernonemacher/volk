/**
 * Who may configure the bot, and who may operate the panel.
 *
 * Discord already gates the slash command twice: `setDefaultMemberPermissions`
 * hides it from members without "Manage Server", and a server admin can
 * override that per role under Server Settings, Integrations. Neither of those
 * reaches the panel's buttons and menus, which any member of the channel can
 * click, so operating the panel needs a check of our own.
 *
 * Two levels, because they answer different questions:
 *
 *   admin     changes configuration that outlives the session: pinned servers,
 *             refresh interval, language, roles.
 *   operator  drives the current match: pick a server, a side, a flag.
 *
 * Operating is open by default. A squad calling flags mid-match should not be
 * waiting on someone with "Manage Server", so the restriction only exists once
 * an admin asks for it by naming at least one operator role.
 */

import { PermissionsBitField } from "discord.js";

export const LEVELS = ["admin", "operator"];

/** Role ids configured for a level, always an array. */
export const rolesFor = (config, level) => config?.roles?.[level] ?? [];

const hasAnyRole = (interaction, ids) =>
    ids.length > 0 && ids.some((id) => interaction.member?.roles?.cache?.has(id));

/**
 * "Manage Server" always counts: it is the permission Discord itself treats as
 * owning the bot's integration, and relying on it alone means a fresh install
 * is usable before any role is configured.
 */
export function isAdmin(interaction, config) {
    if (interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
    return hasAnyRole(interaction, rolesFor(config, "admin"));
}

/** Admins operate too: a config role that cannot click the panel is a trap. */
export function canOperate(interaction, config) {
    if (isAdmin(interaction, config)) return true;
    const allowed = rolesFor(config, "operator");
    return allowed.length === 0 || hasAnyRole(interaction, allowed);
}

/** Adds a role to a level. Returns false when it was already there. */
export function grantRole(config, level, roleId) {
    config.roles ??= {};
    config.roles[level] ??= [];
    if (config.roles[level].includes(roleId)) return false;
    config.roles[level].push(roleId);
    return true;
}

/** Removes a role from a level. Returns false when it was not there. */
export function revokeRole(config, level, roleId) {
    const at = (config.roles?.[level] ?? []).indexOf(roleId);
    if (at === -1) return false;
    config.roles[level].splice(at, 1);
    return true;
}
