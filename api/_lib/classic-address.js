// Public AccountID validation only: XRPL base58 alphabet, version 0, 20-byte payload,
// four-byte double-SHA256 checksum. No key/seed generation or signing.
// Node built-ins avoid the codec's CommonJS -> ESM cold-start dependency failure.
import { createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
const ALPHABET='rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz';
export function isValidClassicAddress(value) {
  if(typeof value!=='string'||value.length<25||value.length>35||value[0]!=='r')return false;
  let n=0n;
  for(const c of value){const i=ALPHABET.indexOf(c);if(i<0)return false;n=n*58n+BigInt(i);}
  const bytes=[];while(n>0n){bytes.unshift(Number(n&255n));n>>=8n;}
  let zeros=0;while(value[zeros]===ALPHABET[0])zeros++;
  const decoded=Buffer.from([...Array(zeros).fill(0),...bytes]);
  if(decoded.length!==25||decoded[0]!==0)return false;
  const hash=createHash('sha256').update(createHash('sha256').update(decoded.subarray(0,21)).digest()).digest();
  return timingSafeEqual(decoded.subarray(21),hash.subarray(0,4));
}
