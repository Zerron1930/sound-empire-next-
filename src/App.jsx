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
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const uid = () =>
  crypto?.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

// Event system helpers
const rng = () => Math.random(); // Can be replaced with seeded randomness later
const weightedPick = (weights) => {
  const total = weights.reduce((sum, [_, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return weights[weights.length - 1][0];
};

const nextWeeks = (currentWeek, minAhead, maxAhead) => {
  let target =
    currentWeek + minAhead + Math.floor(rng() * (maxAhead - minAhead + 1));
  if (target > 52) target = target - 52;
  return target;
};

const payoutBase = (pop, scale) => Math.round((200 + pop * 12) * scale);

// Generate weekly offers for gigs and interviews
const generateWeeklyOffers = (currentWeek, currentPop) => {
  const offers = { gigs: [], interviews: [] };

  // Generate 6-8 gig offers
  const gigCount = 6 + Math.floor(rng() * 3);
  for (let i = 0; i < gigCount; i++) {
    const subType = weightedPick([
      ["club", 40],
      ["concert", 30],
      ["festival", 18],
      ["arena", 12],
    ]);

    const config = {
      club: { energy: 12, scale: 0.8, popRange: [1, 2], repRange: [0, 1] },
      concert: { energy: 18, scale: 1.0, popRange: [2, 3], repRange: [0, 1] },
      festival: { energy: 22, scale: 1.2, popRange: [3, 4], repRange: [-1, 1] },
      arena: { energy: 28, scale: 1.5, popRange: [4, 5], repRange: [0, 2] },
    }[subType];

    const week = nextWeeks(currentWeek, 1, 8);
    const money = payoutBase(currentPop, config.scale + (rng() - 0.5) * 0.2);
    const popDelta =
      config.popRange[0] +
      Math.floor(rng() * (config.popRange[1] - config.popRange[0] + 1));
    const repDelta =
      config.repRange[0] +
      Math.floor(rng() * (config.repRange[1] - config.repRange[0] + 1));

    offers.gigs.push({
      type: "gig",
      subType,
      week,
      energyCost: config.energy,
      money,
      popDelta,
      repDelta,
    });
  }

  // Generate 5-7 interview offers
  const interviewCount = 5 + Math.floor(rng() * 3);
  for (let i = 0; i < interviewCount; i++) {
    const subType = weightedPick([
      ["radio", 40],
      ["podcast", 35],
      ["tv", 25],
    ]);

    // TV only available if popularity >= 65% or 5% lucky chance
    if (subType === "tv" && currentPop < 65 && rng() > 0.05) {
      continue; // Skip this iteration
    }

    const config = {
      radio: { energy: 8, scale: 0.6, popDelta: 1, repDelta: 0 },
      podcast: {
        energy: 10,
        scale: 0.8,
        popDelta: 1 + Math.floor(rng() * 2),
        repDelta: 0,
      },
      tv: { energy: 14, scale: 1.8, popDelta: 5, repDelta: 1 },
    }[subType];

    const week = nextWeeks(currentWeek, 1, 8);
    const money = payoutBase(currentPop, config.scale + (rng() - 0.5) * 0.2);

    offers.interviews.push({
      type: "interview",
      subType,
      week,
      energyCost: config.energy,
      money,
      popDelta: config.popDelta,
      repDelta: config.repDelta,
    });
  }

  return offers;
};

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
  glow: "shadow-[0_12px_36px_-12px_rgba(59,130,246,.45)]", // blue glow
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
  ALBUM: { min: 8, max: 14 },
};

// --------- state
const initialState = {
  profile: null, // {firstName, lastName, artistName, age, year, gender, difficulty}
  time: { week: 1, year: 2025 },
  stats: {
    popularity: 1,
    inspiration: 100,
    reputation: 50,
    energy: ENERGY_MAX,
    money: 1000,
  },
  events: {
    scheduled: [], // Array<{ id, type: "gig"|"interview", subType: "club"|"concert"|"festival"|"arena"|"radio"|"podcast"|"tv", week: number, energyCost: number, money: number, popDelta: number, repDelta: number, notes?: string }>
    offers: {
      gigs: [], // Same fields except id/week/notes not set
      interviews: [], // Same fields except id/week/notes not set
    },
  },
  drafts: [],
  releases: [], // singles + project entries (project shows as a single line item)
  projects: [], // detailed EP/ALBUM objects with track lists
  alerts: [],
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
          difficulty: payload.profile.difficulty || "Normal",
        };
      }

      // Migration: convert old events array to new structure
      if (Array.isArray(payload.events)) {
        payload.events = {
          scheduled: [],
          offers: { gigs: [], interviews: [] },
        };
      }

      // Generate offers if none exist
      if (
        !payload.events?.offers?.gigs?.length &&
        !payload.events?.offers?.interviews?.length
      ) {
        payload.events.offers = generateWeeklyOffers(
          payload.time?.week || 1,
          payload.stats?.popularity || 1,
        );
      }

      return payload;
    }

    case "CREATE_PROFILE": {
      const p = action.payload;
      return {
        ...state,
        profile: p,
        time: { week: 1, year: Number(p.year) || 2025 },
        alerts: [
          {
            id: uid(),
            kind: "info",
            msg: `Welcome, ${p.artistName}!`,
            t: Date.now(),
          },
          ...state.alerts,
        ],
      };
    }

    case "WRITE_SONG": {
      if (
        state.stats.energy < WRITE_COST_ENERGY ||
        state.stats.inspiration < WRITE_COST_INSPIRATION
      ) {
        return {
          ...state,
          alerts: [
            {
              id: uid(),
              kind: "info",
              msg: "Too tired to write. Rest a bit first.",
              t: Date.now(),
            },
            ...state.alerts,
          ],
        };
      }

      const energyLeft = clamp(
        state.stats.energy - WRITE_COST_ENERGY,
        0,
        ENERGY_MAX,
      );
      const inspLeft = clamp(
        state.stats.inspiration - WRITE_COST_INSPIRATION,
        0,
        100,
      );

      const title = action.payload || `Untitled ${state.drafts.length + 1}`;
      const quality = Math.floor(55 + Math.random() * 45); // 55-100
      const draft = { id: uid(), title, quality };

      return {
        ...state,
        drafts: [draft, ...state.drafts],
        stats: { ...state.stats, inspiration: inspLeft, energy: energyLeft },
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
        streamsHistory: [],
      };
      return {
        ...state,
        drafts: state.drafts.filter((x) => x.id !== id),
        releases: [rel, ...state.releases],
        alerts: [
          {
            id: uid(),
            kind: "success",
            msg: `Released "${d.title}"`,
            t: Date.now(),
          },
          ...state.alerts,
        ],
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
            {
              id: uid(),
              kind: "info",
              msg: `${type} must have ${rules.min}-${rules.max} tracks.`,
              t: Date.now(),
            },
            ...state.alerts,
          ],
        };
      }
      if (!title?.trim()) {
        return {
          ...state,
          alerts: [
            {
              id: uid(),
              kind: "info",
              msg: "Enter a project title.",
              t: Date.now(),
            },
            ...state.alerts,
          ],
        };
      }

      const avgQuality = Math.round(
        chosen.reduce((s, d) => s + d.quality, 0) / chosen.length,
      );

      const project = {
        id: uid(),
        title: title.trim(),
        type, // "EP" | "ALBUM"
        songs: chosen.map((d) => ({
          id: d.id,
          title: d.title,
          quality: d.quality,
        })),
        weekReleased: state.time.week,
        yearReleased: state.time.year,
        streamsHistory: [],
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
        streamsHistory: [],
      };

      return {
        ...state,
        drafts: state.drafts.filter((d) => !songIds.includes(d.id)), // remove used drafts
        projects: [project, ...state.projects],
        releases: [release, ...state.releases],
        alerts: [
          {
            id: uid(),
            kind: "success",
            msg: `Released ${type}: "${project.title}"`,
            t: Date.now(),
          },
          ...state.alerts,
        ],
      };
    }

    case "ADVANCE_WEEK": {
      const { popularity, reputation } = state.stats;

      // Process scheduled events for this week first
      const dueEvents = state.events.scheduled.filter(
        (e) => e.week === state.time.week,
      );
      const sortedDueEvents = [...dueEvents].sort(
        (a, b) => a.energyCost - b.energyCost,
      ); // cheapest first

      let remainingEnergy = state.stats.energy;
      const completedEvents = [];
      const postponedEvents = [];
      const eventEffects = { money: 0, pop: 0, rep: 0 };

      // Process events until energy runs out
      for (const event of sortedDueEvents) {
        if (remainingEnergy >= event.energyCost) {
          // Complete the event
          remainingEnergy -= event.energyCost;
          eventEffects.money += event.money;
          eventEffects.pop += event.popDelta;
          eventEffects.rep += event.repDelta;

          // Check for viral interviews
          let viralBonus = "";
          if (
            event.type === "interview" &&
            ["radio", "podcast"].includes(event.subType)
          ) {
            if (rng() < 0.08) {
              // 8% viral chance
              const extraMoney = payoutBase(popularity, 0.9);
              const extraPop = 3;
              eventEffects.money += extraMoney;
              eventEffects.pop += extraPop;
              viralBonus = ` (WENT VIRAL! +${fmtMoney(extraMoney)}, Pop +${extraPop})`;
            }
          }

          completedEvents.push({
            ...event,
            viralBonus,
            message: `Completed ${event.subType} ${event.type} (Week ${state.time.week}): +${fmtMoney(event.money)}, Pop +${event.popDelta}, Rep ${event.repDelta > 0 ? "+" : ""}${event.repDelta}${viralBonus}`,
          });
        } else {
          // Postpone the event
          const postponedEvent = { ...event, week: event.week + 1 };
          if (postponedEvent.week > 52) postponedEvent.week = 1; // wrap year
          postponedEvents.push(postponedEvent);
        }
      }

      // Remove completed events and update postponed ones
      const updatedScheduled = [
        ...state.events.scheduled.filter((e) => e.week !== state.time.week),
        ...postponedEvents,
      ];

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
          streamsHistory: [...r.streamsHistory, streams],
        };
      });

      // rank by this-week streams
      const ranked = [...updated]
        .sort(
          (a, b) =>
            (b.streamsHistory.at(-1) ?? 0) - (a.streamsHistory.at(-1) ?? 0),
        )
        .map((r, i) => ({ id: r.id, pos: i + 1 }));

      const afterRank = updated.map((r) => {
        const pos = ranked.find((x) => x.id === r.id)?.pos ?? null;
        const peak =
          r.peakPos == null ? pos : Math.min(r.peakPos, pos ?? Infinity);
        return { ...r, lastWeekPos: pos, peakPos: peak };
      });

      const weekStreams = afterRank.reduce(
        (s, r) => s + (r.streamsHistory.at(-1) ?? 0),
        0,
      );
      const pay = weekStreams * PAYOUT_PER_STREAM;

      // stat drift from streams (existing)
      const popFromStreams = weekStreams / 200000;
      const repDrift = 0.2;

      // apply chart drift first
      let newPop = clamp(
        Math.round(clamp(state.stats.popularity + popFromStreams, 1, 100)),
        1,
        100,
      );
      let newRep = clamp(
        Math.round(clamp(state.stats.reputation + repDrift, 1, 100)),
        1,
        100,
      );

      // add event effects
      newPop = clamp(newPop + eventEffects.pop, 1, 100);
      newRep = clamp(newRep + eventEffects.rep, 1, 100);

      // tick time (existing)
      let { week, year } = state.time;
      week += 1;
      if (week > 52) {
        week = 1;
        year += 1;
      }

      // weekly renewals then apply event modifiers
      let nextEnergy = clamp(remainingEnergy, 0, ENERGY_MAX);
      let nextInsp = clamp(INSPIRATION_MAX, 0, INSPIRATION_MAX);

      const nextMoney = state.stats.money + pay + eventEffects.money;

      // Generate new offers for the new week
      const newOffers = generateWeeklyOffers(week, newPop);

      // Build alerts
      const alerts = [
        {
          id: uid(),
          kind: "info",
          msg: `Week advanced — ${weekStreams.toLocaleString()} streams (+${fmtMoney(pay)})`,
          t: Date.now(),
        },
      ];

      // Add completed event alerts
      completedEvents.forEach((event) => {
        alerts.push({
          id: uid(),
          kind: "success",
          msg: event.message,
          t: Date.now(),
        });
      });

      // Add postponed event alerts
      postponedEvents.forEach((event) => {
        alerts.push({
          id: uid(),
          kind: "info",
          msg: `Not enough energy; postponed ${event.subType} ${event.type} to Week ${event.week}`,
          t: Date.now(),
        });
      });

      return {
        ...state,
        time: { week, year },
        releases: afterRank,
        events: {
          ...state.events,
          scheduled: updatedScheduled,
          offers: newOffers,
        },
        stats: {
          ...state.stats,
          energy: nextEnergy,
          inspiration: nextInsp,
          popularity: newPop,
          reputation: newRep,
          money: nextMoney,
        },
        alerts: [...alerts, ...state.alerts],
      };
    }

    case "BOOK_EVENT": {
      // payload: { type: "gig"|"interview", subType, week, energyCost, money, popDelta, repDelta }
      const eventData = action.payload;
      const { type, subType } = eventData;

      // Check caps
      const currentScheduled = state.events.scheduled.filter(
        (e) => e.type === type,
      );
      const maxAllowed = type === "gig" ? 5 : 3;

      if (currentScheduled.length >= maxAllowed) {
        return {
          ...state,
          alerts: [
            {
              id: uid(),
              kind: "info",
              msg: `Maximum ${type}s (${maxAllowed}) already scheduled`,
              t: Date.now(),
            },
            ...state.alerts,
          ],
        };
      }

      // Create scheduled event
      const scheduledEvent = {
        id: uid(),
        ...eventData,
      };

      // Remove from offers
      const offerType = type === "gig" ? "gigs" : "interviews";
      const remainingOffers = state.events.offers[offerType].filter(
        (o) =>
          !(
            o.subType === subType &&
            o.week === eventData.week &&
            o.energyCost === eventData.energyCost
          ),
      );

      return {
        ...state,
        events: {
          ...state.events,
          scheduled: [...state.events.scheduled, scheduledEvent],
          offers: {
            ...state.events.offers,
            [offerType]: remainingOffers,
          },
        },
        alerts: [
          {
            id: uid(),
            kind: "success",
            msg: `Booked ${subType} ${type} for Week ${eventData.week}`,
            t: Date.now(),
          },
          ...state.alerts,
        ],
      };
    }

    case "GENERATE_OFFERS": {
      // Regenerate offers for current week
      const newOffers = generateWeeklyOffers(
        state.time.week,
        state.stats.popularity,
      );
      return {
        ...state,
        events: {
          ...state.events,
          offers: newOffers,
        },
      };
    }

    case "CANCEL_EVENT": {
      // payload: eventId
      const id = action.payload;
      const found = state.events.scheduled.find((x) => x.id === id);
      return {
        ...state,
        events: {
          ...state.events,
          scheduled: state.events.scheduled.filter((x) => x.id !== id),
        },
        alerts: found
          ? [
              {
                id: uid(),
                kind: "info",
                msg: `Canceled: ${found.subType} ${found.type}`,
                t: Date.now(),
              },
              ...state.alerts,
            ]
          : state.alerts,
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
  <div className={`rounded-2xl ${brand.card} ${brand.ring} p-4 ${className}`}>
    {children}
  </div>
);

const Screen = ({ children }) => (
  <div className="px-4 pb-[96px] pt-6 max-w-3xl mx-auto">{children}</div>
);

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
    <div className="pointer-events-auto">{children}</div>
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
            <div className={`${brand.dim}`}>
              We found a previous save on this device.
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onContinue}
                className={`rounded-xl px-4 py-3 font-semibold bg-gradient-to-br ${brand.blueGrad}`}
              >
                Continue
              </button>
              <button
                onClick={onNewGame}
                className="rounded-xl px-4 py-3 bg-white/10"
              >
                New Game
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={`${brand.dim}`}>
              No save found. Create your artist to begin.
            </div>
            <button
              onClick={onNewGame}
              className={`rounded-xl px-4 py-3 font-semibold bg-gradient-to-br ${brand.blueGrad}`}
            >
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
          <span className="inline-flex items-center rounded-xl px-3 py-1 bg-white/5">
            {state.time.year}
          </span>
          <span className={`${brand.dim}`}>Week {state.time.week}</span>
        </div>
        <div className="font-semibold">{fmtMoney(state.stats.money)}</div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Panel className="flex items-center gap-4">
          <div className="size-14 rounded-full bg-white/5 grid place-items-center">
            🎤
          </div>
          <div className="flex-1">
            <div className={`${brand.dim} text-sm`}>Artist</div>
            <div className="text-lg font-semibold">
              {state.profile?.artistName ?? "— (start a new game)"}
            </div>
            {state.profile && (
              <div className={`${brand.dim} text-sm`}>
                {`${state.profile.firstName ?? ""} ${state.profile.lastName ?? ""}`.trim() ||
                  "—"}{" "}
                • Age {state.profile.age || "—"}
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
          {(() => {
            const upcoming = state.events.scheduled
              .filter((e) => e.week >= state.time.week)
              .sort((a, b) => a.week - b.week);

            return upcoming.length === 0 ? (
              <div className={`${brand.dim}`}>
                No events scheduled yet. Book gigs and interviews in the Media
                tab.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto pr-1 space-y-2">
                {upcoming.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-lg bg-white/5 px-3 py-2 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        {(() => {
                          const icons = {
                            club: "🎭",
                            concert: "🎪",
                            festival: "🎡",
                            arena: "🏟️",
                            radio: "📻",
                            podcast: "🎙️",
                            tv: "📺",
                          };
                          return icons[e.subType] || "🎤";
                        })()}
                      </span>
                      <div>
                        <div className="font-semibold">
                          {e.subType.charAt(0).toUpperCase() +
                            e.subType.slice(1)}{" "}
                          {e.type === "gig" ? "Gig" : "Interview"}
                        </div>
                        <div className={`${brand.dim} text-xs`}>
                          Week {e.week} • Energy: {e.energyCost} •{" "}
                          {fmtMoney(e.money)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs">
                        <div className="text-green-400">
                          +{e.popDelta > 0 ? e.popDelta : 0} Pop
                        </div>
                        <div className="text-blue-400">
                          {e.repDelta > 0 ? "+" : ""}
                          {e.repDelta} Rep
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
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
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    artistName: "",
    age: "",
    year: "2025",
    gender: "",
    difficulty: "Normal",
  });
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
                if (
                  !form.firstName.trim() ||
                  !form.lastName.trim() ||
                  !form.artistName.trim()
                ) {
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
      payload: {
        title: projTitle,
        type: projType,
        songIds: Array.from(selected),
      },
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
                dispatch({
                  type: "WRITE_SONG",
                  payload: title.trim() || undefined,
                });
                setTitle("");
              }}
              className={`rounded-xl px-4 py-2 font-semibold bg-gradient-to-br ${brand.blueGrad}`}
            >
              Write Song
            </button>
          </div>
          <div className={`${brand.dim} text-xs mt-2`}>
            Costs {WRITE_COST_ENERGY} Energy / {WRITE_COST_INSPIRATION}{" "}
            Inspiration
          </div>
        </Panel>

        {/* Unreleased drafts (selectable) */}
        <Panel>
          <div className="font-semibold mb-2">Unreleased Tracks</div>
          {state.drafts.length === 0 && (
            <div className={`${brand.dim}`}>No drafts yet.</div>
          )}
          <div className="grid gap-2">
            {state.drafts.map((d) => {
              const checked = selected.has(d.id);
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2"
                >
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelect(d.id)}
                      className="accent-white/80"
                    />
                    <div>
                      <div className="font-semibold">{d.title}</div>
                      <div className={`${brand.dim} text-sm`}>
                        Quality {d.quality}
                      </div>
                    </div>
                  </label>
                  <button
                    onClick={() =>
                      dispatch({ type: "RELEASE_SONG", payload: d.id })
                    }
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
            <select
              value={projType}
              onChange={(e) => setProjType(e.target.value)}
              className="rounded-xl bg-white/5 px-3 py-2 outline-none"
            >
              <option>EP</option>
              <option>ALBUM</option>
            </select>
            <button
              onClick={createProject}
              className={`rounded-xl px-4 py-2 font-semibold bg-gradient-to-br ${brand.blueGrad}`}
            >
              Create & Release {projType}
            </button>
          </div>
          <div className={`${brand.dim} text-xs mt-2`}>
            Selected: {selCount} • Required for {projType}: {rules.min}–
            {rules.max} tracks
          </div>
        </Panel>

        {/* Released (singles + projects) */}
        <Panel>
          <div className="font-semibold mb-2">Released</div>
          {state.releases.length === 0 && (
            <div className={`${brand.dim}`}>No released music yet.</div>
          )}
          <div className="grid gap-2">
            {state.releases.map((r) => (
              <div key={r.id} className="rounded-xl bg-white/5 px-3 py-2">
                <div className="font-semibold">
                  {r.title}
                  {r.type && (
                    <span className="ml-2 text-xs rounded border border-white/15 px-2 py-0.5">
                      {r.type}
                    </span>
                  )}
                </div>
                <div className={`${brand.dim} text-sm`}>
                  Weeks on chart: {r.weeksOn} • Peak: {r.peakPos ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Screen>
  );
}

// --------- MEDIA (Charts inside)
function Media({ state, dispatch }) {
  const [tab, setTab] = useState("Promo"); // "Promo" | "Charts"
  const [showGigs, setShowGigs] = useState(false);
  const [showInterviews, setShowInterviews] = useState(false);
  const hasRelease = state.releases.length > 0;

  // Generate offers if none exist
  useEffect(() => {
    if (
      state.events.offers.gigs.length === 0 &&
      state.events.offers.interviews.length === 0
    ) {
      dispatch({ type: "GENERATE_OFFERS" });
    }
  }, [state.time.week, dispatch]);

  const handleBookEvent = (eventData) => {
    dispatch({ type: "BOOK_EVENT", payload: eventData });
  };

  const getEventIcon = (subType) => {
    const icons = {
      club: "🎭",
      concert: "🎪",
      festival: "🎡",
      arena: "🏟️",
      radio: "📻",
      podcast: "🎙️",
      tv: "📺",
    };
    return icons[subType] || "🎤";
  };

  const getEventName = (subType) => {
    const names = {
      club: "Club",
      concert: "Concert",
      festival: "Festival",
      arena: "Arena",
      radio: "Radio",
      podcast: "Podcast",
      tv: "TV",
    };
    return names[subType] || subType;
  };

  return (
    <Screen>
      <TopGrad title="Media" subtitle="Social & Charts" />

      {/* Event Booking Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Panel className="text-center">
          <div className="text-2xl mb-2">🎸</div>
          <div className="font-semibold mb-2">Book Gigs</div>
          <div className={`${brand.dim} text-sm mb-3`}>
            {state.events.scheduled.filter((e) => e.type === "gig").length}/5
            scheduled
          </div>
          <button
            onClick={() => setShowGigs(!showGigs)}
            className={`rounded-xl px-4 py-2 font-semibold ${showGigs ? "bg-white/10" : `bg-gradient-to-br ${brand.blueGrad}`}`}
          >
            {showGigs ? "Hide Offers" : "View Offers"}
          </button>
        </Panel>

        <Panel className="text-center">
          <div className="text-2xl mb-2">🎤</div>
          <div className="font-semibold mb-2">Book Interviews</div>
          <div className={`${brand.dim} text-sm mb-3`}>
            {
              state.events.scheduled.filter((e) => e.type === "interview")
                .length
            }
            /3 scheduled
          </div>
          <button
            onClick={() => setShowInterviews(!showInterviews)}
            className={`rounded-xl px-4 py-2 font-semibold ${showInterviews ? "bg-white/10" : `bg-gradient-to-br ${brand.blueGrad}`}`}
          >
            {showInterviews ? "Hide Offers" : "View Offers"}
          </button>
        </Panel>
      </div>

      {/* Gigs Panel */}
      {showGigs && (
        <Panel className="mb-4">
          <div className="font-semibold mb-3 flex items-center justify-between">
            <span>🎸 Available Gigs</span>
            <span className={`${brand.dim} text-sm`}>
              {state.events.scheduled.filter((e) => e.type === "gig").length}/5
              booked
            </span>
          </div>
          {state.events.offers.gigs.length === 0 ? (
            <div className={`${brand.dim} text-center py-4`}>
              No gig offers available this week.
            </div>
          ) : (
            <div className="space-y-3">
              {state.events.offers.gigs.map((offer, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {getEventIcon(offer.subType)}
                    </span>
                    <div>
                      <div className="font-semibold">
                        {getEventName(offer.subType)} Gig
                      </div>
                      <div className={`${brand.dim} text-sm`}>
                        Week {offer.week} • Energy: {offer.energyCost} • Pop:{" "}
                        {offer.popDelta > 0 ? "+" : ""}
                        {offer.popDelta} • Rep: {offer.repDelta > 0 ? "+" : ""}
                        {offer.repDelta}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-green-400">
                      {fmtMoney(offer.money)}
                    </div>
                    <button
                      onClick={() => handleBookEvent(offer)}
                      className="rounded-lg px-3 py-1 bg-green-600/80 text-white text-sm font-medium"
                    >
                      Book
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* Interviews Panel */}
      {showInterviews && (
        <Panel className="mb-4">
          <div className="font-semibold mb-3 flex items-center justify-between">
            <span>🎤 Available Interviews</span>
            <span className={`${brand.dim} text-sm`}>
              {
                state.events.scheduled.filter((e) => e.type === "interview")
                  .length
              }
              /3 booked
            </span>
          </div>
          {state.events.offers.interviews.length === 0 ? (
            <div className={`${brand.dim} text-center py-4`}>
              No interview offers available this week.
            </div>
          ) : (
            <div className="space-y-3">
              {state.events.offers.interviews.map((offer, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-white/5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {getEventIcon(offer.subType)}
                    </span>
                    <div>
                      <div className="font-semibold">
                        {getEventName(offer.subType)} Interview
                      </div>
                      <div className={`${brand.dim} text-sm`}>
                        Week {offer.week} • Energy: {offer.energyCost} • Pop:{" "}
                        {offer.popDelta > 0 ? "+" : ""}
                        {offer.popDelta} • Rep: {offer.repDelta > 0 ? "+" : ""}
                        {offer.repDelta}
                        {offer.subType === "tv" && (
                          <span className="text-yellow-400 ml-2">★ Rare</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-green-400">
                      {fmtMoney(offer.money)}
                    </div>
                    <button
                      onClick={() => handleBookEvent(offer)}
                      className="rounded-lg px-3 py-1 bg-green-600/80 text-white text-sm font-medium"
                    >
                      Book
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

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
              <div className="font-semibold">
                Social & Promotion (coming soon)
              </div>
              <div className={`${brand.dim}`}>
                Schedule posts, collabs, and press to boost discovery.
              </div>
            </div>
          )}
          {tab === "Charts" &&
            (hasRelease ? (
              <ChartsInner state={state} />
            ) : (
              <div className="grid gap-2">
                <div className="text-lg font-semibold">Charts Locked</div>
                <div className={`${brand.dim}`}>
                  Release at least one single or project to unlock Charts.
                </div>
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

  if (ranked.length === 0)
    return <div className={`${brand.dim}`}>No chart entries yet.</div>;

  return (
    <div className="grid gap-2">
      {ranked.map((r, i) => (
        <Panel key={r.id} className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 text-center text-lg font-extrabold">
              {i + 1}
            </div>
            <div>
              <div className="font-semibold">
                {r.title}
                {r.type && (
                  <span className="ml-2 text-xs rounded border border-white/15 px-2 py-0.5">
                    {r.type}
                  </span>
                )}
              </div>
              <div className={`${brand.dim} text-sm`}>
                Wks {r.weeksOn} • Peak {r.peakPos ?? "—"} • LW{" "}
                {r.lastWeekPos ?? "—"}
              </div>
            </div>
          </div>
          <div className={`${brand.dim}`}>
            {r.weekStreams.toLocaleString()} streams
          </div>
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
          <div className={`${brand.dim}`}>
            Upskill to improve song quality, promo impact, and earnings.
          </div>
        </Panel>
        <Panel>
          <div className="font-semibold mb-1">Jobs & Gigs (coming soon)</div>
          <div className={`${brand.dim}`}>
            Take gigs to earn cash, gain rep, or recover inspiration.
          </div>
        </Panel>
        <Panel>
          <div className="font-semibold mb-1">Shop (coming soon)</div>
          <div className={`${brand.dim}`}>
            Buy gear and items that affect stats and production.
          </div>
        </Panel>
        <Panel>
          <div className="font-semibold mb-1">Finance (coming soon)</div>
          <div className={`${brand.dim}`}>
            Track income and expenses from releases and activities.
          </div>
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
          <button
            onClick={() => dispatch({ type: "MARK_ALERTS_READ" })}
            className="rounded-xl px-3 py-2 bg-black/20 border border-white/10"
          >
            Mark all read
          </button>
        }
      />
      <div className="grid gap-2">
        {state.alerts.length === 0 && (
          <Panel className={`${brand.dim}`}>No notifications yet.</Panel>
        )}
        {state.alerts.map((a) => (
          <Panel
            key={a.id}
            className={
              a.kind === "success"
                ? "border-green-500/30 ring-green-500/20"
                : ""
            }
          >
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
            if (confirm("Delete save and restart?"))
              dispatch({ type: "DELETE_SAVE" });
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
  { key: "Settings", label: "Settings", icon: "⚙️" },
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
          {tab === "Media" && <Media state={state} dispatch={dispatch} />}
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
