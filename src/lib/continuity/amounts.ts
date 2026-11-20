import { plainDecimal } from "../../../api/_lib/delivered.js";
import { toUnits } from "../../../supabase/functions/_shared/protection.ts";

/** Shared exact amount readers, bounded before exponent expansion. */
export function amountUnits(value: unknown): bigint {
  if (
    typeof value !== "string" ||
    value.length > 200 ||
    !/^\d+(?:\.\d+)?(?:[eE][+-]?\d{1,3})?$/.test(value)
  ) {
    throw new Error("Use a non-negative decimal amount as text.");
  }
  const exponent = Number(value.match(/[eE]([+-]?\d+)$/)?.[1] ?? 0);
  if (Math.abs(exponent) > 96)
    throw new Error("Amount exponent exceeds the supported range.");
  return toUnits(plainDecimal(value), 96);
}
export function amountText(value: bigint): string {
  const digits = value.toString().padStart(97, "0");
  const fractional = digits.slice(-96).replace(/0+$/, "");
  return digits.slice(0, -96) + (fractional ? "." + fractional : "");
}
