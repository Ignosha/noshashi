import { minimumSigners } from "./quorum";

export type TreasuryModel = {
  quorum: number;
  actors: Array<{
    id: string;
    kind: "master" | "regular" | "signer";
    weight: number;
    groups: string[];
    verified: boolean;
  }>;
};
export function treasuryModel(value: any): TreasuryModel {
  if (
    !value ||
    !Number.isInteger(value.quorum) ||
    value.quorum < 1 ||
    value.quorum > 4294967295 ||
    !Array.isArray(value.actors) ||
    !value.actors.length ||
    value.actors.length > 34
  )
    throw Error("Provide a positive quorum and 1–34 active signing paths.");
  const actors = value.actors.map((a: any) => {
    if (
      !a ||
      !/^[a-zA-Z0-9_-]{1,60}$/.test(a.id) ||
      !["master", "regular", "signer"].includes(a.kind) ||
      !Number.isInteger(a.weight) ||
      a.weight < 1 ||
      a.weight > 65535 ||
      typeof a.verified !== "boolean" ||
      !Array.isArray(a.groups) ||
      !a.groups.length ||
      a.groups.length > 8 ||
      a.groups.some(
        (g: unknown) =>
          typeof g !== "string" || !/^[a-zA-Z0-9_-]{1,60}$/.test(g),
      )
    )
      throw Error(
        "Each active path needs an id, kind, weight, dependency groups and a verified boolean. No keys are accepted.",
      );
    return {
      id: a.id,
      kind: a.kind,
      weight: a.weight,
      groups: [...new Set<string>(a.groups)],
      verified: a.verified,
    };
  });
  if (
    new Set(actors.map((a: any) => a.id)).size !== actors.length ||
    actors.filter((a: any) => a.kind === "master").length > 1 ||
    actors.filter((a: any) => a.kind === "regular").length > 1 ||
    actors.filter((a: any) => a.kind === "signer").length > 32
  )
    throw Error(
      "Signing path IDs must be unique; at most one master, one regular path and 32 signers.",
    );
  return { quorum: value.quorum, actors };
}

export function treasuryDrill(
  input: TreasuryModel,
  compromised: string[],
  unavailable: string[],
) {
  const model = treasuryModel(input);
  const groups = new Set(model.actors.flatMap((a) => a.groups));
  if ([...compromised, ...unavailable].some((g) => !groups.has(g)))
    throw Error("The selected group is not present in this model.");
  const affected = (a: TreasuryModel["actors"][number], chosen: string[]) =>
    a.groups.some((g) => chosen.includes(g));
  const compromisedActors = model.actors.filter((a) =>
    affected(a, compromised),
  );
  const surviving = model.actors.filter((a) => !affected(a, unavailable));
  const compromisedWeight = compromisedActors
    .filter((a) => a.kind === "signer")
    .reduce((s, a) => s + a.weight, 0);
  const survivingWeight = surviving
    .filter((a) => a.kind === "signer")
    .reduce((s, a) => s + a.weight, 0);
  const directCompromise = compromisedActors.some((a) => a.kind !== "signer");
  const directSurvivor = surviving.some((a) => a.kind !== "signer");
  return {
    assumptionsVerified: model.actors.every((a) => a.verified),
    compromisedActors: compromisedActors.map((a) => a.id),
    compromisedWeight,
    survivingWeight,
    quorum: model.quorum,
    minimumConfiguredSigners: Number.isFinite(
      minimumSigners(
        model.actors.filter((a) => a.kind === "signer"),
        model.quorum,
      ),
    )
      ? minimumSigners(
          model.actors.filter((a) => a.kind === "signer"),
          model.quorum,
        )
      : null,
    scenarioCanAuthorize: directCompromise || compromisedWeight >= model.quorum,
    scenarioCanOperate: directSurvivor || survivingWeight >= model.quorum,
    directCompromise,
    directSurvivor,
    sharedGroups: [...groups].filter(
      (g) => model.actors.filter((a) => a.groups.includes(g)).length > 1,
    ),
    limitation:
      "The scenario assumes any selected dependency compromise exposes every path using it. Mappings are owner-supplied; this does not inspect devices, nested signer-account authority or prove key possession.",
  };
}
