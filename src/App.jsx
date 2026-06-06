import React, { useState, useMemo, useEffect, useRef } from "react";
import DATA from "./data/history.json";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, Legend } from "recharts";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, setDoc } from "firebase/firestore";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const firebaseConfig = {
  apiKey: "AIzaSyDu7ly4QsN92-RcTOPKJ8OOnZJV6YFP1LI",
  authDomain: "olvastin-tana.firebaseapp.com",
  projectId: "olvastin-tana",
  storageBucket: "olvastin-tana.firebasestorage.app",
  messagingSenderId: "329995217572",
  appId: "1:329995217572:web:515c0a87058a5830d49431",
};
const fbApp = initializeApp(firebaseConfig);
const fbDb = getFirestore(fbApp);
const authReady = signInAnonymously(getAuth(fbApp)).catch((e) => console.warn("Anon auth failed:", e));

/* ---------- GPS tracks (Firestore + GPX pipeline) ---------- */
const _rad = (d) => (d * Math.PI) / 180;
function _hav(a, b) {
  const R = 6371000, dla = _rad(b.lat - a.lat), dlo = _rad(b.lng - a.lng);
  const x = Math.sin(dla / 2) ** 2 + Math.cos(_rad(a.lat)) * Math.cos(_rad(b.lat)) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function parseGpxText(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const out = [];
  const nodes = xml.getElementsByTagName("trkpt");
  for (const p of nodes) {
    const lat = parseFloat(p.getAttribute("lat")), lng = parseFloat(p.getAttribute("lon"));
    const tEl = p.getElementsByTagName("time")[0];
    if (isFinite(lat) && isFinite(lng)) out.push({ lat, lng, t: tEl ? Date.parse(tEl.textContent) : null });
  }
  return out;
}
function trimIdle(a) {
  if (a.length < 16) return a;
  const moving = (k, dir) => {
    let d = 0, dt = 0, n = k;
    for (let c = 0; c < 8 && n + dir >= 0 && n + dir < a.length; c++) { d += _hav(a[n], a[n + dir]); dt += Math.abs((a[n + dir].t - a[n].t) || 1000) / 1000; n += dir; }
    return dt > 0 && d / dt > 0.6;
  };
  let i = 0, j = a.length - 1;
  while (i < j && !moving(i, 1)) i++;
  while (j > i && !moving(j, -1)) j--;
  return a.slice(i, j + 1);
}
function simplifyTrack(raw, target = 400) {
  const lat0 = _rad(raw[0].lat), kx = Math.cos(lat0);
  const xy = raw.map((p) => ({ x: p.lng * kx * 111320, y: p.lat * 110540, o: p }));
  const rdp = (a, eps) => {
    if (a.length < 3) return a;
    let dmax = 0, idx = 0; const A = a[0], B = a[a.length - 1];
    const dx = B.x - A.x, dy = B.y - A.y, Ln = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < a.length - 1; i++) { const d = Math.abs((a[i].x - A.x) * dy - (a[i].y - A.y) * dx) / Ln; if (d > dmax) { dmax = d; idx = i; } }
    if (dmax > eps) return rdp(a.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(a.slice(idx), eps));
    return [A, B];
  };
  let eps = 2.5, s = rdp(xy, eps);
  while (s.length > target) { eps += 1; s = rdp(xy, eps); }
  return s.map((p) => ({ lat: +p.o.lat.toFixed(5), lng: +p.o.lng.toFixed(5) }));
}
function buildTrack(gpxText) {
  const raw = trimIdle(parseGpxText(gpxText).filter((p) => p.lat));
  if (raw.length < 2) throw new Error("No track points found in this file.");
  const points = simplifyTrack(raw);
  let dist = 0; for (let i = 1; i < raw.length; i++) dist += _hav(raw[i - 1], raw[i]);
  const durS = raw[0].t && raw[raw.length - 1].t ? Math.round((raw[raw.length - 1].t - raw[0].t) / 1000) : null;
  return { points, distanceKm: +(dist / 1000).toFixed(2), durationS: durS };
}
const trackKey = (runnerKey, year, leg) => `${runnerKey}_${year}_${leg}`;
async function loadTracks() {
  const snap = await getDocs(collection(fbDb, "tracks"));
  const map = {};
  snap.forEach((d) => { const t = d.data(); map[trackKey(t.runnerKey, t.year, t.leg)] = t; });
  return map;
}
async function saveTrack(t) {
  await authReady;
  const id = trackKey(t.runnerKey, t.year, t.leg).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  await setDoc(doc(fbDb, "tracks", id), { ...t, createdAt: Date.now() });
}

const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGMAAACMBAMAAACaBwrxAAABCGlDQ1BJQ0MgUHJvZmlsZQAAeJxjYGA8wQAELAYMDLl5JUVB7k4KEZFRCuwPGBiBEAwSk4sLGHADoKpv1yBqL+viUYcLcKakFicD6Q9ArFIEtBxopAiQLZIOYWuA2EkQtg2IXV5SUAJkB4DYRSFBzkB2CpCtkY7ETkJiJxcUgdT3ANk2uTmlyQh3M/Ck5oUGA2kOIJZhKGYIYnBncAL5H6IkfxEDg8VXBgbmCQixpJkMDNtbGRgkbiHEVBYwMPC3MDBsO48QQ4RJQWJRIliIBYiZ0tIYGD4tZ2DgjWRgEL7AwMAVDQsIHG5TALvNnSEfCNMZchhSgSKeDHkMyQx6QJYRgwGDIYMZAKbWPz9HbOBQAAAAMFBMVEX//w7//wb//wX+/wX//wP+/Qj7+wn8/APc3Rl7exgqKg4ICAUDAgMAAAMAAAEAAADvvuYDAAALiUlEQVR42uWZaVhTVxrH33MDCgLJuWHRBkhuwiJWIQEUpaJQlrpjxaWLdepjW0fr0+XpdGrttDPVTttpp/N06jjdnlZtHe1i61JntI6iWEdslSUhFqhCcsMmCuTemygGk9wzH1hMAjfip/kw+cRzL7+8y3nP+3/PCdLBHX5ECu74879GGF7iRYjE8yxH1x1aoardbfl36Fjq+GfRqB3T1RRrAfhdc2skEDRsKbXJF40hBcd+Vzo7YuSlHGYFZX7i2oyhOEboiRiVFSKsacrVZWEec5p3LlbIxFFYKXnn4xLGawTOYPV2lNU1j2BFRvtnI6tsgV1FqVQq4DvpmkR2OEECEPrINi67/w07OQL2jLkdQuJs28fqwgEALIo4U9KUsOSfxg5D/GKhVEszQmgAAC/HdsVwKHfBKhsbbPUpKjSlBQNUA8iyExudAkn9x2E2aJK51Lq6aMErZHXX8qTn1efXsCD/QjgQmGSfWIgrbz2oQiM85Sfa130TXlgZMveKG73VGyYdCwpxaZRRZnfNOjp6I3j2lm3AelK4YZgZX8dizM5WPmLPtjUcf2K20+J85MN/YjCb90s7Bqm/ikyJ27NjxfZ6ui+sRpXpzPSUdRQvmd0pvS45ugmd/9mw8Bxerro7YiZ3vcF4OkZ1Jd4FvGQs3y/y6o88aVbAOWP+ARizZg7QgB0JnBFLxRLqOM13z4W1FAM0AA2I1mG6RuHRx0tXsgCU8BENNMVgBwMAUG0HndziwbyUFUdve5TMoiM8b/epdEPVYZNRykrBDAvD8dUDHaA/LcR6PFrBGCXaBZeoBI6XMQrEqlngqglPeAAOpuODkh2GAJLRUMUB/BsID+JLAMs9JnVsPCXdlBB3iePB8vFyT8jxbJYpznQo+GI3YMk+hgHgxtHTBihuKSBrIbOpwsKBTpFlpy9ESFrBFCTrTrRo+L39mxpo4DjHCqbgfJAGy3v2Cwr/VWBZOBCsJ+M70xfE8mSErs4A3C9phSEITgxDWAYqJJFQBBOUw5ACxGNJxCPKcd0w6fBSVkYSOW3X0/cGItXJNO+RRNg/WJmDgZqK3ah/H8fSIyDRBNAqTQCTXK/g9QCMY1yMnuGGrYsCmROzAqzYlPkIAEyaOUcrlf1NwAe5qTY7NEIAIhzsMbMA6lmxX60/uTqwxqh7uMS0F/wyStl1Dyh2RWBo63yExrDtsU+xHyK2qYhSSPANRiR5ylp5OgugNIBOO2F9loL1VTHk+eo550S60QfRJJb/tlphAvKwnlJ5QybcvVPDE9/w5b822yfu9nWsVfFcwvUYHsbsygCQeR3Ffw7IWC3VpMiyG249cGrjk+xbdmBicDCivRopWkINASIe2mK2mc+UD2aAOPMP//yDeT+gWfma9Dp9a7o9cTLvP/WpH/iBzPt29VBwMu82T7sVQNaZmPDt+YMgq8nHAVbQ1O9aTV3PxGMjBiJLjFPHLr306My6nlRzXdV6cJ2WnTKd8hcLoDoe5tSZUD7JGgaUMu/ivufl36dWiH15T0JrsvN+emahJSxQxKnw95ZenUx//fjEnvlRu9jdaVW/6YDkbu8S+kL7hTTc/b3cV18YBwEgXfM897iVqjfHjW3bt/mJLPfn6TaSlPevTV12cVxzfrOmEYAMxkIJeawNA/Nz39tF1CUrB4hO1nj3fKDWJX7T+UE6dC/UtgkbeowA4iCChGzDXgAA/ZGtxVpSLei0bFflxkfl1SffSpKHJpJyITX803Lso5W4JPxoclH7uM62tZtUl8MnJXE9VWdfnnW88okVC9trr3rDFiTEVcroy0PCR66VzvKkvTguGoqB23gkzYIBuFciPfc9QE+L/Papwj52qdBNGrprb0kS6XU42jw1HN+4E2D5ySgrAIS9SqMkHXPM8lTh1ZzPdziWXVwcATAUCypLMxBKb+uxksHap5GSoZjztZcv6LZHLdZ3mAt7Ww74qFhI6xyI9tbydAm2UxgIq7VoBSyWn2t+afwjH9M5H5nSV62VLfbRSk3cIYdgRVkAdl4HHC22aJDFYucvv65ZerEC51xZlffKscf2DWw7pAMAQ/QMPWR7Tw5pIBCe8C+ioiz3QbTUs2vZ86cPncR+8krM83jt19ahwmncCaGRmXP03D5v3KwdwmupNl4dIOLJp+vQ8XUxhoG2DWBdBna8XYxGhZZTr9FFam5TDT04y/U7xvU59z6UU8A3i9cLbu5kWN1Aj+t+/JNNdBGVCM0Z8QGT0srSmM9KEj4501b4XaW8A4W7Bgp75TubpxZ33Ignx723pqX+ssxY5KxvqtxMYwB7tUW0DSRhTN/bJZFGGsBpajngP10QPqH0rvXrs2lsp0T6oWeN/XUXMml+STdfzCls+jNsgCKP+aUhd95UplmpVNtN0/bsB4YFAFi9bUdTYfPXPAB+z4v9B3hZbuSkqRq2qL2+wZndrr0S0QAAgG6+GXrPN2fXHa3s++PKy+Afi2biZ4dnGemqhlfhT7H5tq795wGA5BwytXQfaXMWEOTZSW5ZEZEOQChZvhhMlx4slqVXn92tlmfEAwBalK5R7zmbcBJGmJOZmemrnRe7lkzvHXsmtMyd5RyvbQQI6SlDZ96V/Rg20jGBS9cKY1K+yDnG30DXoxpVFOr8KQycrR+KZWU/0jDSMYEHGgv76o/TACA7v8zGzHgDAFZNOOXBp+iRpwtcD2JUk3wgth9e1mttBgAPLWtcOeJAIqOBiike13a0s6E/KV1zo+lwowuR+YmlLtcIBKEAHEDERlVTQf8T9wSnWTSA81Q+CWElxx6jOvKFnWjgPUZ2hDE1CzmqZ2MpRGmA2kxmaOrYZWdwLYhbbFcNksMVoenOvNYhJ6L/IJ8AokbpvdYkeUZmKno2Tpb7xKfAIbKKfM2rciw9wokK30DzrXQdTIhSRGNJxxD8uMC3howCLqBMTO0U6UFRJO3Y5ws98hZ8AHhtoyiNsGA1+h0uEUAPauEzpZHuhGaT7yMDIIDNEOqQRjDnFycBO+8tQAmcXPoiAhFTQG4wJNKE5Ud/3cFSPIRQsLNi9AgDPAAhsvQ7uFQRwetW8MQ0aoQCBCFA8fQd3PbwiAEjwfnUqBFiVADVQXjIGP01VBwh4KDB5B41EtOSAfcLCPNuPFrHeBu2ngQvzxlGHQuPKFYvCgCjv1J7OMHUaDCBFrGjdYwjOhA8NwG8BRJWZIEr5q18N26xa7oC1B1XRiTIMCsrt7CcjEXgjGBGaUWWkgU/M9icMnHc6V7XaKyQ0o+myG0WY+sriqTcmCxqFFZ63ZuwuqwXIgpS+GyhuQbf9rILLc2ad6U8tY/3xspmXFO+XiS6giPczYfef+JG4tLYXwAsYbFRkw1/8axoDIp4Fm3/+3RZlfoUAEpJeekx64I0Zi8JhqAHt29d0hl1n8sFAELTpJBctqgr3uYKglDHtxZfFS609Y9JJJUNzW2Y1qwI9IzcOlkkTZ5SZovUjCs1Dpzcluw+Iu+erwl2a10fbWUc7+sHmq2ID4FXXvV00EqmMNOTPn3x0Ni7UmWo2rwwWCUbARzCHpofIEhSg4796Rk2mBURiEjaVg3NaspDh+xvxActGLdqpmLMg/WDMwuVtF4oT2u8bVmKQ9pEkr6aLXe2BN/IclFwmqYMDstCxBYuI0+Fgm/kq6Kd1w+edFFKErIaUPC9b2AExbUhwYj+W2kSH3mbdlHBIPnvh3I6f1udHRwcExRRhIImdBAJ+VKTqdGaEBs8lh47Swb/xeHIBxDQ7dqFMS+Obw7v/3tskSzV6E7VNgbfyN6j0yv7hk76SV2FHTe/vBEcibg3mRr8VuqasHX85Jxn5cERWWMuN4iIabGtB8Z359zVCMEuut0ZPbd024hCn37T9VfTbX4a0Fn9egNadu5M3vAsi76Iw+vfB8m0+IMjSLzffbLbvwOhK2M7Rwgf/V/8yCX5+S9uSdQHjDDeXQAAAABJRU5ErkJggg==";



const FINLAND = {"viewBox":"0 0 220 494","path":"M 157.1 59.0 L 154.4 91.4 L 183.1 122.3 L 165.8 157.2 L 187.6 210.0 L 175.0 249.7 L 191.9 284.2 L 184.2 314.4 L 212.0 346.2 L 204.9 369.8 L 147.3 455.7 L 113.3 459.4 L 80.3 476.4 L 49.7 486.2 L 38.9 460.9 L 20.7 445.7 L 24.9 400.0 L 15.8 358.2 L 24.7 331.2 L 41.7 302.1 L 84.7 251.9 L 97.2 242.2 L 95.2 222.6 L 69.1 200.7 L 62.8 182.6 L 62.3 111.3 L 8.0 57.0 L 19.2 44.8 L 40.1 69.3 L 64.6 67.0 L 84.8 78.2 L 102.7 57.7 L 111.9 23.7 L 141.0 8.0 L 165.1 26.4 L 157.1 59.0 Z","venues":{"2014":{"town":"Kuopio","x":140.0,"y":345.1},"2015":{"town":"Paimio","x":46.3,"y":457.9},"2016":{"town":"Lappeenranta","x":149.5,"y":430.0},"2017":{"town":"Joensuu","x":179.1,"y":358.5},"2018":{"town":"Hollola","x":99.3,"y":430.9},"2019":{"town":"Kangasala","x":72.3,"y":411.2},"2024":{"town":"Lapua","x":52.2,"y":341.4},"2025":{"town":"Mikkeli","x":132.4,"y":400.8},"2026":{"town":"Kotka","x":126.2,"y":457.4}}};

/* ---------- helpers ---------- */
const stripAccents = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normName = (n) => stripAccents(n).toLowerCase().trim();
const shortComp = (c) => (c || "").split(",")[0];
const topPct = (x) => (x == null ? "—" : "top " + Math.round(x * 100) + "%");
const fmtPace = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "—");
const km = (v) => (v == null ? "—" : `${v.toFixed(1)} km`);
const hms = (s) => {
  if (s == null) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
};

/* ---------- live 2026 feed ----------
   Source: Tulospalvelu "online" JSON, CORS-open (access-control-allow-origin: *),
   so the static site fetches it directly — no backend.
   Confirmed endpoints + JSON schema (from the event's JsonFileFormats):
     online_events_dt.json                 -> events list w/ CurrentRace + Online flags
     online_{id}_startlist.json?ClubNameShort=  -> team + per-leg runner names
     online_{id}_resultlist.json?Get=[...] -> OLBigRelayResult rows (live splits)
     online_{id}_statuslist.json?a=ts      -> live change/refresh feed
   Rows we read (OLBigRelayResult): RaceNo, Point, BaseBib, Name, TimeTotalStr,
     RankTotal, DiffTotal, TimeRaceStr, RankRace, DiffRace.
   NOTE: endpoints are empty until the race is live + lineups posted. The two
   spots marked CONFIRM-WHEN-LIVE (class filter + result wrapper) are isolated
   here so finalising them is a one-line change once real data appears. */
const LIVE = {
  base: "https://online.jukola.fi/tulokset/online",
  eventId: "j2026_ju",
  bib: 1107,
  club: "Olvastin Tana",
  legs: 7,
  massStart: "2026-06-13T23:00:00+03:00",
  refreshMs: 75000,
  resultsUrl: "https://online.jukola.fi/tulokset-new/fi/j2026_ju/",
};

async function getJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

async function fetchEvent() {
  const d = await getJSON(`${LIVE.base}/online_events_dt.json`);
  return (d.data || []).find((e) => e.EventID === LIVE.eventId) || null;
}

async function fetchLineup() {
  const d = await getJSON(`${LIVE.base}/online_${LIVE.eventId}_startlist.json?ClubNameShort=${encodeURIComponent(LIVE.club)}`);
  const teams = d.data || [];
  const team = teams.find((t) => String(t.BaseBib ?? t.Bib) === String(LIVE.bib)) || teams[0] || null;
  if (!team) return null;
  // CONFIRM-WHEN-LIVE: per-leg runner shape (expected team.Races[] of OLRelayCompetitorRace)
  const races = (team.Races || [])
    .map((r) => ({ leg: r.RaceNo, name: [r.NameFirst, r.NameLast].filter(Boolean).join(" ").trim(), status: r.Status }))
    .filter((r) => r.leg)
    .sort((a, b) => a.leg - b.leg);
  return { bib: team.BaseBib ?? team.Bib, classId: team.ClassID, classShort: team.ClassNameShort, races };
}

async function fetchTeamStatus(classShort) {
  // CONFIRM-WHEN-LIVE: exact class filter + that rows live under d.data
  let url = `${LIVE.base}/online_${LIVE.eventId}_resultlist.json?a=${Date.now()}&Get=${encodeURIComponent('["OLBigRelayResult"]')}`;
  if (classShort) url += `&ClassNameShort=${encodeURIComponent(classShort)}`;
  const d = await getJSON(url);
  const rows = (d.data || []).filter((r) => String(r.BaseBib) === String(LIVE.bib));
  if (!rows.length) return null;
  rows.sort((a, b) => a.RaceNo - b.RaceNo || a.Point - b.Point);
  const latest = rows[rows.length - 1];
  const byLeg = {};
  rows.forEach((r) => { byLeg[r.RaceNo] = r; });
  return {
    leg: latest.RaceNo, runner: latest.Name, point: latest.Point,
    totalTime: latest.TimeTotalStr, rankTotal: latest.RankTotal, diffTotal: latest.DiffTotal,
    legTime: latest.TimeRaceStr, rankRace: latest.RankRace, diffRace: latest.DiffRace,
    legs: Object.values(byLeg),
  };
}

const isLiveNow = (ev) => !!ev && (ev.Online === true || (typeof ev.CurrentRace === "number" && ev.CurrentRace > 0));

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
        distance_km: l.distance_km,
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
      const placed = entries.filter((e) => e.leg_rank && e.leg_field);
      const avgPct = placed.length ? placed.reduce((s, e) => s + e.leg_rank / e.leg_field, 0) / placed.length : null;
      const bestPct = placed.reduce((m, e) => (!m || e.leg_rank / e.leg_field < m.leg_rank / m.leg_field ? e : m), null);
      const distLegs = entries.filter((e) => e.official && e.leg_time_s && e.distance_km);
      const totalKm = distLegs.reduce((s, e) => s + e.distance_km, 0);
      const avgKm = distLegs.length ? totalKm / distLegs.length : 0;
      const paceS = totalKm ? distLegs.reduce((s, e) => s + e.leg_time_s, 0) / totalKm : 0;
      return { ...p, display, entries, appearances: entries.length, years: new Set(entries.map((e) => e.year)).size, fastest, bestLeg, favLeg, legCount, avgPct, bestPct, totalKm, avgKm, paceS };
    }).sort((a, b) => b.appearances - a.appearances || a.display.localeCompare(b.display));

    const chart = events.map((e) => ({
      year: e.year,
      hours: e.status === "finished" ? +(e.final_time_s / 3600).toFixed(2) : 0,
      winnerHours: +(e.winner_time_s / 3600).toFixed(2),
      winnerTeam: e.winner_team,
      winnerTime: e.winner_time,
      ratio: e.status === "finished" ? e.final_time_s / e.winner_time_s : null,
      dnf: e.status !== "finished",
      label: e.status === "finished" ? e.final_time : "DNF",
    }));

    const bestRatio = finished
      .map((e) => ({ e, ratio: e.final_time_s / e.winner_time_s }))
      .reduce((m, x) => (!m || x.ratio < m.ratio ? x : m), null);

    const fastestByLeg = {};
    let biggestGain = null;
    events.forEach((e) => e.legs.forEach((l) => {
      if (l.official && l.leg_time_s) {
        const cur = fastestByLeg[l.leg];
        if (!cur || l.leg_time_s < cur.leg_time_s) fastestByLeg[l.leg] = { ...l, year: e.year };
      }
      if (l.official && l.place_change != null && l.place_change < 0 && (!biggestGain || l.place_change < biggestGain.place_change))
        biggestGain = { ...l, year: e.year };
    }));
    const mostLegs = participants[0];
    const mostKm = [...participants].sort((a, b) => b.totalKm - a.totalKm)[0];

    let s14Km = 0, s14S = 0, longestLeg = null;
    events.forEach((e) => e.legs.forEach((l) => {
      if (l.distance_km) s14Km += l.distance_km;
      if (l.leg_time_s) s14S += l.leg_time_s;
      if (l.distance_km && (!longestLeg || l.distance_km > longestLeg.distance_km)) longestLeg = { ...l, year: e.year };
    }));
    const since2014 = { totalKm: s14Km, totalS: s14S, jukolas: events.length, runners: participants.length, longestLeg };

    return { events, finished, bestTime, bestPlace, fastestLeg, participants, chart, bestRatio, fastestByLeg, biggestGain, mostLegs, mostKm, since2014 };
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

function CourseLine({ events, onPick, onLive }) {
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
      <button className="control next" title="Follow Kotka-Jukola 2026 live" onClick={onLive}>
        <span className="control-ring pulse" />
        <span className="control-year">2026</span>
        <span className="control-meta">LIVE</span>
      </button>
    </div>
  );
}

/* ---------- views ---------- */
function VenueMap({ events, onPick }) {
  const byYear = {};
  events.forEach((e) => (byYear[e.year] = e));
  const years = Object.keys(FINLAND.venues).map(Number).sort((a, b) => a - b);
  const statusOf = (y) => (y === 2026 ? "next" : byYear[y] && byYear[y].status !== "finished" ? "dnf" : "ok");
  return (
    <div className="venuemap">
      <svg viewBox={FINLAND.viewBox} className="fmap" preserveAspectRatio="xMidYMid meet">
        <path d={FINLAND.path} className="fmap-land" />
        {years.map((y) => {
          const v = FINLAND.venues[y];
          const st = statusOf(y);
          return <circle key={y} cx={v.x} cy={v.y} r={st === "next" ? 5.5 : 4.5} className={`vdot ${st}`} onClick={() => onPick(y)} />;
        })}
      </svg>
      <div className="venuelist">
        {years.map((y) => {
          const v = FINLAND.venues[y];
          const e = byYear[y];
          const st = statusOf(y);
          return (
            <button key={y} className={`vchip ${st}`} onClick={() => onPick(y)}>
              <span className="mono vchip-y">{y}</span>
              <span className="vchip-t">{v.town}</span>
              <span className="mono vchip-r">{y === 2026 ? "LIVE" : e ? (e.status === "finished" ? e.final_time : "DNF") : ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MiniRoute({ points }) {
  if (!points || points.length < 2) return null;
  const kx = Math.cos(points[0].lat * Math.PI / 180);
  const xs = points.map((p) => p.lng * kx), ys = points.map((p) => p.lat);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const W = 120, H = 120, pad = 10;
  const sx = (v) => pad + (v - minx) / ((maxx - minx) || 1) * (W - 2 * pad);
  const sy = (v) => pad + (maxy - v) / ((maxy - miny) || 1) * (H - 2 * pad);
  const d = points.map((p, i) => `${i ? "L" : "M"} ${sx(p.lng * kx).toFixed(1)} ${sy(p.lat).toFixed(1)}`).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} className="miniroute"><path d={d} fill="none" stroke="var(--yellow)" strokeWidth="2" strokeLinejoin="round" /></svg>;
}

function TrackMap({ track }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !track) return;
    const pts = track.points.map((p) => [p.lat, p.lng]);
    const map = L.map(ref.current, { scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(map);
    const line = L.polyline(pts, { color: "#ffe600", weight: 4, opacity: 0.95 }).addTo(map);
    L.circleMarker(pts[0], { radius: 6, color: "#ff7e2e", fillColor: "#ff7e2e", fillOpacity: 1 }).addTo(map);
    L.circleMarker(pts[pts.length - 1], { radius: 6, color: "#46c08a", fillColor: "#46c08a", fillOpacity: 1 }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [22, 22] });
    return () => map.remove();
  }, [track]);
  return <div ref={ref} className="lmap" />;
}

function TrackView({ pkey, year, leg, m, tracks, go }) {
  const p = m.participants.find((x) => x.key === pkey);
  const e = m.events.find((x) => x.year === year);
  const l = e && e.legs.find((x) => x.leg === leg);
  const t = tracks[trackKey(pkey, year, leg)];
  return (
    <div className="stack">
      <button className="back" onClick={() => go({ type: "profile", key: pkey })}>← Back to {p ? p.display : "profile"}</button>
      <section className="hero compact">
        <p className="eyebrow">{shortComp(e?.competition)} · leg {leg}</p>
        <h1 className="title sm">{l ? l.runner : p?.display} · route</h1>
        <div className="stats">
          <Stat k="Leg time" v={l ? l.leg_time : "—"} />
          <Stat k="GPS distance" v={t ? `${t.distanceKm}` : "—"} sub="km on the watch" />
          <Stat k="Straight leg" v={l && l.distance_km ? `${l.distance_km}` : "—"} sub="km official" />
          <Stat k="Points" v={t ? t.points.length : "—"} />
        </div>
      </section>
      <section className="panel">
        {t ? <TrackMap track={t} /> : <p className="muted">No GPS track for this leg yet.</p>}
        <p className="muted small">Recorded route on OpenStreetMap — start in orange, finish in green. The GPS distance runs longer than the official leg because of route choice and satellite wander.</p>
      </section>
    </div>
  );
}

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

      <section className="panel s14">
        <h2 className="h2">Since 2014</h2>
        <div className="s14-grid">
          <div className="s14-c"><div className="s14-v mono">{Math.round(m.since2014.totalKm)}</div><div className="s14-k">km of forest covered</div></div>
          <div className="s14-c"><div className="s14-v mono">{Math.round(m.since2014.totalS / 3600)}</div><div className="s14-k">hours on the course</div></div>
          <div className="s14-c"><div className="s14-v mono">{m.since2014.jukolas}</div><div className="s14-k">nights raced</div></div>
          <div className="s14-c"><div className="s14-v mono">{m.since2014.runners}</div><div className="s14-k">runners in the bib</div></div>
        </div>
        <p className="muted small">That's roughly {(m.since2014.totalS / 86400).toFixed(1)} days of continuous running through Finnish summer nights — the longest single leg anyone's drawn was {m.since2014.longestLeg?.distance_km} km (leg {m.since2014.longestLeg?.leg}, {m.since2014.longestLeg?.year}).</p>
      </section>

      <section className="panel">
        <h2 className="h2">The course so far</h2>
        <p className="muted">Each control is a year. Tap one to open the night.</p>
        <CourseLine events={m.events} onPick={(y) => go({ type: "event", year: y })} onLive={() => go({ type: "live" })} />
      </section>

      <section className="panel">
        <h2 className="h2">Where we've raced</h2>
        <VenueMap events={m.events} onPick={(y) => go(y === 2026 ? { type: "live" } : { type: "event", year: y })} />
      </section>

      <section className="panel">
        <h2 className="h2">Olvastin Tana vs. the winner</h2>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <ComposedChart data={m.chart} margin={{ top: 24, right: 8, left: -8, bottom: 0 }}>
              <XAxis dataKey="year" tick={{ fill: "var(--muted)", fontSize: 12, fontFamily: "var(--mono)" }} axisLine={{ stroke: "var(--hair)" }} tickLine={false} />
              <YAxis tick={{ fill: "var(--muted)", fontSize: 12, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} unit="h" domain={[0, 22]} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{ background: "var(--bg2)", border: "1px solid var(--hair)", borderRadius: 10, fontFamily: "var(--mono)", color: "var(--ink)", fontSize: 12 }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ background: "var(--bg2)", border: "1px solid var(--hair)", borderRadius: 10, padding: "10px 12px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)" }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.year}</div>
                      <div style={{ color: "var(--yellow)" }}>Olvastin Tana: {d.label}</div>
                      <div style={{ color: "var(--orange)" }}>Winner: {d.winnerTime}</div>
                      <div style={{ color: "var(--muted)", fontSize: 11 }}>{d.winnerTeam}</div>
                      {d.ratio && <div style={{ color: "var(--muted)", marginTop: 3 }}>{d.ratio.toFixed(2)}× winning time</div>}
                    </div>
                  );
                }} />
              <Legend wrapperStyle={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }} />
              <Bar dataKey="hours" name="Olvastin Tana" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="label" position="top" style={{ fill: "var(--muted)", fontSize: 10, fontFamily: "var(--mono)" }} />
                {m.chart.map((d, i) => <Cell key={i} fill={d.dnf ? "var(--bg2)" : "var(--yellow)"} stroke={d.dnf ? "var(--red)" : "none"} strokeDasharray={d.dnf ? "3 3" : "0"} />)}
              </Bar>
              <Line type="monotone" dataKey="winnerHours" name="Winner" stroke="var(--orange)" strokeWidth={2} dot={{ r: 3, fill: "var(--orange)" }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="muted small">The winner's time (amber) sets the year's benchmark — it absorbs how long and how rough each course was, so the gap to it compares far better across years than raw time. Olvastin Tana's relatively closest run was {m.bestRatio && shortComp(m.bestRatio.e.competition)} ({m.bestRatio && m.bestRatio.ratio.toFixed(2)}× the winner). 2024 (Lakia) was a leg-2 disqualification, so there's no classified finish that year.</p>
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
          <div className="rec">
            <div className="rec-k">Closest to the winner</div>
            <div className="rec-v mono">{m.bestRatio && m.bestRatio.ratio.toFixed(2)}×</div>
            <div className="rec-sub">{m.bestRatio && shortComp(m.bestRatio.e.competition)} · vs {m.bestRatio && m.bestRatio.e.winner_team}</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="h2">Team records</h2>
        <div className="records" style={{ marginBottom: 14 }}>
          <div className="rec">
            <div className="rec-k">Biggest leg surge</div>
            <div className="rec-v mono">+{m.biggestGain ? Math.abs(m.biggestGain.place_change) : "—"}</div>
            <div className="rec-sub">{m.biggestGain ? `${m.biggestGain.runner} · leg ${m.biggestGain.leg} · ${m.biggestGain.year}` : "—"}</div>
          </div>
          <div className="rec">
            <div className="rec-k">Most legs run</div>
            <div className="rec-v mono">{m.mostLegs?.appearances}</div>
            <div className="rec-sub">{m.mostLegs?.display}</div>
          </div>
          <div className="rec">
            <div className="rec-k">Most kilometres</div>
            <div className="rec-v mono">{m.mostKm ? Math.round(m.mostKm.totalKm) : "—"}<span className="rec-unit"> km</span></div>
            <div className="rec-sub">{m.mostKm?.display}</div>
          </div>
        </div>
        <div className="table">
          <div className="tr th lr"><span>Leg</span><span className="num">Length</span><span className="num">Fastest</span><span>Runner</span><span className="num">Year</span></div>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => {
            const r = m.fastestByLeg[n];
            return (
              <button className="tr lr" key={n} onClick={() => r && go({ type: "profile", key: normName(r.runner) })}>
                <span className="mono">{n}</span>
                <span className="num mono muted">{r ? `${r.distance_km} km` : "—"}</span>
                <span className="num mono">{r ? r.leg_time : "—"}</span>
                <span>{r ? r.runner : "—"}</span>
                <span className="num mono muted">{r ? r.year : "—"}</span>
              </button>
            );
          })}
        </div>
        <p className="muted small">Fastest team split ever recorded on each leg number, across all years. A "surge" is the most overall places gained on a single leg.</p>
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
                <div className="card-meta mono">{p.appearances} {p.appearances === 1 ? "leg" : "legs"} · leg {p.favLeg}</div>
              </div>
              <div className="card-pr mono">{p.fastest ? p.fastest.leg_time : "—"}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function EventView({ year, m, go, tracks }) {
  const e = m.events.find((x) => x.year === year);
  const [open, setOpen] = useState(null);
  const series = useMemo(() => {
    if (!e) return [];
    let cum = 0;
    const pts = [];
    e.legs.forEach((l) => {
      (l.splits || []).forEach((s) => { if (s.place != null) pts.push({ dist: +(cum + s.km).toFixed(1), place: s.place, leg: l.leg, t: s.total_time_s }); });
      if (l.cumulative_place) pts.push({ dist: +(cum + (l.distance_km || 0)).toFixed(1), place: l.cumulative_place, leg: l.leg, change: true, t: l.cumulative_time_s });
      cum += l.distance_km || 0;
    });
    return pts;
  }, [e]);
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
          <Stat k="Course" v={e.course_km ? `${e.course_km}` : "—"} sub={e.course_km ? "km · 7 legs" : ""} />
        </div>
      </section>
      <div className="benchmark">
        <span className="bm-flag" aria-hidden />
        <div className="bm-main">
          <span className="bm-k">Winner</span>
          <span className="bm-team">{e.winner_team} <span className="muted">· {e.winner_country}</span></span>
        </div>
        <span className="bm-time mono">{e.winner_time}</span>
        {e.status === "finished" && (
          <span className="bm-ratio mono">Olvastin Tana · {(e.final_time_s / e.winner_time_s).toFixed(2)}× winner</span>
        )}
      </div>

      {series.length > 1 && (
        <section className="panel">
          <h2 className="h2">Position through the race</h2>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ top: 18, right: 10, left: -8, bottom: 4 }}>
                <XAxis dataKey="dist" type="number" domain={[0, "dataMax"]} unit="km" tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }} axisLine={{ stroke: "var(--hair)" }} tickLine={false} />
                <YAxis reversed allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11, fontFamily: "var(--mono)" }} axisLine={false} tickLine={false} width={44} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div style={{ background: "var(--bg2)", border: "1px solid var(--hair)", borderRadius: 10, padding: "8px 11px", fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)" }}>
                      <div>leg {d.leg} · {d.dist} km{d.change ? " · change-over" : ""}</div>
                      <div style={{ color: "var(--yellow)" }}>position {d.place}</div>
                    </div>
                  );
                }} />
                <Line type="monotone" dataKey="place" stroke="var(--yellow)" strokeWidth={2} dot={{ r: 2, fill: "var(--yellow)" }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="muted small">Overall team position across the whole relay (higher on the chart = better placed). Each point is a timing control; the climbs and dips show where legs were won and lost.</p>
        </section>
      )}

      <section className="panel">
        <h2 className="h2">Legs <span className="muted small" style={{ fontWeight: 400 }}>· tap a number for splits</span></h2>
        <div className="legs">
          {e.legs.map((l) => {
            const up = l.place_change != null && l.place_change < 0;
            const down = l.place_change != null && l.place_change > 0;
            const hasSplits = (l.splits || []).length > 0;
            const isOpen = open === l.leg;
            return (
              <div key={l.leg}>
                <div className="leg">
                  <button className={`leg-no mono tog ${isOpen ? "open" : ""}`} onClick={() => hasSplits && setOpen(isOpen ? null : l.leg)} title={hasSplits ? "Show splits" : ""}>{l.leg}</button>
                  <div className="leg-mid">
                    <button className="leg-runner" onClick={() => go({ type: "profile", key: normName(l.runner) })}>{l.runner}</button>
                    <span className="leg-dist mono">
                      {l.distance_km ? `${l.distance_km.toFixed(1)} km` : ""}
                      {tracks[trackKey(normName(l.runner), e.year, l.leg)] && (
                        <button className="ran-link" onClick={() => go({ type: "track", key: normName(l.runner), year: e.year, leg: l.leg })}>
                          · ran {tracks[trackKey(normName(l.runner), e.year, l.leg)].distanceKm} km ↳
                        </button>
                      )}
                    </span>
                  </div>
                  <div className="leg-time mono">{l.official ? l.leg_time : `(${l.leg_time})`}</div>
                  <div className="leg-rank mono muted">{l.leg_rank ? `${l.leg_rank}/${l.leg_field}` : "—"}</div>
                  <div className="leg-cum mono">
                    {l.cumulative_place ? l.cumulative_place : "—"}
                    {(up || down) && <span className={up ? "up" : "down"}>{up ? "▲" : "▼"}{Math.abs(l.place_change)}</span>}
                  </div>
                </div>
                {isOpen && hasSplits && (
                  <div className="splits">
                    {l.splits.map((s, i) => (
                      <div className="sp" key={i}>
                        <span className="sp-km mono">{s.km} km</span>
                        <span className="mono">{hms(s.leg_time_s)}</span>
                        <span className="sp-bar"><span className="sp-fill" style={{ width: `${l.leg_field ? Math.max((1 - s.place / l.leg_field) * 100, 2) : 50}%` }} /></span>
                        <span className="mono muted">#{s.place}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {e.status !== "finished" && <p className="muted small">Times in parentheses were recorded but not classified — the team was disqualified earlier in the relay.</p>}
      </section>
    </div>
  );
}

function Profile({ pkey, m, go, tracks, onSaveTrack }) {
  const p = m.participants.find((x) => x.key === pkey);
  const fileRef = useRef(null);
  const [up, setUp] = useState(null);      // {year, leg}
  const [cand, setCand] = useState(null);  // parsed candidate or {error}
  const [busy, setBusy] = useState(false);
  const openUploader = (e) => { setCand(null); setUp({ year: e.year, leg: e.leg }); setTimeout(() => fileRef.current && fileRef.current.click(), 0); };
  const onFile = async (ev) => {
    const f = ev.target.files[0]; ev.target.value = "";
    if (!f) return;
    try { setCand(buildTrack(await f.text())); }
    catch (err) { setCand({ error: String(err.message || err) }); }
  };
  const save = async () => {
    setBusy(true);
    try {
      await onSaveTrack({ runnerKey: p.key, year: up.year, leg: up.leg, points: cand.points, distanceKm: cand.distanceKm, durationS: cand.durationS });
      setUp(null); setCand(null);
    } catch (e) { setCand({ ...cand, error: String(e.message || e) }); }
    finally { setBusy(false); }
  };
  if (!p) return null;
  return (
    <div className="stack">
      <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml" onChange={onFile} style={{ display: "none" }} />
      <button className="back" onClick={() => go({ type: "home" })}>← Roster</button>
      <section className="hero compact">
        <div className="avatar big">{stripAccents(p.display).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</div>
        <h1 className="title sm">{p.display}</h1>
        <div className="stats">
          <Stat k="Legs run" v={p.appearances} sub={p.years && p.years < p.appearances ? `${p.years} Jukolas` : ""} />
          <Stat k="Usual leg" v={p.favLeg} />
          <Stat k="Fastest leg" v={p.fastest ? p.fastest.leg_time : "—"} sub={p.fastest ? `leg ${p.fastest.leg} · ${p.fastest.year}` : ""} />
          <Stat k="Avg placing" v={topPct(p.avgPct)} sub="field-relative" />
        </div>
      </section>
      <section className="panel">
        <h2 className="h2">Performance</h2>
        <div className="records">
          <div className="rec"><div className="rec-k">Best leg placing</div><div className="rec-v mono">{topPct(p.bestPct ? p.bestPct.leg_rank / p.bestPct.leg_field : null)}</div><div className="rec-sub">{p.bestPct ? `${p.bestPct.leg_rank}/${p.bestPct.leg_field} · leg ${p.bestPct.leg} · ${p.bestPct.year}` : "—"}</div></div>
          <div className="rec"><div className="rec-k">Avg pace</div><div className="rec-v mono">{fmtPace(p.paceS)}<span className="rec-unit"> /km</span></div><div className="rec-sub">orienteering pace</div></div>
          <div className="rec"><div className="rec-k">Avg leg length</div><div className="rec-v mono">{p.avgKm ? p.avgKm.toFixed(1) : "—"}<span className="rec-unit"> km</span></div><div className="rec-sub">per leg run</div></div>
          <div className="rec"><div className="rec-k">Total distance</div><div className="rec-v mono">{p.totalKm ? Math.round(p.totalKm) : "—"}<span className="rec-unit"> km</span></div><div className="rec-sub">{p.appearances} legs of forest</div></div>
        </div>
        <div className="legdist">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <div className={`ld ${p.legCount[n] ? "has" : ""}`} key={n}>
              <div className="ld-bar" style={{ height: `${(p.legCount[n] || 0) * 18 + 4}px` }} />
              <div className="ld-n mono">{n}</div>
              {p.legCount[n] > 0 && <div className="ld-c mono">{p.legCount[n]}×</div>}
            </div>
          ))}
        </div>
        <p className="muted small">Placing is field-relative — the top % of teams on that leg, which compares fairly across years since the field size changes. Pace counts navigation time, so it's slow by road-running standards.</p>
      </section>
      <section className="panel">
        <h2 className="h2">Every start</h2>
        <div className="ptable">
          {[...p.entries].sort((a, b) => b.year - a.year || a.leg - b.leg).map((e) => {
            const pct = e.leg_rank && e.leg_field ? 1 - e.leg_rank / e.leg_field : 0;
            const tk = tracks[trackKey(p.key, e.year, e.leg)];
            return (
              <div className="prow" key={`${e.year}-${e.leg}`}>
                <button className="prow-main" onClick={() => go({ type: "event", year: e.year })}>
                  <span className="mono pyear">{e.year}</span>
                  <span className="pcomp">{shortComp(e.competition)}</span>
                  <span className="mono pleg">L{e.leg} · {e.distance_km ? e.distance_km.toFixed(1) : "—"}km</span>
                  <span className={`mono ptime ${!e.official ? "dnf-txt" : ""}`}>{e.official ? e.leg_time : `(${e.leg_time})`}</span>
                  <span className="pbar"><span className="pbar-fill" style={{ width: `${Math.max(pct * 100, 2)}%` }} /></span>
                  <span className="mono prank muted">{e.leg_rank ? `${e.leg_rank}/${e.leg_field}` : "—"}</span>
                </button>
                {tk
                  ? <button className="gpsbtn has" title="View GPS route" onClick={() => go({ type: "track", key: p.key, year: e.year, leg: e.leg })}>↳ map</button>
                  : <button className="gpsbtn" title="Add a GPS track" onClick={() => openUploader(e)}>+ GPS</button>}
              </div>
            );
          })}
        </div>
        <p className="muted small">Bar length = field-relative leg placing (longer is better). Tap "+ GPS" on a run to add your recorded route (export GPX from Garmin Connect); "↳ map" opens it.</p>
      </section>

      {up && (
        <div className="uploader" onClick={(ev) => { if (ev.target === ev.currentTarget && !busy) { setUp(null); setCand(null); } }}>
          <div className="up-card">
            <div className="up-head">Add GPS · leg {up.leg} · {up.year}</div>
            {!cand && <p className="muted small">Choose a .gpx file…</p>}
            {cand && cand.error && <p className="dnf-txt small">{cand.error}<br />Pick another file or cancel.</p>}
            {cand && !cand.error && (
              <div className="up-prev">
                <MiniRoute points={cand.points} />
                <div className="up-stats mono">
                  <div>{cand.distanceKm} km</div>
                  <div>{cand.durationS ? hms(cand.durationS) : "—"}</div>
                  <div className="muted">{cand.points.length} pts</div>
                </div>
              </div>
            )}
            <div className="up-actions">
              <button className="up-btn ghost" onClick={() => { if (!busy) { setUp(null); setCand(null); } }}>Cancel</button>
              {cand && cand.error && <button className="up-btn" onClick={() => fileRef.current && fileRef.current.click()}>Choose file</button>}
              {cand && !cand.error && <button className="up-btn save" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save route"}</button>}
            </div>
          </div>
        </div>
      )}
      <section className="panel">
        <h2 className="h2">Other runners</h2>
        <div className="roster">
          {m.participants.filter((o) => o.key !== p.key).map((o) => (
            <button className="card" key={o.key} onClick={() => go({ type: "profile", key: o.key })}>
              <div className="avatar">{stripAccents(o.display).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</div>
              <div className="card-body">
                <div className="card-name">{o.display}</div>
                <div className="card-meta mono">{o.appearances} {o.appearances === 1 ? "leg" : "legs"} · {o.avgPct != null ? `top ${Math.round(o.avgPct * 100)}%` : `leg ${o.favLeg}`}</div>
              </div>
              <div className="card-pr mono">{o.fastest ? o.fastest.leg_time : "—"}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function useCountdown(targetIso) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(targetIso).getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const mn = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { d, h, mn, s, done: diff === 0 };
}

function LiveView() {
  const [phase, setPhase] = useState("loading"); // loading | pre | live | error
  const [lineup, setLineup] = useState(null);
  const [status, setStatus] = useState(null);
  const [updated, setUpdated] = useState(null);
  const [err, setErr] = useState(null);
  const busy = useRef(false);
  const cd = useCountdown(LIVE.massStart);

  async function load() {
    if (busy.current) return;
    busy.current = true;
    try {
      const ev = await fetchEvent();
      let lu = null;
      try { lu = await fetchLineup(); } catch { /* lineup optional */ }
      setLineup(lu);
      if (isLiveNow(ev)) {
        let st = null;
        try { st = await fetchTeamStatus(lu?.classShort); } catch { /* may not be ready */ }
        setStatus(st);
        setPhase("live");
      } else {
        setPhase("pre");
      }
      setUpdated(new Date());
      setErr(null);
    } catch (e) {
      setErr(String(e.message || e));
      setPhase((p) => (p === "loading" ? "error" : p));
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, LIVE.refreshMs);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="stack">
      <section className="hero compact live-hero">
        <div className="contour" aria-hidden>
          <svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice">
            {[...Array(7)].map((_, i) => <ellipse key={i} cx="430" cy="120" rx={60 + i * 38} ry={40 + i * 26} />)}
          </svg>
        </div>
        <p className="eyebrow">
          <span className={`live-dot ${phase === "live" ? "on" : ""}`} /> Kotka-Jukola 2026 · team {LIVE.bib}
        </p>
        <h1 className="title sm">{phase === "live" ? "LIVE NOW" : "Starting line"}</h1>
        {phase !== "live" && (
          <div className="countdown">
            {[["days", cd.d], ["hrs", cd.h], ["min", cd.mn], ["sec", cd.s]].map(([k, v]) => (
              <div className="cd" key={k}><div className="cd-v mono">{String(v).padStart(2, "0")}</div><div className="cd-k">{k}</div></div>
            ))}
          </div>
        )}
        <p className="lede" style={{ marginTop: 16 }}>
          {phase === "live"
            ? "Following Olvastin Tana through the night — splits update as each runner passes a timing point."
            : "Jukola mass start: Saturday 13 June, 23:00. This page will switch to live tracking automatically when the gun goes."}
        </p>
      </section>

      {phase === "live" && status && (
        <section className="panel">
          <h2 className="h2">On the course</h2>
          <div className="live-now">
            <div className="ln-leg mono">LEG {status.leg}/{LIVE.legs}</div>
            <div className="ln-runner">{status.runner || "—"}</div>
            <div className="ln-grid">
              <div><span className="ln-k">Total time</span><span className="ln-v mono">{status.totalTime || "—"}</span></div>
              <div><span className="ln-k">Position</span><span className="ln-v mono">{status.rankTotal ?? "—"}</span></div>
              <div><span className="ln-k">Gap to leader</span><span className="ln-v mono">{status.diffTotal || "—"}</span></div>
              <div><span className="ln-k">Last point</span><span className="ln-v mono">{status.point ?? "—"}</span></div>
            </div>
          </div>
          {status.legs && status.legs.length > 0 && (
            <div className="legs" style={{ marginTop: 14 }}>
              {status.legs.map((l) => (
                <div className="leg" key={l.RaceNo}>
                  <div className="leg-no mono">{l.RaceNo}</div>
                  <div className="leg-runner" style={{ cursor: "default" }}>{l.Name || "—"}</div>
                  <div className="leg-time mono">{l.TimeRaceStr || "—"}</div>
                  <div className="leg-rank mono muted">{l.RankRace ? `#${l.RankRace}` : "—"}</div>
                  <div className="leg-cum mono">{l.TimeTotalStr || "—"}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {phase === "live" && !status && (
        <section className="panel"><p className="muted">Race is live — waiting for Olvastin Tana's first timing point to come through.</p></section>
      )}

      <section className="panel">
        <div className="row-between">
          <h2 className="h2">{phase === "live" ? "Lineup" : "Registered lineup"}</h2>
          {updated && <span className="muted small mono">updated {updated.toLocaleTimeString()}</span>}
        </div>
        {lineup && lineup.races.length > 0 ? (
          <div className="legs">
            {lineup.races.map((r) => (
              <div className="leg" key={r.leg}>
                <div className="leg-no mono">{r.leg}</div>
                <div className="leg-runner" style={{ cursor: "default" }}>{r.name || "—"}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Lineup isn't published in the results system yet — it usually appears a few days before the race. This panel will fill in automatically once it's up.</p>
        )}
      </section>

      {err && <section className="panel"><p className="muted small">Couldn't reach the live service just now ({err}). Retrying automatically every {Math.round(LIVE.refreshMs / 1000)}s.</p></section>}

      <p className="muted small" style={{ textAlign: "center" }}>
        Live data = split times at timing points and changeovers (not GPS), straight from{" "}
        <a href={LIVE.resultsUrl} target="_blank" rel="noreferrer" style={{ color: "var(--yellow)" }}>online.jukola.fi</a>. Auto-refreshes every {Math.round(LIVE.refreshMs / 1000)}s.
      </p>
    </div>
  );
}

function CompareView({ m }) {
  const ps = m.participants;
  const [a, setA] = useState(ps[0]?.key);
  const [b, setB] = useState(ps[1]?.key);
  const A = ps.find((x) => x.key === a) || ps[0];
  const B = ps.find((x) => x.key === b) || ps[1];
  const init = (p) => stripAccents(p.display).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const better = (av, bv, dir) => {
    if (av == null || bv == null || av === bv) return null;
    if (dir === "high") return av > bv ? "a" : "b";
    if (dir === "low") return av < bv ? "a" : "b";
    return null;
  };
  const rows = [
    { label: "Legs run", da: A.appearances, db: B.appearances, w: better(A.appearances, B.appearances, "high") },
    { label: "Jukolas", da: A.years, db: B.years, w: better(A.years, B.years, "high") },
    { label: "Usual leg", da: A.favLeg, db: B.favLeg },
    { label: "Fastest leg", da: A.fastest ? A.fastest.leg_time : "—", db: B.fastest ? B.fastest.leg_time : "—", w: better(A.fastest?.leg_time_s, B.fastest?.leg_time_s, "low") },
    { label: "Avg placing", da: topPct(A.avgPct), db: topPct(B.avgPct), w: better(A.avgPct, B.avgPct, "low") },
    { label: "Best leg", da: topPct(A.bestPct ? A.bestPct.leg_rank / A.bestPct.leg_field : null), db: topPct(B.bestPct ? B.bestPct.leg_rank / B.bestPct.leg_field : null), w: better(A.bestPct ? A.bestPct.leg_rank / A.bestPct.leg_field : null, B.bestPct ? B.bestPct.leg_rank / B.bestPct.leg_field : null, "low") },
    { label: "Avg pace /km", da: fmtPace(A.paceS), db: fmtPace(B.paceS), w: better(A.paceS, B.paceS, "low") },
    { label: "Avg leg length", da: km(A.avgKm), db: km(B.avgKm) },
    { label: "Total distance", da: km(A.totalKm), db: km(B.totalKm), w: better(A.totalKm, B.totalKm, "high") },
  ];
  return (
    <div className="stack">
      <section className="hero compact">
        <p className="eyebrow">Head to head</p>
        <h1 className="title sm">Compare runners</h1>
      </section>
      <section className="panel">
        <div className="cmp-head">
          <div className="cmp-pick">
            <div className="avatar">{init(A)}</div>
            <select className="cmp-sel" value={a} onChange={(ev) => setA(ev.target.value)}>
              {ps.map((p) => <option key={p.key} value={p.key}>{p.display}</option>)}
            </select>
          </div>
          <span className="cmp-vs mono">vs</span>
          <div className="cmp-pick">
            <div className="avatar">{init(B)}</div>
            <select className="cmp-sel" value={b} onChange={(ev) => setB(ev.target.value)}>
              {ps.map((p) => <option key={p.key} value={p.key}>{p.display}</option>)}
            </select>
          </div>
        </div>
        <div className="cmp-rows">
          {rows.map((r) => (
            <div className="cmp-row" key={r.label}>
              <span className={`cmp-v mono ${r.w === "a" ? "win" : ""}`}>{r.da}</span>
              <span className="cmp-k">{r.label}</span>
              <span className={`cmp-v mono ${r.w === "b" ? "win" : ""}`}>{r.db}</span>
            </div>
          ))}
        </div>
        <p className="muted small">Highlighted side is the stronger of the two on that metric. Placing and pace are field-relative / distance-normalised, so they compare fairly across different years and legs.</p>
      </section>
    </div>
  );
}

/* ---------- shell ---------- */
export default function App() {
  const m = useModel();
  const [view, setView] = useState({ type: "home" });
  const [tracks, setTracks] = useState({});
  const go = (v) => { window.history.pushState(v, ""); setView(v); window.scrollTo({ top: 0, behavior: "smooth" }); };
  useEffect(() => { loadTracks().then(setTracks).catch((e) => console.warn("Track load failed:", e)); }, []);
  useEffect(() => {
    window.history.replaceState({ type: "home" }, "");
    const onPop = (e) => { setView(e.state || { type: "home" }); window.scrollTo({ top: 0 }); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const onSaveTrack = async (t) => {
    await saveTrack(t);
    setTracks((prev) => ({ ...prev, [trackKey(t.runnerKey, t.year, t.leg)]: { ...t, createdAt: Date.now() } }));
  };

  return (
    <div className="app">
      <Style />
      <header className="topbar">
        <button className="brand" onClick={() => go({ type: "home" })}>
          <img className="brand-logo" src={LOGO} alt="Olvastin Tana" />
          <span className="brand-txt">OLVASTIN&nbsp;TANA</span>
        </button>
        <nav className="nav">
          <button className={`nav-btn ${view.type === "home" ? "act" : ""}`} onClick={() => go({ type: "home" })}>History</button>
          <button className={`nav-btn ${view.type === "compare" ? "act" : ""}`} onClick={() => go({ type: "compare" })}>Compare</button>
          <button className={`nav-btn live ${view.type === "live" ? "act" : ""}`} onClick={() => go({ type: "live" })}>● Live 2026</button>
        </nav>
      </header>
      <main className="wrap">
        {view.type === "home" && <Home m={m} go={go} />}
        {view.type === "event" && <EventView year={view.year} m={m} go={go} tracks={tracks} />}
        {view.type === "profile" && <Profile pkey={view.key} m={m} go={go} tracks={tracks} onSaveTrack={onSaveTrack} />}
        {view.type === "track" && <TrackView pkey={view.key} year={view.year} leg={view.leg} m={m} tracks={tracks} go={go} />}
        {view.type === "compare" && <CompareView m={m} />}
        {view.type === "live" && <LiveView />}
      </main>
      <footer className="foot mono">
        Data: results.jukola.com · Live: online.jukola.fi · Kotka-Jukola, 13 June 2026, team 1107
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
  --ink:#e9f1ea; --muted:#7f9888; --yellow:#ffe600; --yellow-d:#b89500;
  --orange:#ff7e2e; --green:#46c08a; --red:#ff5a5a;
  --disp:'Bricolage Grotesque',sans-serif; --body:'Hanken Grotesk',sans-serif; --mono:'Spline Sans Mono',monospace;
}
*{box-sizing:border-box}
.app{min-height:100%;background:
  radial-gradient(1200px 600px at 80% -10%, rgba(255,230,0,.10), transparent 60%),
  radial-gradient(900px 500px at -10% 110%, rgba(70,192,138,.08), transparent 55%),
  var(--bg);
  color:var(--ink);font-family:var(--body);line-height:1.5;}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.muted{color:var(--muted)} .small{font-size:12.5px}
.num{text-align:right}
.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;
  padding:14px 20px;background:rgba(10,18,13,.72);backdrop-filter:blur(10px);border-bottom:1px solid var(--hair)}
.brand{display:flex;align-items:center;gap:10px;background:none;border:0;cursor:pointer;color:var(--ink)}
.brand-logo{width:40px;height:40px;border-radius:10px;object-fit:cover;border:1.5px solid var(--yellow);box-shadow:0 0 16px rgba(255,230,0,.30);background:#ffff05}
.brand-txt{font-family:var(--disp);font-weight:800;letter-spacing:.06em;font-size:15px}
.brand-sub{font-size:11px;color:var(--muted);letter-spacing:.12em}
.nav{display:flex;gap:6px;align-items:center}
.nav-btn{background:none;border:1px solid transparent;border-radius:999px;color:var(--muted);font-family:var(--mono);font-size:12px;padding:6px 12px;cursor:pointer}
.nav-btn:hover{color:var(--ink)}
.nav-btn.act{color:var(--ink);border-color:var(--hair);background:rgba(255,255,255,.04)}
.nav-btn.live{color:var(--orange)}
.nav-btn.live.act{border-color:rgba(255,126,46,.4);background:rgba(255,126,46,.08)}
.live-hero{border-color:rgba(255,126,46,.25)}
.live-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--muted);margin-right:6px;vertical-align:middle}
.live-dot.on{background:var(--yellow);box-shadow:0 0 0 0 rgba(255,230,0,.6);animation:pulse 1.6s infinite}
.countdown{display:flex;gap:10px;margin-top:22px;position:relative}
.cd{background:rgba(0,0,0,.22);border:1px solid var(--hair);border-radius:12px;padding:12px 16px;min-width:64px;text-align:center}
.cd-v{font-family:var(--disp);font-weight:800;font-size:30px;line-height:1;color:var(--orange)}
.cd-k{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin-top:6px}
.live-now{background:rgba(255,230,0,.06);border:1px solid rgba(255,230,0,.25);border-radius:14px;padding:18px}
.ln-leg{font-size:12px;color:var(--yellow);letter-spacing:.1em}
.ln-runner{font-family:var(--disp);font-weight:800;font-size:26px;margin:4px 0 14px}
.ln-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.ln-grid>div{display:flex;flex-direction:column;gap:3px}
.ln-k{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.ln-v{font-size:18px}
@media(max-width:560px){.ln-grid{grid-template-columns:repeat(2,1fr)}.countdown{gap:7px}.cd{min-width:0;flex:1;padding:10px 6px}}
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
.eyebrow{font-family:var(--mono);text-transform:uppercase;letter-spacing:.22em;font-size:11px;color:var(--yellow);margin:0 0 12px}
.title{font-family:var(--disp);font-weight:800;font-size:clamp(40px,9vw,76px);line-height:.92;margin:0;letter-spacing:-.01em}
.title span{color:var(--yellow);text-shadow:0 0 30px rgba(255,230,0,.35)}
.title.sm{font-size:clamp(28px,6vw,44px)}
.lede{max-width:46ch;color:var(--muted);margin:16px 0 0;font-size:15px}
.kite{position:absolute;top:26px;right:26px;width:34px;height:34px;transform:rotate(0);filter:drop-shadow(0 4px 10px rgba(0,0,0,.4))}
.kite span{position:absolute;width:0;height:0;border:17px solid transparent}
.kite span:first-child{border-top-color:#fff;border-left-color:#fff;top:0;left:0}
.kite span:last-child{border-bottom-color:var(--orange);border-right-color:var(--orange);top:0;left:0}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:26px;position:relative}
.stat{background:rgba(0,0,0,.18);border:1px solid var(--hair);border-radius:12px;padding:12px 13px}
.stat-v{font-family:var(--disp);font-weight:800;font-size:23px;line-height:1}
.stat-k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-top:7px}
.stat-sub{font-family:var(--mono);font-size:10.5px;color:var(--yellow);margin-top:3px}

/* course */
.course{position:relative;display:flex;gap:6px;justify-content:space-between;padding:14px 6px 4px;flex-wrap:wrap}
.course-route{position:absolute;left:0;right:0;top:30px;height:60px;width:100%;z-index:0}
.route-path{fill:none;stroke:var(--yellow);stroke-width:2;stroke-dasharray:2 7;stroke-linecap:round;opacity:.55}
.control{position:relative;z-index:1;background:none;border:0;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 2px;flex:1;min-width:64px;
  opacity:0;transform:translateY(8px);animation:rise .5s ease forwards}
.control-ring{width:26px;height:26px;border-radius:50%;border:3px solid var(--yellow);background:var(--bg);transition:.18s}
.control.ok .control-ring{box-shadow:0 0 0 4px rgba(255,230,0,.12)}
.control.dnf .control-ring{border-color:var(--red);border-style:dashed}
.control.next .control-ring{border-color:var(--orange)}
.control:hover .control-ring{transform:scale(1.18);box-shadow:0 0 18px rgba(255,230,0,.6)}
.control-year{font-family:var(--mono);font-size:12px;font-weight:600}
.control-meta{font-family:var(--mono);font-size:10px;color:var(--muted)}
.control.dnf .control-meta{color:var(--red)}
.control.next .control-meta{color:var(--orange)}
.pulse{animation:pulse 1.8s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,126,46,.5)}50%{box-shadow:0 0 0 7px rgba(255,126,46,0)}}
@keyframes rise{to{opacity:1;transform:translateY(0)}}

/* table */
.table{display:flex;flex-direction:column;border:1px solid var(--hair);border-radius:12px;overflow:hidden}
.tr{display:grid;grid-template-columns:54px 1fr 96px 64px 64px;gap:10px;align-items:center;
  padding:12px 14px;background:none;border:0;border-top:1px solid var(--hair);text-align:left;color:var(--ink);cursor:pointer;font-size:14px;width:100%}
.tr:first-child{border-top:0}
.tr.th{background:rgba(0,0,0,.18);color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;cursor:default}
.tr.lr{grid-template-columns:40px 74px 86px 1fr 52px}
.leg-no.tog{cursor:pointer;transition:.15s}
.leg-no.tog:hover{background:rgba(255,230,0,.12)}
.leg-no.open{background:var(--yellow);color:#111}
.splits{margin:2px 0 8px 40px;border-left:2px solid var(--hair);padding-left:12px;display:flex;flex-direction:column;gap:5px}
.sp{display:grid;grid-template-columns:58px 64px 1fr 46px;gap:10px;align-items:center;font-size:12.5px}
.sp-km{color:var(--muted)}
.sp-bar{height:6px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden}
.sp-fill{display:block;height:100%;background:var(--yellow)}
@media(max-width:560px){.tr.lr{grid-template-columns:30px 60px 72px 1fr 0}.tr.lr span:last-child{display:none}}
.tr:not(.th):hover{background:rgba(255,230,0,.06)}
.dnf-txt{color:var(--red)}

/* records */
.records{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.rec{border:1px solid var(--hair);border-radius:14px;padding:16px;background:rgba(0,0,0,.16)}
.rec-k{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)}
.rec-v{font-size:30px;font-weight:600;margin:8px 0 4px;color:var(--orange)}
.rec-sub{font-size:12px;color:var(--muted)}
.rec-unit{font-size:14px;color:var(--muted);font-weight:400}
.legdist{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin:16px 2px 6px;height:78px}
.ld{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;height:100%}
.ld-bar{width:100%;max-width:34px;border-radius:5px 5px 0 0;background:rgba(255,255,255,.06)}
.ld.has .ld-bar{background:linear-gradient(180deg,var(--yellow),var(--yellow-d))}
.ld-n{font-size:11px;color:var(--muted)}
.ld-c{font-size:10px;color:var(--yellow)}

/* roster */
.roster{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.card{display:flex;align-items:center;gap:12px;background:rgba(0,0,0,.16);border:1px solid var(--hair);border-radius:14px;padding:12px 14px;cursor:pointer;text-align:left;color:var(--ink);transition:.15s}
.card:hover{border-color:var(--yellow);transform:translateY(-2px)}
.avatar{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-family:var(--disp);font-weight:800;font-size:14px;
  background:radial-gradient(circle at 30% 25%, rgba(255,230,0,.35), rgba(255,230,0,.08));border:1px solid var(--yellow);color:var(--ink);flex:none}
.avatar.big{width:64px;height:64px;font-size:22px;margin-bottom:14px}
.card-body{flex:1;min-width:0}
.card-name{font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-meta{font-size:11.5px;color:var(--muted)}
.card-pr{font-size:13px;color:var(--orange)}

/* legs */
.legs{display:flex;flex-direction:column;gap:8px}
.leg{display:grid;grid-template-columns:34px 1fr 92px 78px 92px;gap:10px;align-items:center;
  background:rgba(0,0,0,.16);border:1px solid var(--hair);border-radius:11px;padding:11px 13px}
.leg-no{width:28px;height:28px;border-radius:50%;border:2px solid var(--yellow);display:grid;place-items:center;font-size:13px;font-weight:600}
.leg-mid{display:flex;flex-direction:column;gap:1px;min-width:0}
.leg-dist{font-size:11px;color:var(--muted)}
.ran-link{background:none;border:0;color:var(--yellow);cursor:pointer;font-family:var(--mono);font-size:11px;padding:0;margin-left:5px}
.ran-link:hover{text-decoration:underline}
.leg-runner{background:none;border:0;color:var(--ink);text-align:left;cursor:pointer;font-size:14.5px;font-weight:500;padding:0}
.leg-runner:hover{color:var(--yellow)}
.leg-time{text-align:right;font-size:14px} .leg-rank{text-align:right;font-size:12px}
.leg-cum{text-align:right;font-size:13px;display:flex;gap:6px;justify-content:flex-end;align-items:baseline}
.up{color:var(--green);font-size:11px} .down{color:var(--red);font-size:11px}

/* profile table */
.ptable{display:flex;flex-direction:column;gap:7px}
.prow{display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.16);border:1px solid var(--hair);border-radius:11px;padding:6px 8px 6px 13px}
.prow:hover{border-color:var(--yellow)}
.prow-main{flex:1;min-width:0;display:grid;grid-template-columns:48px minmax(0,1fr) 56px 88px 90px 70px;gap:10px;align-items:center;background:none;border:0;color:var(--ink);text-align:left;cursor:pointer;padding:6px 0}
.gpsbtn{flex:none;font-family:var(--mono);font-size:11px;padding:6px 9px;border-radius:8px;border:1px solid var(--hair);background:none;color:var(--muted);cursor:pointer;white-space:nowrap}
.gpsbtn:hover{color:var(--ink);border-color:var(--yellow)}
.gpsbtn.has{color:var(--yellow);border-color:rgba(255,230,0,.4)}
.miniroute{width:104px;height:104px;flex:none;background:rgba(0,0,0,.3);border:1px solid var(--hair);border-radius:10px}
.lmap{height:430px;border-radius:14px;overflow:hidden;border:1px solid var(--hair)}
.uploader{position:fixed;inset:0;background:rgba(0,0,0,.62);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px}
.up-card{background:var(--bg2);border:1px solid var(--hair);border-radius:16px;padding:22px;max-width:340px;width:100%}
.up-head{font-family:var(--disp);font-weight:700;font-size:16px;margin-bottom:12px}
.up-prev{display:flex;gap:14px;align-items:center;margin:6px 0 16px}
.up-stats{display:flex;flex-direction:column;gap:5px;font-size:16px}
.up-actions{display:flex;gap:8px;justify-content:flex-end}
.up-btn{font-family:var(--mono);font-size:13px;padding:9px 14px;border-radius:9px;border:1px solid var(--hair);background:none;color:var(--ink);cursor:pointer}
.up-btn.save{background:var(--yellow);color:#111;border-color:var(--yellow);font-weight:600}
.up-btn.ghost{color:var(--muted)} .up-btn:disabled{opacity:.6}
.pyear{font-weight:600} .pcomp{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pleg{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0} .ptime{text-align:right;font-size:13.5px;white-space:nowrap}
.pbar{height:7px;border-radius:4px;background:rgba(255,255,255,.06);overflow:hidden}
.pbar-fill{display:block;height:100%;background:linear-gradient(90deg,var(--yellow-d),var(--yellow))}
.prank{text-align:right;font-size:12px;white-space:nowrap}

.benchmark{display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:linear-gradient(90deg,rgba(255,126,46,.10),rgba(255,126,46,.02));
  border:1px solid rgba(255,126,46,.28);border-radius:14px;padding:14px 18px}
.bm-flag{width:18px;height:18px;flex:none;background:linear-gradient(135deg,#fff 0 50%,var(--orange) 50% 100%);border:1px solid var(--orange);border-radius:3px}
.bm-main{display:flex;flex-direction:column;gap:1px;margin-right:auto}
.bm-k{font-size:10.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--orange)}
.bm-team{font-weight:600;font-size:15px}
.bm-time{font-size:17px;color:var(--orange)}
.bm-ratio{font-size:12px;color:var(--muted);border-left:1px solid var(--hair);padding-left:14px}
@media(max-width:560px){.bm-ratio{border-left:0;padding-left:0;width:100%}}
.back{align-self:flex-start;background:none;border:1px solid var(--hair);border-radius:999px;color:var(--muted);
  padding:7px 14px;cursor:pointer;font-family:var(--mono);font-size:12.5px}
.back:hover{color:var(--ink);border-color:var(--yellow)}
.foot{max-width:880px;margin:16px auto 0;padding:18px;color:var(--muted);font-size:11.5px;text-align:center;border-top:1px solid var(--hair)}
.cmp-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.cmp-pick{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px}
.cmp-vs{color:var(--muted);font-size:13px}
.cmp-sel{width:100%;max-width:180px;background:var(--bg2);color:var(--ink);border:1px solid var(--hair);border-radius:9px;padding:8px 10px;font-family:var(--body);font-size:13px;cursor:pointer}
.cmp-rows{display:flex;flex-direction:column}
.cmp-row{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;padding:11px 6px;border-top:1px solid var(--hair)}
.cmp-row:first-child{border-top:0}
.cmp-v{font-size:15px;text-align:center}
.cmp-v.win{color:var(--yellow);font-weight:600}
.cmp-k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
.s14-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.s14-c{background:rgba(0,0,0,.16);border:1px solid var(--hair);border-radius:12px;padding:16px 14px;text-align:center}
.s14-v{font-family:var(--disp);font-weight:800;font-size:34px;line-height:1;color:var(--yellow)}
.s14-k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-top:8px}
.venuemap{display:grid;grid-template-columns:200px 1fr;gap:20px;align-items:start}
.fmap{width:100%;max-width:200px;height:auto}
.fmap-land{fill:rgba(255,255,255,.05);stroke:var(--hair);stroke-width:1}
.vdot{fill:var(--yellow);stroke:#0a120d;stroke-width:1.2;cursor:pointer}
.vdot.dnf{fill:var(--red)} .vdot.next{fill:var(--orange)}
.venuelist{display:flex;flex-direction:column;gap:6px}
.vchip{display:grid;grid-template-columns:46px 1fr auto;gap:10px;align-items:center;background:rgba(0,0,0,.16);border:1px solid var(--hair);border-radius:10px;padding:9px 12px;cursor:pointer;color:var(--ink);text-align:left}
.vchip:hover{border-color:var(--yellow)}
.vchip.next{border-color:rgba(255,126,46,.4)}
.vchip-y{font-weight:600} .vchip-t{font-size:14px}
.vchip-r{font-size:12px;color:var(--muted)}
.vchip.next .vchip-r{color:var(--orange)} .vchip.dnf .vchip-r{color:var(--red)}
@media(max-width:560px){.s14-grid{grid-template-columns:repeat(2,1fr)}.venuemap{grid-template-columns:1fr}.fmap{max-width:160px;margin:0 auto;display:block}}

@media(max-width:640px){
  .stats{grid-template-columns:repeat(2,1fr)}
  .records{grid-template-columns:1fr}
  .roster{grid-template-columns:1fr}
  .tr{grid-template-columns:42px 1fr 78px 50px;}
  .tr span:nth-child(5){display:none}
  .leg{grid-template-columns:30px 1fr 80px 80px}
  .leg-rank{display:none}
  .prow-main{grid-template-columns:34px minmax(0,1fr) auto auto;gap:7px}
  .prow-main .pcomp,.prow-main .pbar{display:none}
  .prow{padding:5px 7px 5px 11px}
  .prow-main .ptime,.prow-main .prank{font-size:12px}
  .gpsbtn{font-size:10px;padding:6px 7px}
}
`}</style>
  );
}
