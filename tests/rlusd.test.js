import { describe, it, expect, vi } from 'vitest';
import { decimal, units, readXRPL, readEthereum, snapshot, RLUSD } from '../api/_lib/rlusd.js';
import { change } from '../site/assets/rlusd-math.js';
const hash = 'A'.repeat(64);
describe('RLUSD exact evidence', () => {
  it('normalizes exponent values without floating point loss', () => {
    expect(decimal('1234567890123456e-6')).toBe('1234567890.123456');
    expect(decimal('1e-8')).toBe('0.00000001');
    expect(decimal('100.0000')).toBe('100');
    expect(units('0x20000000000001',6)).toBe('9007199254.740993');
    for (const v of ['-1','NaN','1e999','0x12','Infinity']) expect(()=>decimal(v)).toThrow();
  });
  it('pins obligations to the same validated ledger and official identity', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({result:{validated:true,ledger_hash:hash,ledger_index:123,ledger:{close_time:800000000}}}).mockResolvedValueOnce({endpoint:'https://xrplcluster.com',result:{validated:true,account:RLUSD.issuer,ledger_hash:hash,ledger_index:123,obligations:{[RLUSD.currency]:'10.20'}}});
    expect((await readXRPL(rpc)).value).toBe('10.2');
    expect(rpc.mock.calls[1][1]).toEqual({account:RLUSD.issuer,strict:true,ledger_hash:hash});
  });
  it.each([{validated:false},{ledger_hash:'B'.repeat(64)},{account:'wrong'},{obligations:{}}])('rejects missing or mismatched evidence %j',async override=>{
    const rpc=vi.fn().mockResolvedValueOnce({result:{validated:true,ledger_hash:hash,ledger_index:123,ledger:{close_time:800000000}}}).mockResolvedValueOnce({result:{validated:true,account:RLUSD.issuer,ledger_hash:hash,ledger_index:123,obligations:{[RLUSD.currency]:'10'},...override}});
    await expect(readXRPL(rpc)).rejects.toThrow();
  });
  it('pins Ethereum decimals and supply to a finalized canonical block',async()=>{
    const values=['0x1',{hash:'0x'+hash,number:'0x10',timestamp:'0x6553f100'},'0x'+(6).toString(16).padStart(64,'0'),'0x'+(1234567).toString(16).padStart(64,'0')];
    const fetcher=vi.fn(async()=>({ok:true,json:async()=>({id:1,result:values.shift()})}));
    expect((await readEthereum(fetcher)).value).toBe('1.234567');
    for (const call of fetcher.mock.calls.slice(2)) expect(JSON.parse(call[1].body).params[1]).toEqual({blockHash:'0x'+hash,requireCanonical:true});
  });
  it('fails closed on wrong Ethereum chain',async()=>{
    await expect(readEthereum(async()=>({ok:true,json:async()=>({id:1,result:'0x89'})}))).rejects.toThrow('Wrong');
  });
  it('preserves independent partial results without a fabricated total or history',async()=>{
    const s=await snapshot({xrpl:async()=>({status:'available',value:'5'}),ethereum:async()=>{throw Error('no');}});
    expect(s.ethereum.value).toBeNull(); expect(s.xrpl.value).toBe('5'); expect(s.history).toEqual([]); expect(s.total).toBeUndefined();
  });
  it('checks thresholds exactly above floating point precision',()=>{
    expect(change('9007199254740993','9097271247288402.93',100).triggered).toBe(true);
    expect(change('100','99.00001',100).triggered).toBe(false);
    expect(change('100','99',100)).toEqual({direction:'decrease',triggered:true});
    expect(change('0','1',100).triggered).toBeNull();
    expect(()=>change('1','2',0)).toThrow();
  });
});
