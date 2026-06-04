import React, { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import DATA from "./data/history.json";

/* ---------- helpers ---------- */
const stripAccents = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normName = (n) => stripAccents(n).toLowerCase().trim();
const shortComp = (c) => (c || "").split(",")[0];
const hms = (s) => {
  if (s == null) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};

/* ---------- derived data ---------- */
function useModel() {
  return useMemo(() => {
    const events = [...DATA.events].sort((a, b) => a.year - b.year);
    const finished = events.filter((e) => e.status === "finished");

    const bestTime = finished.reduce((m, e) => (!m || e.final_time_s < m.final_time_s ? e : m), null);
    const bestPlace = finished.reduce((m, e) => (!m || e.final_place < m.final_place ? e : m), null);

    let fastestLeg = null;
    events.forEach((e) => e.legs.forEach((l) => {
      if (l.official && l.leg_time_s && (!fastestLeg || l.leg_time_s < fastestLeg.leg_time_s))
        fastestLeg = { ...l, year: e.year, competition: e.competition };
    }));

    // participants
    const map = {};
    events.forEach((e) => e.legs.forEach((l) => {
      const k = normName(l.runner);
      if (!map[k]) map[k] = { key: k, names: {}, entries: [] };
      map[k].names[l.runner] = (map[k].names[l.runner] || 0) + 1;
      map[k].entries.push({
        year: e.year, competition: e.competition, status: e.status,
        leg: l.leg, leg_time: l.leg_time, leg_time_s: l.leg_time_s, official: l.official,
        leg_rank: l.leg_rank, leg_field: l.leg_field, cumulative_place: l.cumulative_place,
      });
    }));
    const participants = Object.values(map).map((p) => {
      const display = Object.entries(p.names).sort((a, b) => b[1] - a[1])[0][0];
      const entries = p.entries.sort((a, b) => a.year - b.year);
      const off = entries.filter((e) => e.official && e.leg_time_s);
      const fastest = off.reduce((m, e) => (!m || e.leg_time_s < m.leg_time_s ? e : m), null);
      const bestLeg = off.filter((e) => e.leg_rank).reduce((m, e) => (!m || e.leg_rank < m.leg_rank ? e : m), null);
      const legCount = {};
      entries.forEach((e) => (legCount[e.leg] = (legCount[e.leg] || 0) + 1));
      const favLeg = Object.entries(legCount).sort((a, b) => b[1] - a[1])[0][0];
      return { ...p, display, entries, appearances: entries.length, fastest, bestLeg, favLeg };
    }).sort((a, b) => b.appearances - a.appearances || a.display.localeCompare(b.display));

    const chart = events.map((e) => ({
      year: e.year,
      hours: e.status === "finished" ? +(e.final_time_s / 3600).toFixed(2) : 0,
      dnf: e.status !== "finished",
      label: e.status === "finished" ? e.final_time : "DNF",
    }));

    return { events, finished, bestTime, bestPlace, fastestLeg, participants, chart };
  }, []);
}

/* ---------- small UI bits ---------- */
const Stat = ({ k, v, sub }) => (
  <div className="stat">
    <div className="stat-v">{v}</div>
    <div className="stat-k">{k}</div>
    {sub && <div className="stat-sub">{sub}</div>}
  </div>
);

function CourseLine({ events, onPick }) {
  return (
    <div className="course">
      <svg className="course-route" preserveAspectRatio="none" viewBox="0 0 1000 60">
        <path d="M 20 30 L 980 30" className="route-path" />
      </svg>
      {events.map((e, i) => (
        <button key={e.year} className={`control ${e.status === "finished" ? "ok" : "dnf"}`}
          style={{ animationDelay: `${i * 70}ms` }} onClick={() => onPick(e.year)}>
          <span className="control-ring" />
          <span className="control-year">{e.year}</span>
          <span className="control-meta">{e.status === "finished" ? e.final_time : "DNF"}</span>
        </button>
      ))}
      <div className="control next" title="Kotka-Jukola 2026">
        <span className="control-ring pulse" />
        <span className="control-year">2026</span>
        <span className="control-meta">#1107</span>
      </div>
    </div>
  );
}

/* ---------- views ---------- */
function Home({ m, go }) {
  const dnf = m.events.length - m.finished.length;
  return (
    <div className="stack">
      <section className="hero">
        <div className="contour" aria-hidden>
          <svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice">
            {[...Array(7)].map((_, i) => (
              <ellipse key={i} cx="430" cy="120" rx={60 + i * 38} ry={40 + i * 26} />
            ))}
            {[...Array(6)].map((_, i) => (
              <ellipse key={"b" + i} cx="120" cy="320" rx={40 + i * 34} ry={28 + i * 22} />
            ))}
          </svg>
        </div>
        <div className="kite" aria-hidden><span /><span /></div>
        <p className="eyebrow">Olvastin Tana FC · Tampere</p>
        <h1 className="title">JUKOLAN<br /><span>VIESTI</span></h1>
        <p className="lede">Eight nights in the forest, 2014–2025 — and counting toward Kotka-Jukola 2026.</p>
        <div className="stats">
          <Stat k="Jukolas run" v={m.events.length} />
          <Stat k="Official finishes" v={m.finished.length} sub={`${dnf} DNF`} />
          <Stat k="Fastest finish" v={m.bestTime?.final_time} sub={shortComp(m.bestTime?.competition)} />
          <Stat k="Best placing" v={m.bestPlace?.final_place} sub={`of ${m.bestPlace?.field_size} · ${m.bestTime ? shortComp(m.bestPlace?.competition) : ""}`} />
        </div>
      </section>

      <section className="panel">
        <h2 className="h2">The course so far</h2>
        <p className="muted">Each control is a year. Tap one to open the night.</p>
        <CourseLine events={m.events} onPick={(y) => go({ type: "event", year: y })} />
      </section>

      <section className="panel">
        <h2 className="h2">Finish times by year</h2>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={m.chart} margin={{ top: 24, right: 8, left: -8, bottom: 0 }}>
              <XAxis dataKey="year" tick={{ fill: "var(--muted)", fontSize: 12, fontFamily: "var(--mono)" }} axisLine={{ stroke: "var(--hair)" }} tickLine={false} />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 12, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} unit="h" domain={[0, 22]} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{ background: "var(--bg2)", border: "1px solid var(--hair)", borderRadius: 10, fontFamily: "var(--mono)", color: "var(--ink)" }}
                formatter={(v, n, p) => [p.payload.label, "Finish"]} />
              <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="label" position="top" style={{ fill: "var(--muted)", fontSize: 10, fontFamily: "var(--mono)" }} />
                {m.chart.map((d, i) => <Cell key={i} fill={d.dnf ? "var(--bg2)" : "var(--magenta)"} stroke={d.dnf ? "var(--red)" : "none"} strokeDasharray={d.dnf ? "3 3" : "0"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="muted small">Leg distances change with every venue, so cross-year times are a vibe, not a benchmark. 2024 (Lakia) was a disqualification on leg 2 — the team ran on, but the result wasn't classified.</p>
      </section>

      <section className="panel">
        <div className="row-between">
          <h2 className="h2">Results</h2>
          <span className="muted small">tap a row</span>
        </div>
        <div className="table">
          <div className="tr th">
            <span>Year</span><span>Event</span><span className="num">Time</span><span className="num">Place</span><span className="num">Field</span>
          </div>
          {[...m.events].reverse().map((e) => (
            <button className="tr" key={e.year} onClick={() => go({ type: "event", year: e.year })}>
              <span className="mono">{e.year}</span>
              <span>{shortComp(e.competition)}</span>
              <span className={`num mono ${e.status !== "finished" ? "dnf-txt" : ""}`}>{e.status === "finished" ? e.final_time : "DNF"}</span>
              <span className="num mono">{e.final_place ?? "—"}</span>
              <span className="num mono muted">{e.field_size ?? "—"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="h2">Records</h2>
        <div className="records">
          <div className="rec">
            <div className="rec-k">Fastest single leg</div>
            <div className="rec-v mono">{m.fastestLeg?.leg_time}</div>
            <div className="rec-sub">{m.fastestLeg?.runner} · leg {m.fastestLeg?.leg} · {m.fastestLeg?.year}</div>
          </div>
          <div className="rec">
            <div className="rec-k">Fastest finish</div>
            <div className="rec-v mono">{m.bestTime?.final_time}</div>
            <div className="rec-sub">{shortComp(m.bestTime?.competition)}</div>
          </div>
          <div className="rec">
            <div className="rec-k">Best placing</div>
            <div className="rec-v mono">{m.bestPlace?.final_place}</div>
            <div className="rec-sub">of {m.bestPlace?.field_size} · {shortComp(m.bestPlace?.competition)}</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="row-between">
          <h2 className="h2">Roster</h2>
          <span className="muted small">{m.participants.length} runners</span>
        </div>
        <div className="roster">
          {m.participants.map((p) => (
            <button className="card" key={p.key} onClick={() => go({ type: "profile", key: p.key })}>
              <div className="avatar">{stripAccents(p.display).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</div>
              <div className="card-body">
                <div className="card-name">{p.display}</div>
                <div className="card-meta mono">{p.appearances} {p.appearances === 1 ? "start" : "starts"} · leg {p.favLeg}</div>
              </div>
              <div className="card-pr mono">{p.fastest ? p.fastest.leg_time : "—"}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function EventView({ year, m, go }) {
  const e = m.events.find((x) => x.year === year);
  if (!e) return null;
  return (
    <div className="stack">
      <button className="back" onClick={() => go({ type: "home" })}>← All years</button>
      <section className="hero compact">
        <p className="eyebrow">{e.year} · {e.status === "finished" ? "Classified" : "Did not finish"}</p>
        <h1 className="title sm">{shortComp(e.competition)}</h1>
        <div className="stats">
          <Stat k="Finish time" v={e.status === "finished" ? e.final_time : "DNF"} />
          <Stat k="Placing" v={e.final_place ?? "—"} sub={e.field_size ? `of ${e.field_size}` : ""} />
          <Stat k="Team #" v={e.team_number} />
          <Stat k="Legs" v={e.legs.length} />
        </div>
      </section>
      <section className="panel">
        <h2 className="h2">Legs</h2>
        <div className="legs">
          {e.legs.map((l) => {
            const up = l.place_change != null && l.place_change < 0;
            const down = l.place_change != null && l.place_change > 0;
            return (
              <div className="leg" key={l.leg}>
                <div className="leg-no mono">{l.leg}</div>
                <button className="leg-runner" onClick={() => go({ type: "profile", key: normName(l.runner) })}>
                  {l.runner}
                </button>
                <div className="leg-time mono">{l.official ? l.leg_time : `(${l.leg_time})`}</div>
                <div className="leg-rank mono muted">{l.leg_rank ? `${l.leg_rank}/${l.leg_field}` : "—"}</div>
                <div className="leg-cum mono">
                  {l.cumulative_place ? l.cumulative_place : "—"}
                  {(up || down) && <span className={up ? "up" : "down"}>{up ? "▲" : "▼"}{Math.abs(l.place_change)}</span>}
                </div>
              </div>
            );
          })}
        </div>
        {e.status !== "finished" && <p className="muted small">Times in parentheses were recorded but not classified — the team was disqualified earlier in the relay.</p>}
      </section>
    </div>
  );
}

function Profile({ pkey, m, go }) {
  const p = m.participants.find((x) => x.key === pkey);
  if (!p) return null;
  const maxField = Math.max(...p.entries.map((e) => e.leg_field || 1));
  return (
    <div className="stack">
      <button className="back" onClick={() => go({ type: "home" })}>← Roster</button>
      <section className="hero compact">
        <div className="avatar big">{stripAccents(p.display).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</div>
        <h1 className="title sm">{p.display}</h1>
        <div className="stats">
          <Stat k="Jukola starts" v={p.appearances} />
          <Stat k="Usual leg" v={p.favLeg} />
          <Stat k="Fastest leg" v={p.fastest ? p.fastest.leg_time : "—"} sub={p.fastest ? `leg ${p.fastest.leg} · ${p.fastest.year}` : ""} />
          <Stat k="Best leg rank" v={p.bestLeg?.leg_rank ?? "—"} sub={p.bestLeg ? `of ${p.bestLeg.leg_field} · ${p.bestLeg.year}` : ""} />
        </div>
      </section>
      <section className="panel">
        <h2 className="h2">Every start</h2>
        <div className="ptable">
          {[...p.entries].reverse().map((e) => {
            const pct = e.leg_rank && e.leg_field ? 1 - e.leg_rank / e.leg_field : 0;
            return (
              <button className="prow" key={e.year} onClick={() => go({ type: "event", year: e.year })}>
                <span className="mono pyear">{e.year}</span>
                <span className="pcomp">{shortComp(e.competition)}</span>
                <span className="mono pleg">leg {e.leg}</span>
                <span className={`mono ptime ${!e.official ? "dnf-txt" : ""}`}>{e.official ? e.leg_time : `(${e.leg_time})`}</span>
                <span className="pbar"><span className="pbar-fill" style={{ width: `${Math.max(pct * 100, 2)}%` }} /></span>
                <span className="mono prank muted">{e.leg_rank ? `${e.leg_rank}/${e.leg_field}` : "—"}</span>
              </button>
            );
          })}
        </div>
        <p className="muted small">Bar length = field-relative leg placing (longer is better). Courses differ each year, so it's a fairer cross-year read than raw time.</p>
      </section>
    </div>
  );
}

/* ---------- shell ---------- */
export default function App() {
  const m = useModel();
  const [view, setView] = useState({ type: "home" });
  const go = (v) => { setView(v); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="app">
      <Style />
      <header className="topbar">
        <button className="brand" onClick={() => go({ type: "home" })}>
          <span className="brand-mark" />
          <span className="brand-txt">OLVASTIN&nbsp;TANA</span>
        </button>
        <span className="brand-sub mono">JUKOLA · 2014–2026</span>
      </header>
      <main className="wrap">
        {view.type === "home" && <Home m={m} go={go} />}
        {view.type === "event" && <EventView year={view.year} m={m} go={go} />}
        {view.type === "profile" && <Profile pkey={view.key} m={m} go={go} />}
      </main>
      <footer className="foot mono">
        Data: results.jukola.com · Next control → Kotka-Jukola, 13 June 2026, team 1107
      </footer>
    </div>
  );
}

/* ---------- styles ---------- */
function Style() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600&family=Spline+Sans+Mono:wght@400;500;600&display=swap');
:root{
  --bg:#0a120d; --bg2:#0f1c15; --panel:#0e1812; --hair:rgba(120,160,135,.16);
  --ink:#e9f1ea; --muted:#7f9888; --magenta:#ff2e93; --magenta-d:#c8186f;
  --amber:#ffc24b; --green:#46c08a; --red:#ff5a5a;
  --disp:'Bricolage Grotesque',sans-serif; --body:'Hanken Grotesk',sans-serif; --mono:'Spline Sans Mono',monospace;
}
*{box-sizing:border-box}
.app{min-height:100%;background:
  radial-gradient(1200px 600px at 80% -10%, rgba(255,46,147,.10), transparent 60%),
  radial-gradient(900px 500px at -10% 110%, rgba(70,192,138,.08), transparent 55%),
  var(--bg);
  color:var(--ink);font-family:var(--body);line-height:1.5;}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.muted{color:var(--muted)} .small{font-size:12.5px}
.num{text-align:right}
.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;
  padding:14px 20px;background:rgba(10,18,13,.72);backdrop-filter:blur(10px);border-bottom:1px solid var(--hair)}
.brand{display:flex;align-items:center;gap:10px;background:none;border:0;cursor:pointer;color:var(--ink)}
.brand-mark{width:16px;height:16px;border-radius:50%;border:3px solid var(--magenta);box-shadow:0 0 14px rgba(255,46,147,.6)}
.brand-txt{font-family:var(--disp);font-weight:800;letter-spacing:.06em;font-size:15px}
.brand-sub{font-size:11px;color:var(--muted);letter-spacing:.12em}
.wrap{max-width:880px;margin:0 auto;padding:22px 18px 10px}
.stack{display:flex;flex-direction:column;gap:18px}
.panel{background:linear-gradient(180deg,var(--panel),rgba(14,24,18,.6));border:1px solid var(--hair);border-radius:18px;padding:22px}
.h2{font-family:var(--disp);font-weight:700;font-size:19px;margin:0 0 2px;letter-spacing:.01em}
.row-between{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px}

/* hero */
.hero{position:relative;overflow:hidden;background:linear-gradient(180deg,var(--bg2),var(--panel));
  border:1px solid var(--hair);border-radius:22px;padding:40px 26px 30px}
.hero.compact{padding:30px 26px 24px}
.contour{position:absolute;inset:0;opacity:.5;pointer-events:none}
.contour svg{width:100%;height:100%}
.contour ellipse{fill:none;stroke:rgba(180,140,90,.18);stroke-width:1.2}
.eyebrow{font-family:var(--mono);text-transform:uppercase;letter-spacing:.22em;font-size:11px;color:var(--magenta);margin:0 0 12px}
.title{font-family:var(--disp);font-weight:800;font-size:clamp(40px,9vw,76px);line-height:.92;margin:0;letter-spacing:-.01em}
.title span{color:var(--magenta);text-shadow:0 0 30px rgba(255,46,147,.35)}
.title.sm{font-size:clamp(28px,6vw,44px)}
.lede{max-width:46ch;color:var(--muted);margin:16px 0 0;font-size:15px}
.kite{position:absolute;top:26px;right:26px;width:34px;height:34px;transform:rotate(0);filter:drop-shadow(0 4px 10px rgba(0,0,0,.4))}
.kite span{position:absolute;width:0;height:0;border:17px solid transparent}
.kite span:first-child{border-top-color:#fff;border-left-color:#fff;top:0;left:0}
.kite span:last-child{border-bottom-color:var(--magenta);border-right-color:var(--magenta);top:0;left:0}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:26px;position:relative}
.stat{background:rgba(0,0,0,.18);border:1px solid var(--hair);border-radius:12px;padding:12px 13px}
.stat-v{font-family:var(--disp);font-weight:800;font-size:23px;line-height:1}
.stat-k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-top:7px}
.stat-sub{font-family:var(--mono);font-size:10.5px;color:var(--magenta);margin-top:3px}

/* course */
.course{position:relative;display:flex;gap:6px;justify-content:space-between;padding:14px 6px 4px;flex-wrap:wrap}
.course-route{position:absolute;left:0;right:0;top:30px;height:60px;width:100%;z-index:0}
.route-path{fill:none;stroke:var(--magenta);stroke-width:2;stroke-dasharray:2 7;stroke-linecap:round;opacity:.55}
.control{position:relative;z-index:1;background:none;border:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 2px;flex:1;min-width:64px;
  opacity:0;transform:translateY(8px);animation:rise .5s ease forwards}
.control-ring{width:26px;height:26px;border-radius:50%;border:3px solid var(--magenta);background:var(--bg);transition:.18s}
.control.ok .control-ring{box-shadow:0 0 0 4px rgba(255,46,147,.12)}
.control.dnf .control-ring{border-color:var(--red);border-style:dashed}
.control.next .control-ring{border-color:var(--amber)}
.control:hover .control-ring{transform:scale(1.18);box-shadow:0 0 18px rgba(255,46,147,.6)}
.control-year{font-family:var(--mono);font-size:12px;font-weight:600}
.control-meta{font-family:var(--mono);font-size:10px;color:var(--muted)}
.control.dnf .control-meta{color:var(--red)}
.control.next .control-meta{color:var(--amber)}
.pulse{animation:pulse 1.8s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,194,75,.5)}50%{box-shadow:0 0 0 7px rgba(255,194,75,0)}}
@keyframes rise{to{opacity:1;transform:translateY(0)}}

/* table */
.table{display:flex;flex-direction:column;border:1px solid var(--hair);border-radius:12px;overflow:hidden}
.tr{display:grid;grid-template-columns:54px 1fr 96px 64px 64px;gap:10px;align-items:center;
  padding:12px 14px;background:none;border:0;border-top:1px solid var(--hair);text-align:left;color:var(--ink);cursor:pointer;font-size:14px;width:100%}
.tr:first-child{border-top:0}
.tr.th{background:rgba(0,0,0,.18);color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;cursor:default}
.tr:not(.th):hover{background:rgba(255,46,147,.06)}
.dnf-txt{color:var(--red)}

/* records */
.records{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.rec{border:1px solid var(--hair);border-radius:14px;padding:16px;background:rgba(0,0,0,.16)}
.rec-k{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)}
.rec-v{font-size:30px;font-weight:600;margin:8px 0 4px;color:var(--amber)}
.rec-sub{font-size:12px;color:var(--muted)}

/* roster */
.roster{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.card{display:flex;align-items:center;gap:12px;background:rgba(0,0,0,.16);border:1px solid var(--hair);border-radius:14px;padding:12px 14px;cursor:pointer;text-align:left;color:var(--ink);transition:.15s}
.card:hover{border-color:var(--magenta);transform:translateY(-2px)}
.avatar{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-family:var(--disp);font-weight:800;font-size:14px;
  background:radial-gradient(circle at 30% 25%, rgba(255,46,147,.35), rgba(255,46,147,.08));border:1px solid var(--magenta);color:var(--ink);flex:none}
.avatar.big{width:64px;height:64px;font-size:22px;margin-bottom:14px}
.card-body{flex:1;min-width:0}
.card-name{font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-meta{font-size:11.5px;color:var(--muted)}
.card-pr{font-size:13px;color:var(--amber)}

/* legs */
.legs{display:flex;flex-direction:column;gap:8px}
.leg{display:grid;grid-template-columns:34px 1fr 92px 78px 92px;gap:10px;align-items:center;
  background:rgba(0,0,0,.16);border:1px solid var(--hair);border-radius:11px;padding:11px 13px}
.leg-no{width:28px;height:28px;border-radius:50%;border:2px solid var(--magenta);display:grid;place-items:center;font-size:13px;font-weight:600}
.leg-runner{background:none;border:0;color:var(--ink);text-align:left;cursor:pointer;font-size:14.5px;font-weight:500;padding:0}
.leg-runner:hover{color:var(--magenta)}
.leg-time{text-align:right;font-size:14px} .leg-rank{text-align:right;font-size:12px}
.leg-cum{text-align:right;font-size:13px;display:flex;gap:6px;justify-content:flex-end;align-items:baseline}
.up{color:var(--green);font-size:11px} .down{color:var(--red);font-size:11px}

/* profile table */
.ptable{display:flex;flex-direction:column;gap:7px}
.prow{display:grid;grid-template-columns:48px 1fr 56px 88px 90px 70px;gap:10px;align-items:center;
  background:rgba(0,0,0,.16);border:1px solid var(--hair);border-radius:11px;padding:11px 13px;cursor:pointer;color:var(--ink);text-align:left}
.prow:hover{border-color:var(--magenta)}
.pyear{font-weight:600} .pcomp{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pleg{font-size:12px;color:var(--muted)} .ptime{text-align:right;font-size:13.5px}
.pbar{height:7px;border-radius:4px;background:rgba(255,255,255,.06);overflow:hidden}
.pbar-fill{display:block;height:100%;background:linear-gradient(90deg,var(--magenta-d),var(--magenta))}
.prank{text-align:right;font-size:12px}

.back{align-self:flex-start;background:none;border:1px solid var(--hair);border-radius:999px;color:var(--muted);
  padding:7px 14px;cursor:pointer;font-family:var(--mono);font-size:12.5px}
.back:hover{color:var(--ink);border-color:var(--magenta)}
.foot{max-width:880px;margin:16px auto 0;padding:18px;color:var(--muted);font-size:11.5px;text-align:center;border-top:1px solid var(--hair)}

@media(max-width:640px){
  .stats{grid-template-columns:repeat(2,1fr)}
  .records{grid-template-columns:1fr}
  .roster{grid-template-columns:1fr}
  .tr{grid-template-columns:42px 1fr 78px 50px;}
  .tr span:nth-child(5){display:none}
  .leg{grid-template-columns:30px 1fr 80px 80px}
  .leg-rank{display:none}
  .prow{grid-template-columns:42px 1fr 70px 60px}
  .prow .pcomp,.prow .pbar{display:none}
}
`}</style>
  );
}
