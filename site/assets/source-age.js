// Source-read age, not article age or proof of ledger consensus.
export function sourceAge(value, now=Date.now(), maxAgeMs=30*60*1000) {
 const at=typeof value==='string'?Date.parse(value):NaN;
 if(!Number.isFinite(at)||at>now+60000)return 'UNKNOWN';
 return now-at>maxAgeMs?'STALE':'CURRENT';
}
export const utcStamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC'):'time unknown';
