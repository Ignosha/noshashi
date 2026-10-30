#!/usr/bin/env node
/*
 * Registers the NOSHASHI /check slash command with Discord. Run once, after
 * creating the application at https://discord.com/developers/applications:
 *
 *   DISCORD_APPLICATION_ID=… DISCORD_BOT_TOKEN=… node scripts/register-discord-command.mjs
 *
 * Then, in the Developer Portal, set the Interactions Endpoint URL to
 *   https://xiurbiwuwcfowqnpmwki.supabase.co/functions/v1/noshashi-issuer-alerts/discord
 * and give the edge function DISCORD_PUBLIC_KEY and DISCORD_APPLICATION_ID as
 * secrets. Discord sends a signed PING when the URL is saved, so set the
 * secrets first.
 *
 * The token is read from the environment and sent only to discord.com.
 */

const appId = process.env.DISCORD_APPLICATION_ID ?? "";
const token = process.env.DISCORD_BOT_TOKEN ?? "";
if (!/^\d{15,22}$/.test(appId) || !token) {
  console.error("Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN.");
  process.exit(1);
}

const command = {
  name: "check",
  type: 1,
  description: "What an XRPL token issuer can do right now, read from the ledger",
  options: [{ type: 3, name: "issuer", description: "The issuer's r-address", required: true, min_length: 25, max_length: 35 }],
  // Usable in servers, DMs with the bot, and as a user-installed app.
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const response = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: "PUT",
  headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify([command]),
});
console.log(response.status, await response.text());
process.exit(response.ok ? 0 : 1);
