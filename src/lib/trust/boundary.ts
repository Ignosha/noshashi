import type { SceneId } from "@/App";
import raw from "./boundary.json";

/**
 * The trust boundary, typed. The data lives in boundary.json so the
 * website build (plain Node) can read the same file the app renders.
 */
export type TrustStage = {
  id: string;
  label: string;
  summary: string;
  detail: string;
  where: string[];
  scene: SceneId;
};

export type Trust = {
  scope: string;
  readCommands: string[];
  forbiddenCommands: string[];
  forbiddenPackages: string[];
  stages: TrustStage[];
  boundaries: { id: string; label: string; claim: string; basis: string }[];
  dataFlows: { party: string; what: string; why: string }[];
  oversight: string[];
  limits: string[];
};

export const TRUST = raw as Trust;
