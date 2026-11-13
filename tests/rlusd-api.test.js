import { it, expect, vi, afterEach } from 'vitest';
vi.mock('../api/_lib/rlusd.js',()=>({snapshot:vi.fn()}));
vi.mock('../api/_lib/rate-limit.js',()=>({clientKey:()=> 'test',take:vi.fn(()=>({ok:true}))}));
import { snapshot } from '../api/_lib/rlusd.js';
import { take } from '../api/_lib/rate-limit.js';
const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(value){this.body=value;return this;}});
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();take.mockReturnValue({ok:true});});
it('coalesces concurrent reads and retains the original observation through the cache window',async()=>{
  vi.resetModules(); const {default:handler}=await import('../api/_lib/routes/rlusd.js');
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-13T14:00:00Z'));
  snapshot.mockResolvedValue({observed_at:'2026-11-13T14:00:00Z',xrpl:{status:'unavailable',value:null},ethereum:{status:'available',value:'1'}});
  const a=res(),b=res();await Promise.all([handler({method:'GET'},a),handler({method:'GET'},b)]);
  expect(snapshot).toHaveBeenCalledTimes(1);expect(a.body).toEqual(b.body);expect(a.code).toBe(200);
  vi.advanceTimersByTime(299000);const c=res();await handler({method:'GET'},c);
  expect(snapshot).toHaveBeenCalledTimes(1);expect(c.body.observed_at).toBe('2026-11-13T14:00:00Z');expect(c.body.cached_for_seconds).toBe(299);
  vi.advanceTimersByTime(1000);await handler({method:'GET'},res());expect(snapshot).toHaveBeenCalledTimes(2);
});
it('rejects mutation methods and rate-limited requests before source access',async()=>{
  vi.resetModules();const {default:handler}=await import('../api/_lib/routes/rlusd.js');
  const a=res();await handler({method:'POST'},a);expect(a.code).toBe(405);expect(a.headers.Allow).toBe('GET');
  take.mockReturnValue({ok:false,retryAfter:60});const b=res();await handler({method:'GET'},b);expect(b.code).toBe(429);expect(b.headers['Retry-After']).toBe('60');expect(snapshot).not.toHaveBeenCalled();
});
