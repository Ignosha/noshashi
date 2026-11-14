/** A browser command grammar, not a shell. Parsing never executes or fetches. */
export const COMMANDS = ['help', 'status', 'clear', 'history', 'issuer', 'payment', 'open', 'example', 'evidence', 'account'];
export const PUBLIC_EXAMPLES = Object.freeze({
  issuer: 'issuer rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B USD',
  payment: 'payment 33C313E12DD8B2CFDB98ABC6298D4EFD0F3BC8EF283C057A026DA6170E7939AD',
});
const usage = {
  issuer: 'issuer <classic address> <3-character or 40-hex currency>',
  payment: 'payment <64-hex transaction hash>',
  open: 'open console | issuer | payment | evidence | help | account',
  example: 'example issuer | payment',
  evidence: 'evidence show | copy | download',
};
export function parseCommand(text) {
  if (typeof text !== 'string' || text.length > 180 || /[\x00-\x1f\x7f]/.test(text)) throw new Error('Use a single NOSHASHI command, up to 180 characters.');
  const [command, ...args] = text.trim().split(/\s+/);
  if (!COMMANDS.includes(command)) throw new Error('Unknown command. Type help for supported NOSHASHI commands.');
  if (['help', 'status', 'clear', 'history', 'account'].includes(command)) {
    if (args.length) throw new Error(`${command} takes no arguments.`);
    return {command};
  }
  if (command === 'issuer' && args.length === 2 && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(args[0]) && /^(?:[A-Za-z0-9]{3}|[a-fA-F0-9]{40})$/.test(args[1]) && args[1].toUpperCase() !== 'XRP' && !/^0{40}$/.test(args[1])) return {command, issuer: args[0], currency: args[1]};
  if (command === 'payment' && args.length === 1 && /^[a-fA-F0-9]{64}$/.test(args[0])) return {command, hash: args[0].toUpperCase()};
  const choices = {open: ['console', 'issuer', 'payment', 'evidence', 'help', 'account'], example: ['issuer', 'payment'], evidence: ['show', 'copy', 'download']};
  if (choices[command]?.includes(args[0]) && args.length === 1) return {command, target: args[0]};
  throw new Error(`Usage: ${usage[command]}`);
}
export function completeCommand(text) {
  if (!text || /\s/.test(text)) return text;
  const matches = COMMANDS.filter(command => command.startsWith(text));
  return matches.length === 1 ? matches[0] + ' ' : text;
}
