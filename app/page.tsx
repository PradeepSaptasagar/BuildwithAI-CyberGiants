"use client";
import { useEffect, useRef, useState } from "react";

type Ctx = { location?: string; setting?: string; notes?: string };
type Analysis = {
  common: string; scientific: string; confidence: number; organ: string; limitations: string; context: string;
  alternatives: { name: string; confidence: number }[];
  taxonomy: Record<string, string>; related: { name: string; why: string }[];
  health: { status: string; observations: string[]; inferences: string[]; possible_causes: string[]; next_photos: string[] };
  knowledge: Record<string, string>;
  claims: { text: string; type: string; support: string }[];
  plantnet?: { name: string; score: number }[];
};
type Change = { changed: string[]; stable: string[]; significant: boolean; severity: string; reasoning: string; next_photos: string[] };
type Obs = { id: string; date: string; image: string; ctx: Ctx; a: Analysis; change?: Change; mock?: boolean };
type Plant = { id: string; obs: Obs[] };

const KEY = "phytoatlas:v1";
const TONE: Record<string, string> = { Healthy: "#3f8f5b", Monitor: "#c9a227", "Possible Stress": "#d9822b", "Significant Change": "#c0443a" };
const tone = (s: string) => TONE[s] ?? "#8a948d";
const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function shrink(f: File) {
  return new Promise<string>((res, rej) => {
    const im = new Image(), u = URL.createObjectURL(f);
    im.onload = () => {
      const s = Math.min(1, 900 / Math.max(im.width, im.height)), c = document.createElement("canvas");
      c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u); res(c.toDataURL("image/jpeg", 0.72));
    };
    im.onerror = () => rej(new Error("That file isn't a readable image. Try a JPG or PNG."));
    im.src = u;
  });
}

async function api<T>(body: object): Promise<{ data: T; mock: boolean }> {
  const r = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Analysis failed. Try again.");
  return j;
}

const Status = ({ s }: { s: string }) => <span className="pill"><i style={{ background: tone(s) }} />{s}</span>;
const List = ({ items }: { items?: string[] }) => <ul>{(items ?? []).map((x, i) => <li key={i}>{x}</li>)}</ul>;

export default function App() {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"home" | "plants" | "passport">("home");
  const [pid, setPid] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { try { setPlants(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch {} setReady(true); }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(plants)); } catch { setErr("Browser storage is full. Delete an old plant to keep saving."); }
  }, [plants, ready]);

  async function scan(file: File, ctx: Ctx, plantId?: string) {
    setErr("");
    try {
      setBusy("Reading the image…");
      const image = await shrink(file);
      const plant = plants.find(p => p.id === plantId), prev = plant?.obs.at(-1);
      setBusy("Identifying the plant and reading its health…");
      const r = await api<Analysis>({ mode: "scan", image, context: ctx, history: prev && { date: prev.date.slice(0, 10), status: prev.a.health.status, observed: prev.a.health.observations } });
      const obs: Obs = { id: crypto.randomUUID(), date: new Date().toISOString(), image, ctx, a: r.data, mock: r.mock };
      if (prev) {
        setBusy("Comparing with the previous scan…");
        try { obs.change = (await api<Change>({ mode: "compare", image: prev.image, image2: image, context: ctx })).data; } catch {}
      }
      const id = plant?.id ?? crypto.randomUUID();
      setPlants(ps => plant ? ps.map(p => (p.id === id ? { ...p, obs: [...p.obs, obs] } : p)) : [{ id, obs: [obs] }, ...ps]);
      setPid(id); setView("passport");
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy("");
  }

  const plant = plants.find(p => p.id === pid);
  const open = (id: string) => { setPid(id); setView("passport"); };

  return (
    <>
      <header><div className="wrap">
        <button className="brand" onClick={() => setView("home")} aria-label="PhytoAtlas home">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2E5E47" strokeWidth="1.8" strokeLinecap="round"><path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19c3-5 6-8 10-10"/></svg>PhytoAtlas
        </button>
        <nav><button className={view === "home" ? "on" : ""} onClick={() => setView("home")}>Scan</button>
          <button className={view !== "home" ? "on" : ""} onClick={() => setView("plants")}>My plants{plants.length ? ` (${plants.length})` : ""}</button></nav>
      </div></header>

      <main className="wrap">
        {err && <div className="err" role="alert">{err}</div>}

        {view === "home" && <>
          <section className="hero">
            <h1>Explore every plant through AI.</h1>
            <p className="lede">Photograph a leaf. PhytoAtlas names it, reads its health, and keeps a dated record so you can see what changes and what to check next.</p>
            <Scanner onScan={(f, c) => scan(f, c)} busy={busy} />
          </section>
          {plants.length > 0 && <section className="sec"><h2>Recent plants</h2><Grid plants={plants.slice(0, 4)} open={open} /></section>}
          <section className="sec three">
            <div><h3>Identify</h3><p className="mute">Species, family and alternatives, with confidence and stated limits.</p></div>
            <div><h3>Remember</h3><p className="mute">Every scan joins that plant’s timeline, so nothing is a one-off result.</p></div>
            <div><h3>Investigate</h3><p className="mute">Compare scans, ask why, and get a list of the photos that would settle it.</p></div>
          </section>
        </>}

        {view === "plants" && <section className="sec"><h2>My plants</h2>
          {plants.length ? <Grid plants={plants} open={open} /> : <p className="mute">No plants yet. Scan one to start its passport.</p>}
        </section>}

        {view === "passport" && plant && <Passport key={plant.id} plant={plant} busy={busy} onScan={(f, c) => scan(f, c, plant.id)}
          onDelete={() => { if (confirm("Delete this plant and all its scans?")) { setPlants(ps => ps.filter(p => p.id !== plant.id)); setView("plants"); } }} />}
        <p className="foot">PhytoAtlas gives possibilities, not diagnoses. Confirm plant health and any medicinal use with a local agricultural or medical expert.</p>
      </main>
    </>
  );
}

function Grid({ plants, open }: { plants: Plant[]; open: (id: string) => void }) {
  return <div className="grid">{plants.map(p => {
    const f = p.obs[0], l = p.obs.at(-1)!;
    return <button key={p.id} className="card" onClick={() => open(p.id)}>
      <img src={l.image} alt={f.a.common} />
      <div className="b"><h3>{f.a.common}</h3><span className="sci">{f.a.scientific}</span>
        <Status s={l.a.health.status} />
        <span className="mute">{p.obs.length} scan{p.obs.length > 1 ? "s" : ""} · last {fmt(l.date)}{l.change ? ` · change: ${l.change.severity}` : ""}</span></div>
    </button>;
  })}</div>;
}

function Scanner({ onScan, busy, compact }: { onScan: (f: File, c: Ctx) => void; busy: string; compact?: boolean }) {
  const [ctx, setCtx] = useState<Ctx>({}), [drag, setDrag] = useState(false), [more, setMore] = useState(false);
  const cam = useRef<HTMLInputElement>(null), up = useRef<HTMLInputElement>(null);
  const pick = (f?: File) => { if (f) onScan(f, ctx); };
  const set = (k: keyof Ctx) => (e: { target: { value: string } }) => setCtx({ ...ctx, [k]: e.target.value });
  return (
    <div className={"scanner" + (drag ? " drag" : "")} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}>
      {busy ? <div className="busy" role="status"><span className="spin" />{busy}</div> : <>
        {!compact && <p className="drop">Drop a leaf photo here</p>}
        <div className="row">
          <button className="btn" onClick={() => cam.current?.click()}>{compact ? "Add observation" : "Scan a plant"}</button>
          <button className="btn ghost" onClick={() => up.current?.click()}>Upload image</button>
        </div>
        <button className="link" onClick={() => setMore(!more)}>{more ? "Hide context" : "Add context (optional)"}</button>
        {more && <div className="ctx">
          <input placeholder="Location, e.g. Pune, India" value={ctx.location ?? ""} onChange={set("location")} />
          <select value={ctx.setting ?? ""} onChange={set("setting")}>
            <option value="">Setting (optional)</option><option>Indoor</option><option>Balcony / outdoor pot</option><option>Garden</option><option>Farm / crop</option><option>Wild</option>
          </select>
          <textarea rows={2} placeholder="Notes: watering, age, what you noticed" value={ctx.notes ?? ""} onChange={set("notes")} />
        </div>}
      </>}
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={up} type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

const TABS = ["Overview", "Health", "Taxonomy", "Knowledge", "Evidence", "Ask"];

function Passport({ plant, busy, onScan, onDelete }: { plant: Plant; busy: string; onScan: (f: File, c: Ctx) => void; onDelete: () => void }) {
  const [tab, setTab] = useState("Overview"), [sel, setSel] = useState(plant.obs.length - 1), [q, setQ] = useState("");
  const id = plant.obs[0].a, o = plant.obs[sel] ?? plant.obs.at(-1)!, a = o.a, ch = o.change;
  const brief = plant.obs.map(x => ({ date: x.date.slice(0, 10), status: x.a.health.status, observed: x.a.health.observations, context: x.ctx, change: x.change?.reasoning }));
  const explore = (name: string) => { setQ(`Tell me about ${name} and how it relates to my plant.`); setTab("Ask"); };

  return <>
    {o.mock && <div className="demo">Demo mode: no API key is configured, so this passport shows sample data, not a real analysis.</div>}
    <div className="pass">
      <img src={o.image} alt={id.common} />
      <div>
        <h2>{id.common}</h2><div className="sci" style={{ fontSize: "1.2rem" }}>{id.scientific}</div>
        <div className="meta">
          <span>Family <b>{id.taxonomy?.family}</b></span>
          <span>Confidence <span className="bar"><i style={{ width: `${Math.round(id.confidence * 100)}%` }} /></span> <b>{Math.round(id.confidence * 100)}%</b></span>
          <span>{plant.obs.length} scan{plant.obs.length > 1 ? "s" : ""} since {fmt(plant.obs[0].date)}</span>
        </div>
        <Status s={a.health.status} />
        <div className="tl" role="list" aria-label="Health timeline">
          {plant.obs.map((x, i) => <button key={x.id} className={i === sel ? "on" : ""} onClick={() => setSel(i)} aria-label={`Scan ${fmt(x.date)}, ${x.a.health.status}`}>
            <img src={x.image} alt="" style={{ borderColor: tone(x.a.health.status) }} />{fmt(x.date)}<span>{x.a.health.status}</span></button>)}
        </div>
      </div>
    </div>

    {ch && <div className="box" style={{ marginBottom: 14 }}>
      <h3>What changed since the previous scan <span className="tag">{ch.severity} change</span></h3>
      <p>{ch.reasoning}</p>
      <div className="three" style={{ marginTop: 10 }}>
        <div><b>Changed</b><List items={ch.changed} /></div><div><b>Stayed stable</b><List items={ch.stable} /></div>
        <div><b>Photograph next</b><List items={ch.next_photos} /></div>
      </div>
    </div>}

    <div className="tabs" role="tablist">{TABS.map(t => <button key={t} role="tab" aria-selected={t === tab} className={t === tab ? "on" : ""} onClick={() => setTab(t)}>{t}</button>)}</div>

    {tab === "Overview" && <div className="stack">
      <div className="box"><h3>Context reasoning</h3><p>{a.context}</p>{o.ctx.location || o.ctx.setting ? <p className="mute" style={{ marginTop: 6 }}>Using: {[o.ctx.location, o.ctx.setting].filter(Boolean).join(", ")}</p> : null}</div>
      <div className="box"><h3>How sure is this?</h3><p>Visible organ: {a.organ}. {a.limitations}</p>
        {a.alternatives?.length > 0 && <p className="mute" style={{ marginTop: 6 }}>Other candidates: {a.alternatives.map(x => `${x.name} (${Math.round(x.confidence * 100)}%)`).join(", ")}</p>}</div>
      <Scanner compact onScan={onScan} busy={busy} />
      <button className="link" style={{ justifySelf: "start" }} onClick={onDelete}>Delete this plant</button>
    </div>}

    {tab === "Health" && <div className="stack">
      <div className="box"><h3><span className="tag">Observation</span>What is visible</h3><List items={a.health.observations} /></div>
      <div className="box"><h3><span className="tag ai">Inference</span>What it may mean</h3><List items={a.health.inferences} /></div>
      <div className="box"><h3>Possible causes to rule in or out</h3><List items={a.health.possible_causes} /></div>
      <div className="box"><h3>Photograph next</h3><List items={a.health.next_photos} /></div>
      <p className="mute">No diagnosis is made from a single image. Confirm with a local agricultural expert before treating.</p>
    </div>}

    {tab === "Taxonomy" && <div>
      <div className="chain">{["kingdom", "order", "family", "genus", "species"].map(r => <div key={r}><span>{r}</span><b>{a.taxonomy?.[r]}</b></div>)}</div>
      <h3 style={{ marginBottom: 8 }}>Related plants</h3>
      <div className="stack">{a.related?.map(r => <button key={r.name} className="card" style={{ padding: "12px 14px" }} onClick={() => explore(r.name)}>
        <b className="sci" style={{ fontSize: "1.05rem" }}>{r.name}</b><div className="mute">{r.why}</div></button>)}</div>
    </div>}

    {tab === "Knowledge" && <div className="stack">
      {([["general", "General botany", ""], ["traditional", "Traditional use", "Traditionally reported. Not proof of clinical effect."], ["agricultural", "Agricultural practice", ""], ["safety", "Safety", ""]] as const).map(([k, t, n]) =>
        <div className="box" key={k}><h3>{t}</h3><p>{a.knowledge?.[k]}</p>{n && <p className="mute" style={{ marginTop: 4 }}>{n}</p>}</div>)}
    </div>}

    {tab === "Evidence" && <div className="stack">
      <p className="mute">Claims below are generated by the AI model from your photo and its training knowledge. They are not retrieved citations, so verify anything important with a primary source.</p>
      {a.plantnet?.length ? <div className="box"><h3>Pl@ntNet specialist matches</h3><List items={a.plantnet.map(p => `${p.name} (${Math.round(p.score * 100)}%)`)} /></div> : null}
      {a.claims?.map((c, i) => <div className="box" key={i}><span className={"tag" + (c.type === "observation" ? "" : " ai")}>{c.type}</span>{c.text}<div className="mute">Basis: {c.support}</div></div>)}
    </div>}

    {tab === "Ask" && <Ask key={q} seed={q} plant={{ common: id.common, scientific: id.scientific }} history={brief} />}
  </>;
}

function Ask({ seed, plant, history }: { seed: string; plant: object; history: object[] }) {
  const [msgs, setMsgs] = useState<{ r: "u" | "a"; t: string }[]>([]), [q, setQ] = useState(seed), [busy, setBusy] = useState(false);
  async function send(text: string) {
    if (!text.trim() || busy) return;
    setMsgs(m => [...m, { r: "u", t: text }]); setQ(""); setBusy(true);
    try {
      const r = await api<{ answer: string; next_photos: string[] }>({ mode: "ask", question: text, plant, history });
      setMsgs(m => [...m, { r: "a", t: r.data.answer + (r.data.next_photos?.length ? "\n\nPhotograph next:\n• " + r.data.next_photos.join("\n• ") : "") }]);
    } catch (e) { setMsgs(m => [...m, { r: "a", t: e instanceof Error ? e.message : "Could not answer. Try again." }]); }
    setBusy(false);
  }
  return <div className="chat">
    {!msgs.length && <div className="chips">{["Why might my plant be stressed?", "What should I photograph next?", "How has it changed over time?"].map(s => <button key={s} onClick={() => send(s)}>{s}</button>)}</div>}
    {msgs.map((m, i) => <div key={i} className={"msg " + m.r}>{m.t}</div>)}
    {busy && <div className="busy"><span className="spin" />Thinking…</div>}
    <div className="ask"><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && send(q)} placeholder="Ask about this plant" aria-label="Ask about this plant" />
      <button className="btn" onClick={() => send(q)} disabled={busy}>Ask</button></div>
  </div>;
}
