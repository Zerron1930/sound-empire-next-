import React, { useEffect, useReducer, useState } from "react";

/* ==========================================================
   Sound Empire — Next
   - Blue gradient theme + debranded Create page
   - Startup screen (Continue / New Game)
   - Nav: Home • Studio • Media (Charts inside) • Activities • Settings
   - Charts are locked until you release your first single/project
   - Studio: EPs (3–7) & Albums (8–14) from drafts
   - "Write Song" costs Energy/Inspiration
   - LocalStorage persistence
   ========================================================== */

const STORAGE_KEY = "se_next_save_v1";

// --------- helpers
const fmtMoney = (n) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

// compute current age from starting age + elapsed years
const currentAge = (profile, time) => {
  if (!profile?.age) return "—";
  const startYear = Number(profile.year) || time.year;
  const baseAge = Number(profile.age) || 0;
  const delta = Math.max(0, time.year - startYear);
  return baseAge + delta;
};

const brand = {
  blueGrad: "from-[#3B82F6] to-[#1D4ED8]", // blue-500 → blue-700
  bg: "bg-[#0b0b0f]",
  panel: "bg-[#141418]",
  card: "bg-[#191a20]",
  ring: "ring-1 ring-white/5",
  dim: "text-neutral-400",
  glow: "shadow-[0_12px_36px_-12px_rgba(59,130,246,.45)]" // blue glow
};

// --------- constants (easy to tweak)
const PAYOUT_PER_STREAM = 0.0035;
const BASE_DISCOVERY = 500;
const POP_WEIGHT = 60;
const REP_WEIGHT = 40;
const ENERGY_MAX = 100;
const INSPIRATION_MAX = 100;
const WRITE_COST_ENERGY = 10;
const WRITE_COST_INSPIRATION = 15;

// Project rules
const PROJECT_RULES = {
  EP: { min: 3, max: 7 },
  ALBUM: { min: 8, max: 14 }
};

// --------- state
const initialState = {
  profile: null, // {firstName, lastName, artistName, age, year, gender, difficulty}
  time: { week: 1, year: 2025 },
  stats: { popularity: 1, inspiration: 100, reputation: 50, energy: ENERGY_MAX, money: 1000 },
  events: [], // { id, type, title, week, effects: { pop?:number, rep?:number, money?:number, energy?:number, insp?:number } }
  drafts: [],
  releases: [], // singles + project entries (project shows as a single line item)
  projects: [], // detailed EP/ALBUM objects with track lists
  alerts: []
};

function reducer(state, action) {
  switch (action.type) {
    case "LOAD": {
      const payload = action.payload;
      if (!payload) return state;
      
      // Migration: convert old profile.name to new schema
      if (payload.profile?.name && !payload.profile.artistName) {
        payload.profile = {
          firstName: "",
          lastName: "",
          artistName: payload.profile.name,
          age: payload.profile.age || "",
          year: payload.profile.year || "2025",
          gender: payload.profile.gender || "",
          difficulty: payload.profile.difficulty || "Normal"
        };
      }
      
      return payload;
    }

    case "CREATE_PROFILE": {
      const p = action.payload;
      return {
        ...state,
        profile: p,
        time: { week: 1, year: Number(p.year) || 2025 },
        alerts: [{ id: uid(), kind: "info", msg: `Welcome, ${p.artistName}!`, t: Date.now() }, ...state.alerts]
      };
    }

    case "WRITE_SONG": {
      if (state.stats.energy < WRITE_COST_ENERGY || state.stats.inspiration < WRITE_COST_INSPIRATION) {
        return {
          ...state,
          alerts: [{ id: uid(), kind: "info", msg: "Too tired to write. Rest a bit first.", t: Date.now() }, ...state.alerts]
        };
      }

      const energyLeft = clamp(state.stats.energy - WRITE_COST_ENERGY, 0, ENERGY_MAX);
      const inspLeft = clamp(state.stats.inspiration - WRITE_COST_INSPIRATION, 0, 100);

      const title = action.payload || `Untitled ${state.drafts.length + 1}`;
      const quality = Math.floor(55 + Math.random() * 45); // 55-100
      const draft = { id: uid(), title, quality };

      return {
        ...state,
        drafts: [draft, ...state.drafts],
        stats: { ...state.stats, inspiration: inspLeft, energy: energyLeft }
      };
    }

    case "RELEASE_SONG": {
      const id = action.payload;
      const d = state.drafts.find((x) => x.id === id);
      if (!d) return state;
      const rel = {
        id: d.id,
        title: d.title,
        quality: d.quality,
        weekReleased: state.time.week,
        yearReleased: state.time.year,
        weeksOn: 0,
        peakPos: null,
        lastWeekPos: null,
        streamsHistory: []
      };
      return {
        ...state,
        drafts: state.drafts.filter((x) => x.id !== id),
        releases: [rel, ...state.releases],
        alerts: [{ id: uid(), kind: "success", msg: `Released "${d.title}"`, t: Date.now() }, ...state.alerts]
      };
    }

    // Create & release an EP/Album from selected drafts
    case "CREATE_PROJECT": {
      const { title, type, songIds } = action.payload; // type: "EP" | "ALBUM"
      const rules = PROJECT_RULES[type];
      if (!rules) return state;

      const chosen = state.drafts.filter((d) => songIds.includes(d.id));
      if (chosen.length < rules.min || chosen.length > rules.max) {
        return {
          ...state,
          alerts: [
            { id: uid(), kind: "info", msg: `${type} must have ${rules.min}-${rules.max} tracks.`, t: Date.now() },
            ...state.alerts
          ]
        };
      }
      if (!title?.trim()) {
        return {
          ...state,
          alerts: [{ id: uid(), kind: "info", msg: "Enter a project title.", t: Date.now() }, ...state.alerts]
        };
      }

      const avgQuality = Math.round(chosen.reduce((s, d) => s + d.quality, 0) / chosen.length);

      const project = {
        id: uid(),
        title: title.trim(),
        type, // "EP" | "ALBUM"
        songs: chosen.map((d) => ({ id: d.id, title: d.title, quality: d.quality })),
        weekReleased: state.time.week,
        yearReleased: state.time.year,
        streamsHistory: []
      };

      // Project appears on charts as one release entry too
      const release = {
        id: project.id, // share id for easy linking
        title: `${project.title} (${type})`,
        type,
        quality: avgQuality,
        weekReleased: state.time.week,
        yearReleased: state.time.year,
        weeksOn: 0,
        peakPos: null,
        lastWeekPos: null,
        streamsHistory: []
      };

      return {
        ...state,
        drafts: state.drafts.filter((d) => !songIds.includes(d.id)), // remove used drafts
        projects: [project, ...state.projects],
        releases: [release, ...state.releases],
        alerts: [{ id: uid(), kind: "success", msg: `Released ${type}: "${project.title}"`, t: Date.now() }, ...state.alerts]
      };
    }

    case "ADVANCE_WEEK": {
      const { popularity, reputation } = state.stats;

      const updated = state.releases.map((r) => {
        const discovery =
          BASE_DISCOVERY +
          (popularity * POP_WEIGHT + reputation * REP_WEIGHT) * 4 +
          r.quality * 20 +
          Math.random() * 800;

        const decay = Math.max(0.5, 1 - r.weeksOn * 0.08);
        const streams = Math.max(0, Math.round(discovery * decay));

        return {
          ...r,
          weeksOn: r.weeksOn + 1,
          streamsHistory: [...r.streamsHistory, streams]
        };
      });

      // rank by this-week streams
      const ranked = [...updated]
        .sort((a, b) => (b.streamsHistory.at(-1) ?? 0) - (a.streamsHistory.at(-1) ?? 0))
        .map((r, i) => ({ id: r.id, pos: i + 1 }));

      const afterRank = updated.map((r) => {
        const pos = ranked.find((x) => x.id === r.id)?.pos ?? null;
        const peak = r.peakPos == null ? pos : Math.min(r.peakPos, pos ?? Infinity);
        return { ...r, lastWeekPos: pos, peakPos: peak };
      });

      const weekStreams = afterRank.reduce((s, r) => s + (r.streamsHistory.at(-1) ?? 0), 0);
      const pay = weekStreams * PAYOUT_PER_STREAM;

      // gather this week's events and their effects
      const thisWeeksEvents = state.events.filter(e => e.week === state.time.week);
      const effects = thisWeeksEvents.reduce((acc, e) => {
        const fx = e.effects ?? {};
        acc.pop += fx.pop ?? 0;
        acc.rep += fx.rep ?? 0;
        acc.money += fx.money ?? 0;
        acc.energy += fx.energy ?? 0;
        acc.insp += fx.insp ?? 0;
        return acc;
      }, { pop:0, rep:0, money:0, energy:0, insp:0 });

      // stat drift from streams (existing)
      const popFromStreams = weekStreams / 200000;
      const repDrift = 0.2;

      // apply chart drift first
      let newPop = clamp(Math.round(clamp(state.stats.popularity + popFromStreams, 1, 100)), 1, 100);
      let newRep = clamp(Math.round(clamp(state.stats.reputation + repDrift, 1, 100)), 1, 100);

      // add event effects
      newPop = clamp(newPop + effects.pop, 1, 100);
      newRep = clamp(newRep + effects.rep, 1, 100);

      // tick time (existing)
      let { week, year } = state.time;
      week += 1;
      if (week > 52) {
        week = 1;
        year += 1;
      }

      // weekly renewals then apply event modifiers
      let nextEnergy = clamp(ENERGY_MAX + effects.energy, 0, ENERGY_MAX);
      let nextInsp   = clamp(INSPIRATION_MAX + effects.insp, 0, INSPIRATION_MAX);

      const nextMoney = state.stats.money + pay + (effects.money ?? 0);

      return {
        ...state,
        time: { week, year },
        releases: afterRank,
        events: state.events.filter(e => e.week !== state.time.week), // consume this week's events
        stats: {
          ...state.stats,
          energy: nextEnergy,
          inspiration: nextInsp,
          popularity: newPop,
          reputation: newRep,
          money: nextMoney
        },
        alerts: [
          { id: uid(), kind: "info", msg: `Week advanced — ${weekStreams.toLocaleString()} streams (+${fmtMoney(pay)})`, t: Date.now() },
          ...thisWeeksEvents.map(e => ({ id: uid(), kind: "success", msg: `Event applied: ${e.title}`, t: Date.now() })),
          ...state.alerts
        ]
      };
    }

    case "SCHEDULE_EVENT": {
      // payload: { id?, type, title, week, effects }
      const e = action.payload;
      const evt = { id: e.id ?? uid(), ...e };
      return { ...state, events: [...state.events, evt],
        alerts: [{ id: uid(), kind: "info", msg: `Scheduled: ${evt.title} (Week ${evt.week})`, t: Date.now() }, ...state.alerts]
      };
    }

    case "CANCEL_EVENT": {
      // payload: eventId
      const id = action.payload;
      const found = state.events.find(x => x.id === id);
      return { ...state, events: state.events.filter(x => x.id !== id),
        alerts: found ? [{ id: uid(), kind: "info", msg: `Canceled: ${found.title}`, t: Date.now() }, ...state.alerts] : state.alerts
      };
    }

    // Example schedule:
    // dispatch({ type: "SCHEDULE_EVENT", payload: {
    //   type: "gig", title: "Club Gig - Midtown", week: state.time.week, 
    //   effects: { money: 1200, pop: 2, rep: 1, energy: -15 }
    // }});

    case "MARK_ALERTS_READ":
      return { ...state, alerts: [] };

    case "DELETE_SAVE":
      return structuredClone(initialState);

    default:
      return state;
  }
}

function useSavedReducer() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // load once
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        dispatch({ type: "LOAD", payload: JSON.parse(raw) });
      } catch {}
    }
  }, []);

  // persist
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return [state, dispatch];
}

// --------- UI atoms
const Panel = ({ children, className = "" }) => (
  <div className={`rounded-2xl ${brand.card} ${brand.ring} p-4 ${className}`}>{children}</div>
);

const Screen = ({ children }) => <div className="px-4 pb-[96px] pt-6 max-w-3xl mx-auto">{children}</div>;

const TopGrad = ({ title, subtitle, right }) => (
  <div className="mb-4">
    <div
      className={`w-full h-24 rounded-2xl bg-gradient-to-br ${brand.blueGrad} ${brand.glow} p-5 flex items-end justify-between`}
    >
      <div>
        <div className="text-xl font-extrabold tracking-tight">{title}</div>
        {subtitle && <div className="text-white/80 -mt-0.5">{subtitle}</div>}
      </div>
      {right}
    </div>
  </div>
);

// Floating bottom action - centered, with mobile-safe spacing
const BottomAction = ({ children }) => (
  <div className="fixed z-40 left-0 right-0 flex justify-center pointer-events-none bottom-24 md:bottom-20">
    <div className="pointer-events-auto">
      {children}
    </div>
  </div>
);

// --------- Startup
function Startup({ hasSave, onContinue, onNewGame }) {
  return (
    <Screen>
      <TopGrad title="Sound Empire" subtitle="Start" />
      <Panel className="grid gap-4">
        {hasSave ? (
          <>
            <div className={`${brand.dim}`}>We found a previous save on this device.</div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={onContinue} className={`rounded-xl px-4 py-3 font-semibold bg-gradient-to-br ${brand.blueGrad}`}>
                Continue
              </button>
              <button onClick={onNewGame} className="rounded-xl px-4 py-3 bg-white/10">
                New Game
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={`${brand.dim}`}>No save found. Create your artist to begin.</div>
            <button onClick={onNewGame} className={`rounded-xl px-4 py-3 font-semibold bg-gradient-to-br ${brand.blueGrad}`}>
              Create New Artist
            </button>
          </>
        )}
      </Panel>
    </Screen>
  );
}

// --------- Pages
function Home({ state, dispatch }) {
  return (
    <Screen>
      <TopGrad title="Home" subtitle="Dashboard" />

      {/* small status row: year/week + money */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-xl px-3 py-1 bg-white/5">{state.time.year}</span>
          <span className={`${brand.dim}`}>Week {state.time.week}</span>
        </div>
        <div className="font-semibold">{fmtMoney(state.stats.money)}</div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Panel className="flex items-center gap-4">
          <div className="size-14 rounded-full bg-white/5 grid place-items-center">🎤</div>
          <div className="flex-1">
            <div className={`${brand.dim} text-sm`}>Artist</div>
            <div className="text-lg font-semibold">
              {state.profile?.artistName ?? "— (start a new game)"}
            </div>
            {state.profile && (
              <div className={`${brand.dim} text-sm`}>
                {`${state.profile.firstName ?? ""} ${state.profile.lastName ?? ""}`.trim() || "—"} • Age {state.profile.age || "—"}
              </div>
            )}
          </div>
        </Panel>

        {/* compact stats strip (money moved to header) */}
        <Panel className="bg-gradient-to-br from-[#151526] to-[#121218]">
          <div className="text-neutral-300 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span>Popularity {state.stats.popularity}%</span>
            <span>Reputation {state.stats.reputation}%</span>
            <span>Energy {state.stats.energy}/100</span>
            <span>Inspiration {state.stats.inspiration}/100</span>
          </div>
        </Panel>

        <Panel>
          <div className="font-semibold mb-2">Upcoming</div>
          <div className="max-h-56 md:max-h-64 overflow-y-auto">
            <div className={`${brand.dim}`}>No events scheduled yet. Release music to unlock Charts and promotions.</div>
          </div>
        </Panel>
      </div>

      {/* Floating primary action */}
      <BottomAction>
        <button
          onClick={() => dispatch({ type: "ADVANCE_WEEK" })}
          className="rounded-full px-5 py-3 font-semibold bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] shadow-lg shadow-blue-500/20"
        >
          » Progress Week
        </button>
      </BottomAction>
    </Screen>
  );
}

function Create({ dispatch }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", artistName: "", age: "", year: "2025", gender: "", difficulty: "Normal" });
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Screen>
      <TopGrad title="Create Artist" subtitle="Character Setup" />
      <Panel className="p-0 overflow-hidden">
        <div className={`p-6 bg-gradient-to-br ${brand.blueGrad}`}>
          <div className="h-40 w-full rounded-xl bg-black/20 border border-white/10 grid place-items-center">
            <div className="text-white/80">Add default picture (optional)</div>
          </div>
        </div>
        <div className="p-6 grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="First Name">
              <input
                className="w-full rounded-xl bg-white/5 px-3 py-2 outline-none"
                value={form.firstName}
                onChange={(e) => update("firstName", e.target.value)}
              />
            </Field>
            <Field label="Last Name">
              <input
                className="w-full rounded-xl bg-white/5 px-3 py-2 outline-none"
                value={form.lastName}
                onChange={(e) => update("lastName", e.target.value)}
              />
            </Field>
            <Field label="Artist Name">
              <input
                className="w-full rounded-xl bg-white/5 px-3 py-2 outline-none"
                value={form.artistName}
                onChange={(e) => update("artistName", e.target.value)}
              />
            </Field>
            <Field label="Age">
              <input
                className="w-full rounded-xl bg-white/5 px-3 py-2 outline-none"
                value={form.age}
                onChange={(e) => update("age", e.target.value)}
              />
            </Field>
            <Field label="Starting Year">
              <select
                className="w-full rounded-xl bg-white/5 px-3 py-2 outline-none"
                value={form.year}
                onChange={(e) => update("year", e.target.value)}
              >
                {["2023", "2024", "2025", "2026"].map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </Field>
            <Field label="Gender">
              <select
                className="w-full rounded-xl bg-white/5 px-3 py-2 outline-none"
                value={form.gender}
                onChange={(e) => update("gender", e.target.value)}
              >
                <option value="">Select…</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </Field>
          </div>
          <Field label="Difficulty">
            <select
              className="w-full rounded-xl bg-white/5 px-3 py-2 outline-none"
              value={form.difficulty}
              onChange={(e) => update("difficulty", e.target.value)}
            >
              <option>Easy</option>
              <option>Normal</option>
              <option>Hard</option>
            </select>
          </Field>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => {
                if (!form.firstName.trim() || !form.lastName.trim() || !form.artistName.trim()) {
                  alert("Please enter first name, last name, and artist name.");
                  return;
                }
                dispatch({ type: "CREATE_PROFILE", payload: form });
              }}
              className={`rounded-xl px-4 py-2 font-semibold bg-gradient-to-br ${brand.blueGrad}`}
            >
              Create artist
            </button>
          </div>
        </div>
      </Panel>
    </Screen>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className={`${brand.dim} text-sm mb-1`}>{label}</div>
      {children}
    </label>
  );
}

// --------- STUDIO (formerly Projects)
function Studio({ state, dispatch }) {
  const [title, setTitle] = useState("");

  // project creation state
  const [selected, setSelected] = useState(new Set());
  const [projTitle, setProjTitle] = useState("");
  const [projType, setProjType] = useState("EP");

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const createProject = () => {
    dispatch({
      type: "CREATE_PROJECT",
      payload: { title: projTitle, type: projType, songIds: Array.from(selected) }
    });
    setProjTitle("");
    setSelected(new Set());
  };

  const rules = PROJECT_RULES[projType];
  const selCount = selected.size;

  return (
    <Screen>
      <TopGrad title="Studio" subtitle="Write • Release • Compile" />

      <div className="grid gap-4">
        {/* Write single */}
        <Panel>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              placeholder="Song title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 rounded-xl bg-white/5 px-3 py-2 outline-none"
            />
            <button
              onClick={() => {
                dispatch({ type: "WRITE_SONG", payload: title.trim() || undefined });
                setTitle("");
              }}
              className={`rounded-xl px-4 py-2 font-semibold bg-gradient-to-br ${brand.blueGrad}`}
            >
              Write Song
            </button>
          </div>
          <div className={`${brand.dim} text-xs mt-2`}>
            Costs {WRITE_COST_ENERGY} Energy / {WRITE_COST_INSPIRATION} Inspiration
          </div>
        </Panel>

        {/* Unreleased drafts (selectable) */}
        <Panel>
          <div className="font-semibold mb-2">Unreleased Tracks</div>
          {state.drafts.length === 0 && <div className={`${brand.dim}`}>No drafts yet.</div>}
          <div className="grid gap-2">
            {state.drafts.map((d) => {
              const checked = selected.has(d.id);
              return (
                <div key={d.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={checked} onChange={() => toggleSelect(d.id)} className="accent-white/80" />
                    <div>
                      <div className="font-semibold">{d.title}</div>
                      <div className={`${brand.dim} text-sm`}>Quality {d.quality}</div>
                    </div>
                  </label>
                  <button
                    onClick={() => dispatch({ type: "RELEASE_SONG", payload: d.id })}
                    className="rounded-lg px-3 py-1 bg-black/30 border border-white/10"
                  >
                    Release Single
                  </button>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Create EP/Album */}
        <Panel>
          <div className="font-semibold mb-3">Create Project (EP / Album)</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              placeholder="Project title"
              value={projTitle}
              onChange={(e) => setProjTitle(e.target.value)}
              className="rounded-xl bg-white/5 px-3 py-2 outline-none"
            />
            <select value={projType} onChange={(e) => setProjType(e.target.value)} className="rounded-xl bg-white/5 px-3 py-2 outline-none">
              <option>EP</option>
              <option>ALBUM</option>
            </select>
            <button onClick={createProject} className={`rounded-xl px-4 py-2 font-semibold bg-gradient-to-br ${brand.blueGrad}`}>
              Create & Release {projType}
            </button>
          </div>
          <div className={`${brand.dim} text-xs mt-2`}>
            Selected: {selCount} • Required for {projType}: {rules.min}–{rules.max} tracks
          </div>
        </Panel>

        {/* Released (singles + projects) */}
        <Panel>
          <div className="font-semibold mb-2">Released</div>
          {state.releases.length === 0 && <div className={`${brand.dim}`}>No released music yet.</div>}
          <div className="grid gap-2">
            {state.releases.map((r) => (
              <div key={r.id} className="rounded-xl bg-white/5 px-3 py-2">
                <div className="font-semibold">
                  {r.title}
                  {r.type && <span className="ml-2 text-xs rounded border border-white/15 px-2 py-0.5">{r.type}</span>}
                </div>
                <div className={`${brand.dim} text-sm`}>Weeks on chart: {r.weeksOn} • Peak: {r.peakPos ?? "—"}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Screen>
  );
}

// --------- MEDIA (Charts inside)
function Media({ state }) {
  const [tab, setTab] = useState("Promo"); // "Promo" | "Charts"
  const hasRelease = state.releases.length > 0;

  return (
    <Screen>
      <TopGrad title="Media" subtitle="Social & Charts" />
      <Panel className="p-0 overflow-hidden">
        <div className="flex">
          {["Promo", "Charts"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold ${tab === t ? "bg-white/10" : "bg-white/[0.04]"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="p-4">
          {tab === "Promo" && (
            <div className="grid gap-3">
              <div className="font-semibold">Social & Promotion (coming soon)</div>
              <div className={`${brand.dim}`}>Schedule posts, collabs, and press to boost discovery.</div>
            </div>
          )}
          {tab === "Charts" &&
            (hasRelease ? (
              <ChartsInner state={state} />
            ) : (
              <div className="grid gap-2">
                <div className="text-lg font-semibold">Charts Locked</div>
                <div className={`${brand.dim}`}>Release at least one single or project to unlock Charts.</div>
              </div>
            ))}
        </div>
      </Panel>
    </Screen>
  );
}

// charts UI reused inside Media
function ChartsInner({ state }) {
  const ranked = [...state.releases]
    .map((r) => ({ ...r, weekStreams: r.streamsHistory.at(-1) ?? 0 }))
    .sort((a, b) => b.weekStreams - a.weekStreams);

  if (ranked.length === 0) return <div className={`${brand.dim}`}>No chart entries yet.</div>;

  return (
    <div className="grid gap-2">
      {ranked.map((r, i) => (
        <Panel key={r.id} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 text-center text-lg font-extrabold">{i + 1}</div>
            <div>
              <div className="font-semibold">
                {r.title}
                {r.type && <span className="ml-2 text-xs rounded border border-white/15 px-2 py-0.5">{r.type}</span>}
              </div>
              <div className={`${brand.dim} text-sm`}>Wks {r.weeksOn} • Peak {r.peakPos ?? "—"} • LW {r.lastWeekPos ?? "—"}</div>
            </div>
          </div>
          <div className={`${brand.dim}`}>{r.weekStreams.toLocaleString()} streams</div>
        </Panel>
      ))}
    </div>
  );
}

// --------- ACTIVITIES
function Activities() {
  return (
    <Screen>
      <TopGrad title="Activities" subtitle="Skills • Jobs • Shop • Finance" />
      <div className="grid gap-4">
        <Panel>
          <div className="font-semibold mb-1">Skills (coming soon)</div>
          <div className={`${brand.dim}`}>Upskill to improve song quality, promo impact, and earnings.</div>
        </Panel>
        <Panel>
          <div className="font-semibold mb-1">Jobs & Gigs (coming soon)</div>
          <div className={`${brand.dim}`}>Take gigs to earn cash, gain rep, or recover inspiration.</div>
        </Panel>
        <Panel>
          <div className="font-semibold mb-1">Shop (coming soon)</div>
          <div className={`${brand.dim}`}>Buy gear and items that affect stats and production.</div>
        </Panel>
        <Panel>
          <div className="font-semibold mb-1">Finance (coming soon)</div>
          <div className={`${brand.dim}`}>Track income and expenses from releases and activities.</div>
        </Panel>
      </div>
    </Screen>
  );
}

function Alerts({ state, dispatch }) {
  return (
    <Screen>
      <TopGrad
        title="Alerts"
        right={
          <button onClick={() => dispatch({ type: "MARK_ALERTS_READ" })} className="rounded-xl px-3 py-2 bg-black/20 border border-white/10">
            Mark all read
          </button>
        }
      />
      <div className="grid gap-2">
        {state.alerts.length === 0 && <Panel className={`${brand.dim}`}>No notifications yet.</Panel>}
        {state.alerts.map((a) => (
          <Panel key={a.id} className={a.kind === "success" ? "border-green-500/30 ring-green-500/20" : ""}>
            {a.msg}
          </Panel>
        ))}
      </div>
    </Screen>
  );
}

function Settings({ dispatch }) {
  return (
    <Screen>
      <TopGrad title="Settings" subtitle="Save & Tools" />
      <Panel>
        <div className="font-semibold mb-2">Danger Zone</div>
        <button
          onClick={() => {
            if (confirm("Delete save and restart?")) dispatch({ type: "DELETE_SAVE" });
          }}
          className="rounded-xl px-4 py-2 bg-red-600/80"
        >
          Delete Save
        </button>
      </Panel>
    </Screen>
  );
}

// --------- Shell
const NAV = [
  { key: "Home", label: "Home", icon: "🏠" },
  { key: "Studio", label: "Studio", icon: "🎛️" },
  { key: "Media", label: "Media", icon: "📣" },
  { key: "Activities", label: "Activities", icon: "🧭" },
  { key: "Settings", label: "Settings", icon: "⚙️" }
];

export default function App() {
  const [state, dispatch] = useSavedReducer();
  const [tab, setTab] = useState("Home");
  const [showStartup, setShowStartup] = useState(true);

  // decide first route once startup is dismissed
  useEffect(() => {
    if (!showStartup) {
      if (state.profile) setTab("Home");
      else setTab("Create");
    }
  }, [showStartup, state.profile]);

  const started = !!state.profile; // has created/loaded a profile

  return (
    <div className={`${brand.bg} min-h-screen`}>
      {/* Startup overlay */}
      {showStartup && (
        <Startup
          hasSave={!!localStorage.getItem(STORAGE_KEY)}
          onContinue={() => setShowStartup(false)}
          onNewGame={() => {
            dispatch({ type: "DELETE_SAVE" });
            localStorage.removeItem(STORAGE_KEY);
            setShowStartup(false);
          }}
        />
      )}

      {/* When startup is gone but no profile yet → Create only (no nav) */}
      {!showStartup && !started && <Create dispatch={dispatch} />}

      {/* Main app once a profile exists */}
      {!showStartup && started && (
        <>
          {tab === "Home" && <Home state={state} dispatch={dispatch} />}
          {tab === "Studio" && <Studio state={state} dispatch={dispatch} />}
          {tab === "Media" && <Media state={state} />}
          {tab === "Activities" && <Activities />}
          {tab === "Settings" && <Settings dispatch={dispatch} />}

          <nav className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/50 backdrop-blur supports-[backdrop-filter]:bg-black/30">
            <div className="mx-auto max-w-3xl px-3 py-2 grid grid-cols-5 gap-2">
              {NAV.map((n) => {
                const active = tab === n.key;
                return (
                  <button
                    key={n.key}
                    onClick={() => setTab(n.key)}
                    className={`rounded-xl px-3 py-2 text-xs sm:text-sm flex flex-col items-center justify-center ${
                      active ? "bg-white/10" : "bg-white/[0.03]"
                    }`}
                    aria-label={n.label}
                  >
                    <span className="text-lg leading-none">{n.icon}</span>
                    <span className="mt-0.5">{n.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
