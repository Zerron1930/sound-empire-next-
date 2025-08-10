import React, { useEffect, useReducer, useState } from "react";

/* ==========================================================
   Sound Empire — Next (Functional MVP)
   - Gradient UI + Character Creation
   - Home (no quick actions), Projects, Charts, Alerts, Settings, Create
   - Write -> Release -> Advance Week -> Charts & Money
   - LocalStorage persistence
   ========================================================== */

const STORAGE_KEY = "se_next_save_v1";

// --------- helpers
const fmtMoney = (n) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

const brand = {
  purpleGrad: "from-[#7C4DFF] to-[#5634D6]",
  bg: "bg-[#0b0b0f]",
  panel: "bg-[#141418]",
  card: "bg-[#191a20]",
  ring: "ring-1 ring-white/5",
  dim: "text-neutral-400",
  glow: "shadow-[0_12px_36px_-12px_rgba(124,77,255,.5)]"
};

// --------- constants (easy to tweak)
const PAYOUT_PER_STREAM = 0.0035;
const BASE_DISCOVERY = 500;
const POP_WEIGHT = 60;
const REP_WEIGHT = 40;
const ENERGY_MAX = 100;

// --------- state
const initialState = {
  profile: null, // {name, age, year, gender, difficulty}
  time: { week: 1, year: 2025 },
  stats: { popularity: 1, inspiration: 100, reputation: 50, energy: ENERGY_MAX, money: 1000 },
  drafts: [],
  releases: [],
  alerts: []
};

function reducer(state, action) {
  switch (action.type) {
    case "LOAD":
      return action.payload ?? state;

    case "CREATE_PROFILE": {
      const p = action.payload;
      return {
        ...state,
        profile: p,
        time: { week: 1, year: Number(p.year) || 2025 },
        alerts: [{ id: uid(), kind: "info", msg: `Welcome, ${p.name}!`, t: Date.now() }, ...state.alerts]
      };
    }

    case "WRITE_SONG": {
      const title = action.payload || `Untitled ${state.drafts.length + 1}`;
      const quality = Math.floor(55 + Math.random() * 45); // 55-100
      const draft = { id: uid(), title, quality };
      return { ...state, drafts: [draft, ...state.drafts] };
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

    case "ADVANCE_WEEK": {
      // simulate streams
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

      // stat drift
      const newPop = clamp(Math.round(clamp(state.stats.popularity + weekStreams / 200000, 1, 100)), 1, 100);
      const newRep = clamp(Math.round(clamp(state.stats.reputation + 0.2, 1, 100)), 1, 100);

      // tick time
      let { week, year } = state.time;
      week += 1;
      if (week > 52) {
        week = 1;
        year += 1;
      }

      return {
        ...state,
        time: { week, year },
        releases: afterRank,
        stats: {
          ...state.stats,
          energy: clamp(state.stats.energy + 10, 0, ENERGY_MAX),
          popularity: newPop,
          reputation: newRep,
          money: state.stats.money + pay
        },
        alerts: [
          { id: uid(), kind: "info", msg: `Week advanced — ${weekStreams.toLocaleString()} streams (+${fmtMoney(pay)})`, t: Date.now() },
          ...state.alerts
        ]
      };
    }

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

const Screen = ({ children }) => <div className="px-4 pb-28 pt-6">{children}</div>;

const TopGrad = ({ title, subtitle, right }) => (
  <div className="mb-4">
    <div className={`w-full h-24 rounded-2xl bg-gradient-to-br ${brand.purpleGrad} ${brand.glow} p-5 flex items-end justify-between`}>
      <div>
        <div className="text-xl font-extrabold tracking-tight">{title}</div>
        {subtitle && <div className="text-white/80 -mt-0.5">{subtitle}</div>}
      </div>
      {right}
    </div>
  </div>
);

// --------- Pages
function Home({ state, dispatch }) {
  return (
    <Screen>
      <TopGrad
        title="Home"
        subtitle="Dashboard"
        right={
          <button
            onClick={() => dispatch({ type: "ADVANCE_WEEK" })}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white bg-black/20 backdrop-blur ${brand.ring}`}
          >
            » Progress Week
          </button>
        }
      />

      <div className="flex items-center gap-3 mb-4">
        <span className="inline-flex items-center rounded-xl px-3 py-1 bg-white/5">{state.time.year}</span>
        <span className={`${brand.dim}`}>Week {state.time.week}</span>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Panel className="flex items-center gap-4">
          <div className="size-14 rounded-full bg-white/5 grid place-items-center">✦</div>
          <div className="flex-1">
            <div className={`${brand.dim} text-sm`}>Artist</div>
            <div className="text-lg font-semibold">{state.profile?.name ?? "— (go to Create tab)"}</div>
          </div>
        </Panel>

        <Panel className="bg-gradient-to-br from-[#151526] to-[#121218]">
          <div className={`${brand.dim} text-sm`}>Money</div>
          <div className="text-3xl font-extrabold mt-1">{fmtMoney(state.stats.money)}</div>
          <div className="mt-2 text-neutral-300 flex gap-5 text-sm">
            <span>Popularity {state.stats.popularity}%</span>
            <span>Reputation {state.stats.reputation}%</span>
            <span>Energy {state.stats.energy}/100</span>
          </div>
        </Panel>
      </div>
    </Screen>
  );
}

function Create({ dispatch }) {
  const [form, setForm] = useState({ name: "", age: "", year: "2025", gender: "", difficulty: "Normal" });
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Screen>
      <TopGrad title="ST✦GE" subtitle="Character Creation" />
      <Panel className="p-0 overflow-hidden">
        <div className={`p-6 bg-gradient-to-br ${brand.purpleGrad}`}>
          <div className="h-40 w-full rounded-xl bg-black/20 border border-white/10 grid place-items-center">
            <div className="text-white/80">Add default picture (optional)</div>
          </div>
        </div>
        <div className="p-6 grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Artist Name">
              <input className="w-full rounded-xl bg-white/5 px-3 py-2 outline-none" value={form.name} onChange={(e) => update("name", e.target.value)} />
            </Field>
            <Field label="Age">
              <input className="w-full rounded-xl bg-white/5 px-3 py-2 outline-none" value={form.age} onChange={(e) => update("age", e.target.value)} />
            </Field>
            <Field label="Starting Year">
              <select className="w-full rounded-xl bg-white/5 px-3 py-2 outline-none" value={form.year} onChange={(e) => update("year", e.target.value)}>
                {["2023","2024","2025","2026"].map((y) => <option key={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="Gender">
              <select className="w-full rounded-xl bg-white/5 px-3 py-2 outline-none" value={form.gender} onChange={(e) => update("gender", e.target.value)}>
                <option value="">Select…</option>
                <option>Male</option><option>Female</option><option>Other</option>
              </select>
            </Field>
          </div>
          <Field label="Difficulty">
            <select className="w-full rounded-xl bg-white/5 px-3 py-2 outline-none" value={form.difficulty} onChange={(e) => update("difficulty", e.target.value)}>
              <option>Easy</option><option>Normal</option><option>Hard</option>
            </select>
          </Field>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => {
                if (!form.name.trim()) { alert("Please enter a name."); return; }
                dispatch({ type: "CREATE_PROFILE", payload: form });
              }}
              className={`rounded-xl px-4 py-2 font-semibold bg-gradient-to-br ${brand.purpleGrad}`}
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

function Projects({ state, dispatch }) {
  const [title, setTitle] = useState("");

  return (
    <Screen>
      <TopGrad title="Projects" subtitle="Write • Release" />
      <div className="grid gap-4">
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
              className={`rounded-xl px-4 py-2 font-semibold bg-gradient-to-br ${brand.purpleGrad}`}
            >
              Write Song
            </button>
          </div>
        </Panel>

        <Panel>
          <div className="font-semibold mb-2">Unreleased Tracks</div>
          {state.drafts.length === 0 && <div className={`${brand.dim}`}>No drafts yet.</div>}
          <div className="grid gap-2">
            {state.drafts.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                <div>
                  <div className="font-semibold">{d.title}</div>
                  <div className={`${brand.dim} text-sm`}>Quality {d.quality}</div>
                </div>
                <button
                  onClick={() => dispatch({ type: "RELEASE_SONG", payload: d.id })}
                  className="rounded-lg px-3 py-1 bg-black/30 border border-white/10"
                >
                  Release
                </button>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <div className="font-semibold mb-2">Released</div>
          {state.releases.length === 0 && <div className={`${brand.dim}`}>No released songs yet.</div>}
          <div className="grid gap-2">
            {state.releases.map((r) => (
              <div key={r.id} className="rounded-xl bg-white/5 px-3 py-2">
                <div className="font-semibold">{r.title}</div>
                <div className={`${brand.dim} text-sm`}>Weeks on chart: {r.weeksOn} • Peak: {r.peakPos ?? "—"}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Screen>
  );
}

function Charts({ state }) {
  // rank by latest-week streams
  const ranked = [...state.releases]
    .map((r) => ({ ...r, weekStreams: r.streamsHistory.at(-1) ?? 0 }))
    .sort((a, b) => b.weekStreams - a.weekStreams);

  return (
    <Screen>
      <TopGrad title="Charts" subtitle="Hot 100" />
      {ranked.length === 0 ? (
        <Panel>No chart entries yet.</Panel>
      ) : (
        <div className="grid gap-2">
          {ranked.map((r, i) => (
            <Panel key={r.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 text-center text-lg font-extrabold">{i + 1}</div>
                <div>
                  <div className="font-semibold">{r.title}</div>
                  <div className={`${brand.dim} text-sm`}>Wks {r.weeksOn} • Peak {r.peakPos ?? "—"} • LW {r.lastWeekPos ?? "—"}</div>
                </div>
              </div>
              <div className={`${brand.dim}`}>{r.weekStreams.toLocaleString()} streams</div>
            </Panel>
          ))}
        </div>
      )}
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
const TABS = ["Home", "Projects", "Charts", "Alerts", "Create", "Settings"];

export default function App() {
  const [state, dispatch] = useSavedReducer();
  const [tab, setTab] = useState("Home");

  useEffect(() => {
    // first-time: push to Create if no profile
    if (!state.profile && tab !== "Create") setTab("Create");
  }, [state.profile, tab]);

  return (
    <div className={`${brand.bg} min-h-screen`}>
      {tab === "Home" && <Home state={state} dispatch={dispatch} />}
      {tab === "Projects" && <Projects state={state} dispatch={dispatch} />}
      {tab === "Charts" && <Charts state={state} />}
      {tab === "Alerts" && <Alerts state={state} dispatch={dispatch} />}
      {tab === "Create" && <Create dispatch={dispatch} />}
      {tab === "Settings" && <Settings dispatch={dispatch} />}

      <nav className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/40 backdrop-blur">
        <div className="mx-auto max-w-3xl px-3 py-3 grid grid-cols-6 gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-xl px-3 py-2 text-sm ${tab === t ? "bg-white/10" : "bg-white/[0.03]"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
