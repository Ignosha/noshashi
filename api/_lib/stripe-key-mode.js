/** Classify environment only. Stripe still authenticates and scopes the key. */
export function stripeKeyLivemode(secret) {
  if (typeof secret !== "string" || secret.trim() !== secret) return null;
  if (/^(sk|rk)_live_[A-Za-z0-9]+$/.test(secret)) return true;
  if (/^(sk|rk)_test_[A-Za-z0-9]+$/.test(secret) || /^rkcs_test_[A-Za-z0-9]+$/.test(secret)) return false;
  return null;
}
