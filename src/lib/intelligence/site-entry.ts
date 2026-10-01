/**
 * Website entry for the homepage's live intelligence: the hero's system
 * strip, the Intelligence Core (the hero bloom answering each ledger),
 * the 2D network in "The network is alive", and the evidence panel in
 * "Intelligence with evidence". Bundled by scripts/build-intelligence.mjs
 * into site/assets/intelligence.js, self-hosted because the CSP allows
 * scripts from 'self' only.
 *
 * Data: the garden field (src/lib/garden/site-entry.ts) already follows
 * the ledger stream and announces each validated close as a
 * `noshashi:ledger` event, and its connection state as `noshashi:stream`.
 * This file opens its own connections only once the network or evidence
 * section is near the screen, and then reads expanded ledgers no more
 * often than every few seconds. A second, independent server is asked for
 * the same ledger's hash, and agreement is shown only when two hashes
 * were compared. No figure on the page is written in the HTML; until a
 * ledger has been read, the page says it is reading.
 *
 * Everything is 2D: Canvas 2D for the network, CSS for the bloom.
 */
import { LEDGER_SERVERS } from "../garden/ledgerStream";
import {
  compareSources,
  parseLedgerReply,
  pushWindow,
  read,
  shortAddress,
  utcClock,
  DEX_HUB,
  AMM_HUB,
  type Agreement,
  type Reading,
  type ReadLedger,
} from "./analyze";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => window.matchMedia("(max-width: 720px)").matches;
type NavigatorWithConnection = Navigator & { connection?: { saveData?: boolean } };
const saveData = Boolean((navigator as NavigatorWithConnection).connection?.saveData);

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const fmt = (n: number) => n.toLocaleString("en-US");

function setText(sel: string, text: string) {
  $$(sel).forEach((el) => (el.textContent = text));
}

/* ── Hero: system strip and Intelligence Core ───────────────────────── */

let lastIndex = 0;

function heroState(state: "connecting" | "operational" | "reconnecting") {
  $$("[data-sys-field]").forEach((el) => {
    el.dataset.state = state;
    el.textContent = state === "operational" ? "OPERATIONAL" : state === "connecting" ? "CONNECTING" : "RECONNECTING";
  });
}

function onLedgerClose(index: number, txnCount: number) {
  lastIndex = index;
  heroState("operational");
  setText("[data-sys-ledger]", `#${fmt(index)}`);
  const core = $(".core");
  if (core && !reduced) {
    // Activity 0..1 on a log scale: a quiet ledger (~20 tx) is a soft
    // breath, a busy one (~400) a full one.
    const activity = Math.min(1, Math.log1p(txnCount) / Math.log1p(400));
    core.style.setProperty("--core-activity", activity.toFixed(3));
    core.classList.remove("core-pulse");
    void (core as HTMLElement).offsetWidth;
    core.classList.add("core-pulse");
  }
  reader?.onClose(index);
}

/* ── Reader: expanded ledgers from one server, hashes from another ──── */

type Pending = { resolve: (v: unknown) => void; timer: number };

class Socket {
  private ws: WebSocket | null = null;
  private id = 100;
  private pending = new Map<number, Pending>();
  private opening: Promise<void> | null = null;
  constructor(public url: string) {}

  private open(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.opening) return this.opening;
    this.opening = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        this.opening = null;
        resolve();
      };
      ws.onmessage = (e) => {
        let m: { id?: number };
        try {
          m = JSON.parse(String(e.data));
        } catch {
          return;
        }
        const p = m.id !== undefined ? this.pending.get(m.id) : undefined;
        if (!p) return;
        window.clearTimeout(p.timer);
        this.pending.delete(m.id!);
        p.resolve(m);
      };
      const fail = () => {
        this.opening = null;
        this.ws = null;
        for (const [, p] of this.pending) {
          window.clearTimeout(p.timer);
          p.resolve(undefined);
        }
        this.pending.clear();
        reject(new Error("closed"));
      };
      ws.onerror = () => ws.close();
      ws.onclose = fail;
    });
    return this.opening;
  }

  async request(body: Record<string, unknown>, timeout = 15_000): Promise<unknown> {
    try {
      await this.open();
    } catch {
      return undefined;
    }
    const id = ++this.id;
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        resolve(undefined);
      }, timeout);
      this.pending.set(id, { resolve, timer });
      this.ws!.send(JSON.stringify({ id, ...body }));
    });
  }
}

class Reader {
  private primary = new Socket(LEDGER_SERVERS[0]);
  private second = new Socket(LEDGER_SERVERS[2]);
  private window: ReadLedger[] = [];
  private busy = false;
  private lastRead = 0;
  private failures = 0;
  private started = false;
  agreement: Agreement | null = null;

  constructor(private onReading: (r: Reading, agreement: Agreement | null, source: string) => void, private onError: () => void) {}

  private interval() {
    return saveData ? 20_000 : narrow() ? 12_000 : 7_500;
  }

  /** Begin: read the latest validated ledger and the two before it. */
  async start() {
    if (this.started) return;
    this.started = true;
    const latest = await this.fetch("validated");
    if (!latest) {
      // Nothing answered: try again shortly. After the second failure
      // fetch() has already said so on the page.
      this.started = false;
      window.setTimeout(() => active && void this.start(), 8_000);
      return;
    }
    for (const back of [1, 2]) await this.fetch(latest.index - back);
  }

  onClose(index: number) {
    if (!this.started || this.busy || !active) return;
    if (Date.now() - this.lastRead < this.interval()) return;
    void this.fetch(index);
  }

  private async fetch(index: number | "validated"): Promise<ReadLedger | null> {
    this.busy = true;
    try {
      const reply = await this.primary.request({ command: "ledger", ledger_index: index, transactions: true, expand: true });
      const ledger = parseLedgerReply(reply);
      if (!ledger) {
        this.failures += 1;
        if (this.failures >= 2 && !this.window.length) this.onError();
        return null;
      }
      this.failures = 0;
      this.lastRead = Date.now();
      const newest = !this.window.length || ledger.index > this.window[this.window.length - 1].index;
      this.window = pushWindow(this.window, ledger, 5);
      const reading = read(this.window);
      if (reading) this.onReading(reading, this.agreement, this.primary.url);
      if (newest) void this.agree(ledger);
      return ledger;
    } finally {
      this.busy = false;
    }
  }

  /** Ask the second server for the same ledger; once more if it has not caught up. */
  private async agree(ledger: ReadLedger) {
    for (const wait of [1_500, 3_000]) {
      await new Promise((r) => window.setTimeout(r, wait));
      const reply = await this.second.request({ command: "ledger", ledger_index: ledger.index }, 10_000);
      this.agreement = compareSources(ledger, reply);
      if (this.agreement.state !== "pending") break;
    }
    renderAgreement(this.agreement!, this.second.url);
  }
}

let reader: Reader | null = null;
let active = false;

/* ── Network: Canvas 2D force layout ────────────────────────────────── */

type P = { id: string; x: number; y: number; vx: number; vy: number; r: number; hub: boolean; cluster: number; weight: number };
type Pulse = { a: P; b: P; t: number; speed: number };

class Network {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private points = new Map<string, P>();
  private links: Array<{ a: P; b: P; weight: number }> = [];
  private pulses: Pulse[] = [];
  private alpha = 0;
  private frame = 0;
  private visible = false;
  private hover: P | null = null;
  private flagged = new Set<string>();
  private tip: HTMLElement | null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
    this.tip = $("[data-net-tip]");
    new ResizeObserver(() => this.resize()).observe(canvas);
    new IntersectionObserver(([e]) => {
      this.visible = Boolean(e?.isIntersecting);
      if (this.visible) this.kick();
    }).observe(canvas);
    canvas.addEventListener("pointermove", (e) => this.pointer(e));
    canvas.addEventListener("pointerleave", () => {
      this.hover = null;
      if (this.tip) this.tip.hidden = true;
      this.draw();
    });
    new MutationObserver(() => this.draw()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    this.resize();
  }

  private resize() {
    const box = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, box.width);
    this.h = Math.max(1, box.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  update(r: Reading) {
    const limit = narrow() ? 42 : 80;
    const keep = r.graph.nodes.slice(0, limit);
    const ids = new Set(keep.map((n) => n.id));
    const next = new Map<string, P>();
    const cx = this.w / 2;
    const cy = this.h / 2;
    for (const n of keep) {
      const old = this.points.get(n.id);
      const hub = n.kind === "hub";
      const r0 = hub ? 9 : Math.min(7, 1.6 + Math.sqrt(n.weight) * 0.9);
      if (old) {
        Object.assign(old, { r: r0, hub, cluster: n.cluster, weight: n.weight });
        next.set(n.id, old);
      } else {
        // New nodes enter near a neighbour already placed, else near the middle.
        const edge = r.graph.edges.find((e) => (e.a === n.id && this.points.has(e.b)) || (e.b === n.id && this.points.has(e.a)));
        const near = edge ? this.points.get(edge.a === n.id ? edge.b : edge.a)! : null;
        const ang = Math.random() * Math.PI * 2;
        const d = near ? 18 : Math.min(this.w, this.h) * 0.3 * Math.random();
        next.set(n.id, {
          id: n.id,
          x: (near?.x ?? cx) + Math.cos(ang) * d,
          y: (near?.y ?? cy) + Math.sin(ang) * d,
          vx: 0,
          vy: 0,
          r: r0,
          hub,
          cluster: n.cluster,
          weight: n.weight,
        });
      }
    }
    this.points = next;
    this.links = r.graph.edges
      .filter((e) => ids.has(e.a) && ids.has(e.b))
      .map((e) => ({ a: next.get(e.a)!, b: next.get(e.b)!, weight: e.weight }));
    this.flagged = new Set(r.assessment.contributing.map((s) => s.subject).filter((s): s is string => Boolean(s)));

    // Signals propagate: a pulse along a sample of the relationships.
    if (!reduced) {
      const sample = this.links.slice().sort(() => Math.random() - 0.5).slice(0, narrow() ? 12 : 28);
      for (const l of sample) this.pulses.push({ a: l.a, b: l.b, t: -Math.random() * 0.6, speed: 0.5 + Math.random() * 0.4 });
    }

    this.alpha = 1;
    if (reduced) {
      for (let i = 0; i < 300; i++) this.tick();
      this.alpha = 0;
      this.draw();
    } else this.kick();
  }

  private kick() {
    if (reduced || this.frame || !this.visible) return;
    const loop = () => {
      this.frame = 0;
      if (!this.visible || document.hidden) return;
      if (this.alpha > 0.005) this.tick();
      this.pulses = this.pulses.filter((p) => (p.t += 0.016 * p.speed) < 1);
      this.draw();
      if (this.alpha > 0.005 || this.pulses.length) this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  /** One step of a small force layout: repulsion, springs, and a pull to the middle. */
  private tick() {
    const pts = Array.from(this.points.values());
    const cx = this.w / 2;
    const cy = this.h / 2;
    const area = this.w * this.h;
    const k = Math.sqrt(area / Math.max(1, pts.length)) * 0.72;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = 0.25;
        }
        // Repulsion fades out beyond three spacings, so distant groups
        // are not pushed into the walls.
        if (d2 > 9 * k * k) continue;
        const f = ((k * k) / d2) * 0.03 * this.alpha;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
    }
    for (const l of this.links) {
      const dx = l.b.x - l.a.x;
      const dy = l.b.y - l.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const rest = l.a.hub || l.b.hub ? k * 0.55 : k * 0.4;
      const f = ((d - rest) / d) * 0.06 * this.alpha;
      l.a.vx += dx * f;
      l.a.vy += dy * f;
      l.b.vx -= dx * f;
      l.b.vy -= dy * f;
    }
    const pad = 14;
    for (const p of pts) {
      p.vx += (cx - p.x) * 0.007 * this.alpha;
      p.vy += (cy - p.y) * 0.018 * this.alpha;
      p.vx *= 0.82;
      p.vy *= 0.82;
      p.x = Math.max(pad, Math.min(this.w - pad, p.x + p.vx));
      p.y = Math.max(pad, Math.min(this.h - pad, p.y + p.vy));
    }
    this.alpha *= 0.985;
  }

  private draw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    if (!this.points.size) return;
    const brand = css("--brand") || "#9BE15D";
    const tele = css("--tele") || "#55D98A";
    const hold = css("--hold") || "#E7C766";
    const muted = css("--faint") || "#718473";

    // Relationships: soft curves, bowed a little so the field branches rather than meshes.
    for (const l of this.links) {
      const mx = (l.a.x + l.b.x) / 2;
      const my = (l.a.y + l.b.y) / 2;
      const nx = -(l.b.y - l.a.y) * 0.12;
      const ny = (l.b.x - l.a.x) * 0.12;
      ctx.beginPath();
      ctx.moveTo(l.a.x, l.a.y);
      ctx.quadraticCurveTo(mx + nx, my + ny, l.b.x, l.b.y);
      ctx.strokeStyle = tele;
      ctx.globalAlpha = Math.min(0.55, 0.12 + l.weight * 0.05);
      ctx.lineWidth = Math.min(2.2, 0.6 + l.weight * 0.15);
      ctx.stroke();
    }

    // Signals travelling along relationships.
    ctx.fillStyle = brand;
    for (const p of this.pulses) {
      if (p.t < 0) continue;
      const t = p.t;
      const mx = (p.a.x + p.b.x) / 2 - (p.b.y - p.a.y) * 0.12;
      const my = (p.a.y + p.b.y) / 2 + (p.b.x - p.a.x) * 0.12;
      const x = (1 - t) * (1 - t) * p.a.x + 2 * (1 - t) * t * mx + t * t * p.b.x;
      const y = (1 - t) * (1 - t) * p.a.y + 2 * (1 - t) * t * my + t * t * p.b.y;
      ctx.globalAlpha = Math.sin(Math.PI * t) * 0.9;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Entities: small organic points; hubs drawn as blooms.
    for (const p of this.points.values()) {
      const flagged = this.flagged.has(p.id);
      if (p.hub) {
        ctx.fillStyle = brand;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + (p.id === AMM_HUB ? 0.5 : 0);
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.ellipse(p.x + Math.cos(a) * p.r * 0.9, p.y + Math.sin(a) * p.r * 0.9, p.r * 0.85, p.r * 0.38, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '500 10px "IBM Plex Mono", monospace';
        ctx.fillStyle = muted;
        ctx.globalAlpha = 0.95;
        ctx.fillText(p.id === DEX_HUB ? "DEX" : "AMM", p.x + p.r + 5, p.y + 3);
        continue;
      }
      ctx.globalAlpha = p.cluster === 0 ? 0.95 : p.cluster > 0 ? 0.8 : 0.55;
      ctx.fillStyle = p.cluster >= 0 ? brand : muted;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (flagged || p === this.hover) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = flagged ? hold : brand;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private pointer(e: PointerEvent) {
    const box = this.canvas.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    let best: P | null = null;
    let bestD = 14 * 14;
    for (const p of this.points.values()) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    if (best === this.hover) return;
    this.hover = best;
    if (this.tip) {
      if (best) {
        const what = best.hub ? (best.id === DEX_HUB ? "DEX order books" : "AMM pools") : shortAddress(best.id);
        this.tip.textContent = `${what} · ${best.weight} transaction${best.weight === 1 ? "" : "s"} in the window`;
        this.tip.style.left = `${Math.min(best.x + 12, this.w - 220)}px`;
        this.tip.style.top = `${best.y + 12}px`;
        this.tip.hidden = false;
      } else this.tip.hidden = true;
    }
    this.draw();
  }
}

let network: Network | null = null;

/* ── Evidence panel and pipeline ────────────────────────────────────── */

function explorer(address: string) {
  const a = document.createElement("a");
  a.href = `https://livenet.xrpl.org/accounts/${address}`;
  a.rel = "noopener";
  a.target = "_blank";
  a.textContent = shortAddress(address);
  a.title = address;
  a.className = "mono";
  return a;
}

function renderReading(r: Reading, agreement: Agreement | null, source: string) {
  const range = r.ledgers.first === r.ledgers.last ? `#${fmt(r.ledgers.last)}` : `#${fmt(r.ledgers.first)} to #${fmt(r.ledgers.last)}`;

  // Pipeline counts.
  setText("[data-count=transactions]", fmt(r.counts.transactions));
  setText("[data-count=entities]", fmt(r.counts.entities));
  setText("[data-count=relationships]", fmt(r.counts.relationships));
  setText("[data-count=clusters]", fmt(r.counts.clusters));
  setText("[data-count=signals]", fmt(r.counts.signals));
  setText("[data-count=assessment]", r.assessment.state === "elevated" ? "Elevated" : r.assessment.state === "normal" ? "Normal" : "Reading");
  setText("[data-net-range]", `${r.ledgers.count} validated ledger${r.ledgers.count === 1 ? "" : "s"}, ${range}`);
  const largest = r.graph.clusters[0];
  const around = largest?.find((id) => id === DEX_HUB || id === AMM_HUB);
  setText(
    "[data-net-summary]",
    `Read from ${r.ledgers.count} validated XRPL ledgers (${range}): ${fmt(r.counts.transactions)} transactions between ` +
      `${fmt(r.counts.entities)} accounts, ${fmt(r.counts.relationships)} relationships, ${fmt(r.counts.clusters)} clusters` +
      (largest ? `. The largest cluster has ${largest.length} members${around ? `, gathered around the ${around === DEX_HUB ? "DEX order books" : "AMM pools"}` : ""}.` : ".")
  );
  $$("[data-net-state]").forEach((el) => (el.dataset.netState = "live"));

  // Evidence panel.
  const panel = $("[data-evidence]");
  if (panel) {
    panel.dataset.state = r.assessment.state;
    setText("[data-ev=headline]", r.assessment.headline);
    setText("[data-ev=state]", r.assessment.state === "elevated" ? "ELEVATED" : r.assessment.state === "normal" ? "NORMAL" : "INSUFFICIENT DATA");
    setText("[data-ev=rule]", r.assessment.rule);
    setText("[data-ev=evidence]", `${fmt(r.counts.transactions)} transactions across ${r.ledgers.count} validated ledgers, ${range}`);
    setText("[data-ev=source]", source.replace("wss://", ""));
    setText("[data-ev=updated]", `${utcClock(r.closeTime)} · ledger #${fmt(r.ledgers.last)} closed`);

    const list = $("[data-ev-signals]");
    if (list) {
      list.replaceChildren(
        ...r.signals.map((s) => {
          const li = document.createElement("li");
          li.className = s.excess > 0 ? "sig over" : "sig";
          const name = document.createElement("span");
          name.className = "sig-name";
          name.textContent = s.label;
          const val = document.createElement("span");
          val.className = "sig-val mono";
          val.textContent = s.display;
          const meter = document.createElement("span");
          meter.className = "sig-meter";
          meter.setAttribute("aria-hidden", "true");
          if (s.threshold !== null && s.value !== null) {
            // Scale: twice the threshold fills the row; the tick marks the threshold.
            const fill = document.createElement("i");
            fill.style.width = `${Math.min(100, (s.value / (s.threshold * 2)) * 100)}%`;
            const tick = document.createElement("b");
            tick.style.left = "50%";
            meter.append(fill, tick);
          }
          const basis = document.createElement("span");
          basis.className = "sig-basis";
          basis.textContent =
            s.threshold === null ? `${s.basis}. Reported, no threshold.` : `${s.basis}. Threshold ${(s.threshold * 100).toFixed(0)}%.`;
          if (s.subject && s.excess > 0) {
            basis.append(" Account: ", explorer(s.subject));
          }
          li.append(name, val, meter, basis);
          return li;
        })
      );
    }
  }

  const core = $(".core");
  if (core) core.dataset.state = r.assessment.state;
  network?.update(r);
  if (agreement && agreement.index <= r.ledgers.last) renderAgreement(agreement, LEDGER_SERVERS[2]);
}

function renderAgreement(a: Agreement, second: string) {
  const host = second.replace("wss://", "");
  const el = $("[data-ev=agreement]");
  if (!el) return;
  el.dataset.state = a.state;
  el.textContent =
    a.state === "agree"
      ? `2 of 2 servers agree on ledger #${fmt(a.index)} (hash ${a.hash.slice(0, 8)}…, also read from ${host})`
      : a.state === "disagree"
        ? `Servers disagree on ledger #${fmt(a.index)}: ${a.hash.slice(0, 8)}… here, ${a.other.slice(0, 8)}… at ${host}. Treat this read as unconfirmed.`
        : `Second server (${host}) has not confirmed ledger #${fmt(a.index)} yet: ${a.reason}. Not counted as agreement.`;
}

function renderOffline() {
  $$("[data-net-state]").forEach((el) => (el.dataset.netState = "offline"));
  setText("[data-net-summary]", "No public XRPL server answered from this browser, so nothing is drawn: this page shows no stored or sample figures in place of a live read. It keeps trying.");
  setText("[data-net-range]", "No validated ledger read yet");
  setText("[data-ev=headline]", "No validated ledger could be read");
  setText("[data-ev=state]", "OFFLINE");
  const panel = $("[data-evidence]");
  if (panel) panel.dataset.state = "offline";
  $("[data-ev-signals]")?.replaceChildren();
}

/* ── Start ──────────────────────────────────────────────────────────── */

function start() {
  heroState("connecting");
  window.addEventListener("noshashi:ledger", (e) => {
    const d = (e as CustomEvent<{ index: number; txnCount: number }>).detail;
    if (d && d.index > lastIndex) onLedgerClose(d.index, d.txnCount);
  });
  window.addEventListener("noshashi:stream", (e) => {
    const live = (e as CustomEvent<{ live: boolean }>).detail?.live;
    if (!live && lastIndex) heroState("reconnecting");
  });

  const canvas = $<HTMLCanvasElement>("[data-net-canvas]");
  if (canvas) network = new Network(canvas);

  const sections = $$("[data-live-read]");
  if (!sections.length) return;
  reader = new Reader(renderReading, renderOffline);
  // Open connections only when a live section is near the screen.
  const seen = new Set<Element>();
  const watch = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) seen.add(e.target);
        else seen.delete(e.target);
      }
      active = seen.size > 0;
      if (active) void reader!.start();
    },
    { rootMargin: "400px 0px" }
  );
  sections.forEach((s) => watch.observe(s));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
