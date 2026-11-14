import {describe, it, expect} from 'vitest';
import {parseCommand, completeCommand, PUBLIC_EXAMPLES} from '../site/assets/terminal-commands.js';

describe('NOSHASHI command boundary', () => {
  it('maps a public command to the exact issuer or payment subject', () => {
    expect(parseCommand(PUBLIC_EXAMPLES.issuer)).toEqual({command:'issuer', issuer:'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B', currency:'USD'});
    expect(parseCommand(PUBLIC_EXAMPLES.payment.toLowerCase())).toEqual({command:'payment', hash:PUBLIC_EXAMPLES.payment.split(' ')[1]});
    expect(parseCommand('issuer rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B usd').currency).toBe('usd');
  });
  it('rejects shell syntax, unsupported RPCs, URL destinations and additional arguments', () => {
    for (const text of ['curl https://example.com', 'submit ABC', 'payment ' + 'A'.repeat(64) + ' ; whoami', 'help && ls', 'open https://example.com', 'evidence upload', 'issuer rInvalid USD', PUBLIC_EXAMPLES.issuer.replace('USD','XRP'), PUBLIC_EXAMPLES.issuer.replace('USD','0'.repeat(40)), '<img src=x onerror=alert(1)>', 'status\nhelp', ' '.repeat(181)]) expect(() => parseCommand(text), text).toThrow();
  });
  it('keeps local help/window/export operations separate from ledger lookups', () => {
    expect(parseCommand('example payment')).toEqual({command:'example',target:'payment'});
    expect(parseCommand('open evidence')).toEqual({command:'open',target:'evidence'});
    expect(parseCommand('evidence download')).toEqual({command:'evidence',target:'download'});
    expect(parseCommand('clear')).toEqual({command:'clear'});
  });
  it('completes only an unambiguous command, never identifiers or arguments', () => {
    expect(completeCommand('pay')).toBe('payment ');
    expect(completeCommand('h')).toBe('h');
    expect(completeCommand('issuer r')).toBe('issuer r');
    expect(completeCommand('')).toBe('');
  });
});
