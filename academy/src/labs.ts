import { LABS, type Lab } from "@/lib/learn/labs";
import { TESTNET_LAB } from "@/lib/academy/testnetLab";

/** NOSHASHI's labs, plus the Academy's own testnet lab. */
export const ALL_LABS: Lab[] = [...LABS, TESTNET_LAB];
export const labById = (id: string) => ALL_LABS.find((l) => l.id === id);
