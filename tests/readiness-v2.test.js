import { describe,it,expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { encodeAccountID, isValidClassicAddress as codec } from 'ripple-address-codec';
import { isValidClassicAddress } from '../api/_lib/classic-address.js';
import { releaseCatalog,renderReleaseRecord } from '../api/_lib/release-catalog.js';
import { sourceAge } from '../site/assets/source-age.js';
const release=(tag,at,opts={})=>({tag,at,prerelease:false,assets:[{name:`NOSHASHI_${tag.slice(1)}_aarch64.dmg`,size:100,url:`https://github.com/Ignosha/noshashi/releases/download/${tag}/mac.dmg`}],...opts});
describe('release classification',()=>{
 it('separates newest publication, actual downloads, development and Academy',()=>{const c=releaseCatalog([release('v1.0.27','2026-11-04'),release('v1.0.28','2026-11-05',{assets:[]}),release('v1.1.0-rc.1','2026-11-06',{prerelease:true}),release('academy-v9.0.0','2026-11-07')]);expect(c.latestPublished.tag).toBe('v1.1.0-rc.1');expect(c.latestDownloadable.tag).toBe('v1.0.27');expect(c.latestNonPrerelease.tag).toBe('v1.0.28');expect(c.latestDevelopment.tag).toBe('v1.1.0-rc.1');expect(c.macRuntimeVerification).toBe('UNKNOWN');});
 it('does not substitute wrong-version, foreign-host, draft or failed-source downloads',()=>{const a=release('v1.0.27','2026-11-04');a.assets[0].name='NOSHASHI_1.0.22_aarch64.dmg';expect(releaseCatalog([a]).latestDownloadable).toBe(null);const prefix=release('v1.0.2','2026-11-04');prefix.assets[0].name='NOSHASHI_1.0.27_aarch64.dmg';expect(releaseCatalog([prefix]).latestDownloadable).toBe(null);a.assets[0].name='NOSHASHI_1.0.27_aarch64.dmg';a.assets[0].url='https://evil.example/mac.dmg';expect(releaseCatalog([a]).latestDownloadable).toBe(null);expect(releaseCatalog([release('v1.0.27','2026-11-04',{draft:true})]).latestPublished).toBe(null);expect(releaseCatalog([a],{available:false}).latestPublished).toBe(null);expect(renderReleaseRecord(null)).toContain('no fallback version');});
});
describe('public API cold start and unchanged checksum semantics',()=>{
 it('matches the reference codec for random AccountIDs, checksum mutations and special accounts',()=>{const values=['rrrrrrrrrrrrrrrrrrrrrhoLvTp','rrrrrrrrrrrrrrrrrrrrBZbvji','rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B','invalid','',null];for(let i=0;i<100;i++){const a=encodeAccountID(randomBytes(20));values.push(a,a.slice(0,-1)+(a.endsWith('r')?'p':'r'));}for(const a of values)expect(isValidClassicAddress(a)).toBe(codec(a));});
 it('boots and validates the delivered route when CJS require(ESM) is disabled',()=>{const script=`import handler from './api/tools.js';const res={setHeader(){},status(n){this.code=n;return this},json(d){console.log(JSON.stringify({code:this.code,error:d.error}))}};await handler({method:'GET',query:{tool:'delivered',account:'invalid'},headers:{}},res);`;const out=execFileSync(process.execPath,['--no-experimental-require-module','--input-type=module','-e',script],{cwd:process.cwd(),encoding:'utf8'});expect(JSON.parse(out).code).toBe(400);});
});
describe('source freshness',()=>{
 it('distinguishes fresh, stale, missing and future timestamps',()=>{const now=Date.parse('2026-11-13T12:00:00Z');expect(sourceAge('2026-11-13T11:59:00Z',now)).toBe('CURRENT');expect(sourceAge('2026-11-12T11:59:00Z',now)).toBe('STALE');expect(sourceAge(null,now)).toBe('UNKNOWN');expect(sourceAge('2026-11-14',now)).toBe('UNKNOWN');});
});
