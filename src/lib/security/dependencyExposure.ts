import { publicSource } from "./workflowEvidence";

export type SoftwareAsset = {
  id: string;
  name: string;
  version: string;
  workflow: string;
};
export type Advisory = {
  id: string;
  summary: string;
  modified: string;
  withdrawn: string | null;
  references: string[];
};
export type Exposure = {
  observedAt: string;
  source: "OSV";
  assets: Array<SoftwareAsset & { advisoryIds: string[]; incomplete: boolean }>;
  advisories: Advisory[];
  detailsUnavailable: string[];
  complete: boolean;
};
export function softwareInventory(value: unknown): SoftwareAsset[] {
  if (!Array.isArray(value) || !value.length || value.length > 50)
    throw Error(
      "Provide 1–50 npm packages with id, name, exact version and workflow.",
    );
  const items = value.map((v: any) => {
    if (
      !v ||
      typeof v.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,60}$/.test(v.id) ||
      typeof v.name !== "string" ||
      !/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]{1,150}$/.test(v.name) ||
      typeof v.version !== "string" ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
        v.version,
      ) ||
      v.version.length > 80 ||
      typeof v.workflow !== "string" ||
      !v.workflow.trim() ||
      v.workflow.length > 100
    )
      throw Error(
        "Each asset needs a unique short id, npm package name, exact version and workflow label. Version ranges are not accepted.",
      );
    return {
      id: v.id,
      name: v.name,
      version: v.version,
      workflow: v.workflow.trim(),
    };
  });
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw Error("Asset IDs must be unique.");
  return items;
}

async function boundedJson(
  url: string,
  signal: AbortSignal,
  body?: unknown,
  request = fetch,
): Promise<any> {
  const response = await request(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
    redirect: "error",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok)
    throw Error(
      `Advisory service replied ${response.status}. Coverage is unknown; retry later.`,
    );
  if (!response.body) throw Error("Advisory service returned no body.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1048576) {
        await reader.cancel();
        throw Error("Advisory response exceeded its 1 MiB limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw Error(
      "The advisory service returned malformed data. Coverage is unknown.",
    );
  }
}

/** Explicit consent is required by the caller before package metadata leaves the device. */
export async function scanDependencies(
  assets: SoftwareAsset[],
  consent: boolean,
  request = fetch,
): Promise<Exposure> {
  softwareInventory(assets);
  if (!consent)
    throw Error(
      "Approve sending package names and versions to OSV before scanning. Workflow labels and asset IDs stay on this device.",
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const batch = await boundedJson(
      "https://api.osv.dev/v1/querybatch",
      controller.signal,
      {
        queries: assets.map((a) => ({
          package: { name: a.name, ecosystem: "npm" },
          version: a.version,
        })),
      },
      request,
    );
    if (!Array.isArray(batch.results) || batch.results.length !== assets.length)
      throw Error(
        "The advisory service omitted package results. Coverage is unknown.",
      );
    const rows = assets.map((asset, i) => {
      const r = batch.results[i];
      if (
        !r ||
        typeof r !== "object" ||
        (r.vulns !== undefined && !Array.isArray(r.vulns))
      )
        throw Error("Malformed advisory results; no clearance was issued.");
      const ids = (r.vulns ?? []).map((v: any) => {
        if (
          typeof v?.id !== "string" ||
          !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,99}$/.test(v.id)
        )
          throw Error("The advisory service returned an invalid identifier.");
        return v.id as string;
      });
      return {
        ...asset,
        advisoryIds: [...new Set<string>(ids)],
        incomplete: Boolean(r.next_page_token),
      };
    });
    const ids = [...new Set(rows.flatMap((r) => r.advisoryIds))];
    const advisories: Advisory[] = [];
    const unavailable: string[] = ids.slice(20);
    // Five at a time, no more than 20 detail records, under one total deadline.
    for (let start = 0; start < Math.min(ids.length, 20); start += 5) {
      const results = await Promise.allSettled(
        ids.slice(start, start + 5).map(async (id) => {
          const d = await boundedJson(
            `https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`,
            controller.signal,
            undefined,
            request,
          );
          if (
            d.id !== id ||
            typeof d.modified !== "string" ||
            !Number.isFinite(Date.parse(d.modified))
          )
            throw Error("Incomplete advisory detail");
          const references = (Array.isArray(d.references) ? d.references : [])
            .slice(0, 10)
            .flatMap((r: any) => {
              try {
                return [publicSource(r?.url)];
              } catch {
                return [];
              }
            });
          return {
            id,
            summary: String(
              d.summary ?? "See the source advisory for details.",
            ).slice(0, 1200),
            modified: d.modified,
            withdrawn: typeof d.withdrawn === "string" ? d.withdrawn : null,
            references,
          };
        }),
      );
      results.forEach((r, i) =>
        r.status === "fulfilled"
          ? advisories.push(r.value)
          : unavailable.push(ids[start + i]),
      );
    }
    return {
      observedAt: new Date().toISOString(),
      source: "OSV",
      assets: rows,
      advisories,
      detailsUnavailable: unavailable,
      complete: !rows.some((r) => r.incomplete) && !unavailable.length,
    };
  } catch (e) {
    if (controller.signal.aborted)
      throw Error(
        "Advisory scanning reached its 20-second deadline. Coverage is unknown; retry.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
