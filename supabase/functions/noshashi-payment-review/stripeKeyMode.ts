/** Recognize Stripe's test/live keys and its restricted claimable sandbox keys.
 * This determines the required Price.livemode; Stripe still authenticates the key.
 */
export function stripeKeyLivemode(secret: string): boolean | null {
  if (secret.trim() !== secret) return null;
  if (/^(sk|rk)_live_[A-Za-z0-9]+$/.test(secret)) return true;
  if (/^(sk|rk)_test_[A-Za-z0-9]+$/.test(secret)) return false;
  if (/^rkcs_test_[A-Za-z0-9]+$/.test(secret)) return false;
  return null;
}
