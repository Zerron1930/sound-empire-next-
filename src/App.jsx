import React, { useEffect, useReducer, useState } from "react";
import { Page, HeaderBar, Section, Card, TimeDisplay, SaveButton, SettingsButton, BottomAction, brand, swiftlyStyles } from "./ui/Layout.jsx";
import BottomNav from "./ui/BottomNav.jsx";

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

// --------- constants (easy to tweak) - MOVED TO TOP TO FIX REFERENCE ERRORS
const PAYOUT_PER_STREAM = 0.0035;
const BASE_DISCOVERY = 500;
const POP_WEIGHT = 60;
const REP_WEIGHT = 40;
const ENERGY_MAX = 100;
const INSPIRATION_MAX = 100;
const WRITE_COST_ENERGY = 10;
const WRITE_COST_INSPIRATION = 15;

// Game balance constants
const VIRAL_CHANCE = 0.05; // 5% chance for interviews to go viral
const VIRAL_POP_BONUS_MIN = 1; // Minimum viral popularity bonus
const VIRAL_POP_BONUS_MAX = 3; // Maximum viral popularity bonus
const TV_AVAILABILITY_THRESHOLD = 65; // Popularity needed for TV interviews
const TV_LUCKY_CHANCE = 0.02; // 2% lucky chance for TV interviews
const STREAM_DISCOVERY_RANDOM_MAX = 800; // Maximum random discovery bonus
const STREAM_DECAY_MIN = 0.5; // Minimum stream decay
const STREAM_DECAY_PER_WEEK = 0.08; // Stream decay per week
const RELEASE_BUMP_POP_MULTIPLIER = 10; // Popularity multiplier for release bump
const RELEASE_BUMP_REP_MULTIPLIER = 6; // Reputation multiplier for release bump
const ALBUM_RELEASE_BUMP_MULTIPLIER = 1.2; // Album release bump multiplier
const EP_RELEASE_BUMP_MULTIPLIER = 0.8; // EP release bump multiplier
const REPUTATION_DRIFT = 0.2; // Weekly reputation drift
const POP_FROM_STREAMS_DIVISOR = 200000; // Divisor for popularity from streams

// Venue weights and payout constants
const VENUE_WEIGHT_CLUB_BASE = 0.70;
const VENUE_WEIGHT_CLUB_FACTOR = 0.40;
const VENUE_WEIGHT_THEATER_BASE = 0.25;
const VENUE_WEIGHT_THEATER_FACTOR = 0.20;
const VENUE_WEIGHT_ARENA_BASE = -0.03;
const VENUE_WEIGHT_ARENA_FACTOR = 0.18;
const VENUE_WEIGHT_FESTIVAL_BASE = -0.07;
const VENUE_WEIGHT_FESTIVAL_FACTOR = 0.15;

// Sellout and bonus constants
const SELLOUT_CHANCE_BASE = -0.15;
const SELLOUT_CHANCE_FACTOR = 1.0;
const SELLOUT_BONUS_BASE = 0.15;
const SELLOUT_BONUS_FACTOR = 0.25;
const REPUTATION_BOOST_THRESHOLD = 50;
const REPUTATION_BOOST_DIVISOR = 400;

// Weekly offer constants
const WEEKLY_OFFER_MIN_WEEKS = 1;
const WEEKLY_OFFER_MAX_WEEKS = 10;
const DEFAULT_REPUTATION_FOR_OFFERS = 50;

// Project size constants
const EP_MIN_TRACKS = 3;
const EP_MAX_TRACKS = 7;
const ALBUM_MIN_TRACKS = 8;
const ALBUM_MAX_TRACKS = 14;

// Venue and event constants
const VENUE_ENERGY_COSTS = { club: 12, theater: 18, festival: 22, arena: 28 };
const VENUE_CAPACITIES = { club: 600, theater: 1800, arena: 12000, festival: 30000 };
const VENUE_BASE_PAYOUTS = { club: 1500, theater: 8000, arena: 60000, festival: 90000 };
const INTERVIEW_WEIGHTS = { radio: 40, podcast: 35, tv: 25 };
const INTERVIEW_MONEY_RANGES = { radio: { min: 100, max: 400 }, podcast: { min: 150, max: 400 } };

// Quality and bonus constants
const BASE_QUALITY = 50;
const ENERGY_QUALITY_BONUS_MAX = 20;
const INSPIRATION_QUALITY_BONUS_MAX = 15;
const RANDOM_QUALITY_BONUS_MAX = 15;
const MIN_QUALITY = 30;
const MAX_QUALITY = 100;
const QUALITY_MULTIPLIER = 20;

// Time and year constants
const WEEKS_PER_YEAR = 52;
const DEFAULT_YEAR = 2025;
const DEFAULT_STARTING_MONEY = 1000;
const DEFAULT_STARTING_REPUTATION = 50;
const DEFAULT_STARTING_INSPIRATION = 100;

// Sales system constants
const TRACK_STREAMS_PER_SALE = 150;   // 150 streams = 1 song sale
const ALBUM_STREAMS_PER_UNIT = 1500;  // 1500 streams (SEA) = 1 album unit
const CERT_THRESHOLDS = { gold: 500_000, platinum: 1_000_000, diamond: 10_000_000 };

// Payout and discovery constants
const PAYOUT_BASE_AMOUNT = 200;
const PAYOUT_PER_POP_POINT = 12;
const DISCOVERY_POP_REP_MULTIPLIER = 4;
const QUALITY_DISCOVERY_MULTIPLIER = 20;

// Popularity normalization constant
const POPULARITY_MAX = 100;

// Weekly offer generation constants
const GIG_OFFER_COUNT_BASE = 6;
const GIG_OFFER_COUNT_RANDOM = 3;
const INTERVIEW_OFFER_COUNT_BASE = 5;
const INTERVIEW_OFFER_COUNT_RANDOM = 3;

// Project rules
const PROJECT_RULES = {
  EP: { min: EP_MIN_TRACKS, max: EP_MAX_TRACKS },
  Album: { min: ALBUM_MIN_TRACKS, max: ALBUM_MAX_TRACKS },
};

// --------- helpers
const fmtMoney = (n) =>
  n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

// Swiftly asset loader
async function ensureSwiftlyAssetsLoaded(state) {
  if (!state.social) state.social = { accounts: [], posts: [], feed: [] };

  // Helper function to convert file to data URL
  async function seToDataURL(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      return await new Promise(r => { 
        const fr = new FileReader(); 
        fr.onload = () => r(fr.result); 
        fr.readAsDataURL(blob); 
      });
    } catch (error) { 
      return null; 
    }
  }

  // Try multiple names because originals had spaces
  const tryPaths = async (arr) => { 
    for (const p of arr) { 
      const d = await seToDataURL(p); 
      if (d) return d; 
    } 
    return null; 
  };

  const newState = { ...state };

  // Placeholder first (used for player if no upload & general fallback)
  if (!newState.social.placeholderDataURL) {
    console.log('Loading placeholder image...');
    newState.social.placeholderDataURL = await tryPaths([
      '/assets/swiftly/placeholder.png',
      'assets/swiftly/placeholder.png'
    ]);
    console.log('Placeholder result:', newState.social.placeholderDataURL ? 'loaded' : 'failed');
  }

  // Map accounts
  const gx = newState.social.accounts?.find(a => a.kind === 'gx') || null;
  const sf = newState.social.accounts?.find(a => a.kind === 'stats') || null;

  if (gx && !gx.avatarDataURL) {
    const d = await tryPaths([
      '/assets/swiftly/gossipxtra.png',
      'assets/swiftly/gossipxtra.png'
    ]);
    if (d) { 
      // Find and update the account in the accounts array
      const accountIndex = newState.social.accounts.findIndex(a => a.id === gx.id);
      if (accountIndex !== -1) {
        newState.social.accounts[accountIndex] = {
          ...newState.social.accounts[accountIndex],
          avatarType: 'image',
          avatarDataURL: d
        };
      }
    }
  }
  if (sf && !sf.avatarDataURL) {
    const d = await tryPaths([
      '/assets/swiftly/statsfinder.png',
      'assets/swiftly/statsfinder.png'
    ]);
    if (d) { 
      // Find and update the account in the accounts array
      const accountIndex = newState.social.accounts.findIndex(a => a.id === sf.id);
      if (accountIndex !== -1) {
        newState.social.accounts[accountIndex] = {
          ...newState.social.accounts[accountIndex],
          avatarType: 'image',
          avatarDataURL: d
        };
      }
    }
  }

  // App icon path (don't store as data URL to keep saves small)
  newState.social.swiftlyIconPath = (await (async () => {
    const paths = [
      '/assets/swiftly/swiftly-icon.png',
      'assets/swiftly/swiftly-icon.png'
    ];
    for (const p of paths) {
      const ok = await fetch(p, { cache: 'no-store' }).then(r => r.ok).catch(() => false);
      if (ok) return p;
    }
    return null;
  })()) || newState.social.swiftlyIconPath || null;

  // Check the final state of the accounts
  const finalGx = newState.social.accounts?.find(a => a.kind === 'gx');
  const finalSf = newState.social.accounts?.find(a => a.kind === 'stats');
  
  console.log('Swiftly assets loaded:', {
    placeholder: !!newState.social.placeholderDataURL,
    gx: finalGx?.avatarDataURL ? 'loaded' : 'fallback',
    sf: finalSf?.avatarDataURL ? 'loaded' : 'fallback',
    icon: newState.social.swiftlyIconPath
  });

  return newState;
}

// Prune old Swiftly posts (older than 2 weeks)
function pruneOldSwiftlyPosts(state) {
  try {
    if (!state || !state.social || !state.time) return state;
    
    const currentWeek = state.time.week;
    if (!currentWeek || typeof currentWeek !== 'number') return state;
    
    const newState = { ...state };
    
    // Ensure social structure exists
    if (!newState.social) {
      newState.social = { posts: [], feed: [] };
    }
    
    // Prune old posts (keep pinned posts)
    if (newState.social.posts && Array.isArray(newState.social.posts)) {
      newState.social.posts = newState.social.posts.filter(post => {
        if (!post || typeof post !== 'object') return false; // Remove invalid posts
        if (post.pinned) return true; // Keep pinned posts
        
        const postAge = currentWeek - (post.createdWeek || post.week || 1);
        
        // Player posts expire after 52 weeks (1 year)
        if (post.authorId === 'player') {
          return postAge < 52;
        }
        
        // NPC and official posts expire after 2 weeks
        return postAge < 2;
      });
    }
    
    // Prune old feed posts (keep pinned posts)
    if (newState.social.feed && Array.isArray(newState.social.feed)) {
      newState.social.feed = newState.social.feed.filter(post => {
        if (!post || typeof post !== 'object') return false; // Remove invalid posts
        if (post.pinned) return true; // Keep pinned posts
        
        const postAge = currentWeek - (post.createdWeek || post.week || 1);
        
        // Player posts expire after 52 weeks (1 year)
        if (post.authorId === 'player') {
          return postAge < 52;
        }
        
        // NPC and official posts expire after 2 weeks
        return postAge < 2;
      });
    }
    
    return newState;
  } catch (error) {
    console.error('Error in pruneOldSwiftlyPosts:', error);
    return state; // Return original state if pruning fails
  }
}

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const uid = () =>
  crypto?.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

// Safe number utility for totals
const safeNum = (x) => Number.isFinite(x) ? x : 0;

// Save export utilities
function download(json, filename) {
  const blob = new Blob([json], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function handleSave(state) {
  const json = JSON.stringify(state, null, 2);
  try { 
    await navigator.clipboard.writeText(json); 
  } catch {}
  const date = new Date().toISOString().slice(0,10);
  download(json, `sound-empire-save-${date}.json`);
  // Show success alert
  return { kind: "success", msg: "Save exported + copied" };
}

// Event system helpers
const rng = () => Math.random(); // Can be replaced with seeded randomness later
const weightedPick = (weights) => {
  const total = weights.reduce((a,b)=>a+b, 0) || 1;
  let x = rng() * total;
  for (let i=0;i<weights.length;i++){ x -= weights[i]; if (x<=0) return weights[i][0]; }
  return weights[weights.length-1][0];
};

const nextWeeks = (currentWeek, minAhead, maxAhead) => {
  let target =
    currentWeek + minAhead + Math.floor(rng() * (maxAhead - minAhead + 1));
  if (target > WEEKS_PER_YEAR) target = target - WEEKS_PER_YEAR;
  return target;
};

const payoutBase = (pop, scale) => Math.round((PAYOUT_BASE_AMOUNT + pop * PAYOUT_PER_POP_POINT) * scale);

// Certification helper
function certForUnits(units) {
  if (units >= CERT_THRESHOLDS.diamond) return { label: "Diamond", times: Math.floor(units / CERT_THRESHOLDS.diamond) || 1 };
  if (units >= CERT_THRESHOLDS.platinum)  return { label: "Platinum", times: Math.floor(units / CERT_THRESHOLDS.platinum) };
  if (units >= CERT_THRESHOLDS.gold)   return { label: "Gold", times: 1 };
  return null;
}

// Stats helpers
const lifetimeStreams = (song) => song.streamsHistory?.reduce((sum, streams) => sum + streams, 0) || 0;
const firstWeekStreams = (song) => song.streamsHistory?.[0] ?? 0;
const songUnits = (song) => Math.floor(lifetimeStreams(song) / TRACK_STREAMS_PER_SALE); // 150 streams ≈ 1 unit
const projectUnits = (project, allSongs) => {
  const totalStreams = project.trackIds?.reduce((sum, trackId) => {
    const song = allSongs.find(s => s.id === trackId);
    return sum + lifetimeStreams(song);
  }, 0) || 0;
  return Math.floor(totalStreams / ALBUM_STREAMS_PER_UNIT); // 1500 streams = 1 album unit
};

// Industry-style payouts & effects utilities
// 0–100 popularity → 0.0–1.0
const popNorm = (pop) => Math.max(0, Math.min(1, pop / POPULARITY_MAX));

// Typical venue/rate assumptions (very rough but industry-flavored)
const VENUES = [
  { key: "club",     cap: VENUE_CAPACITIES.club,     base: VENUE_BASE_PAYOUTS.club },
  { key: "theater",  cap: VENUE_CAPACITIES.theater,  base: VENUE_BASE_PAYOUTS.theater },
  { key: "arena",    cap: VENUE_CAPACITIES.arena,    base: VENUE_BASE_PAYOUTS.arena },
  { key: "festival", cap: VENUE_CAPACITIES.festival, base: VENUE_BASE_PAYOUTS.festival },
];

// Probability weights by popularity (festival/arena rarer until you're big)
function venueWeightsByPop(pop) {
  const p = popNorm(pop);
  // start club-heavy, gradually unlock theater, then arena/festival
  return [
    VENUE_WEIGHT_CLUB_BASE - VENUE_WEIGHT_CLUB_FACTOR*p,          // club
    VENUE_WEIGHT_THEATER_BASE + VENUE_WEIGHT_THEATER_FACTOR*p,          // theater
    Math.max(0, VENUE_WEIGHT_ARENA_BASE + VENUE_WEIGHT_ARENA_FACTOR*p), // arena (rare < ~60% pop)
    Math.max(0, VENUE_WEIGHT_FESTIVAL_BASE + VENUE_WEIGHT_FESTIVAL_FACTOR*p)  // festival (rare < ~65% pop)
  ];
}

function pickWeighted(items, weights, rnd=Math.random()) {
  const total = weights.reduce((a,b)=>a+b, 0) || 1;
  let x = rnd * total;
  for (let i=0;i<items.length;i++){ x -= weights[i]; if (x<=0) return items[i]; }
  return items[items.length-1];
}

// Payout guarantee + soft "demand" bonus with chance to sell out
function computeGigPayout(venue, stats) {
  const p = popNorm(stats.popularity);
  const demand = 0.5 + 0.9*p;                   // 0.5–1.4 multiplier
  const guarantee = venue.base * demand;

  const sellOutChance = Math.max(0, SELLOUT_CHANCE_BASE + SELLOUT_CHANCE_FACTOR*p); // ~0–85%
  const soldOut = Math.random() < sellOutChance;
  const bonus = soldOut ? venue.base * (SELLOUT_BONUS_BASE + SELLOUT_BONUS_FACTOR*p) : 0;

  // Reputation sweetens the deal a bit
  const repBoost = 1 + (Math.max(0, stats.reputation-REPUTATION_BOOST_THRESHOLD) / REPUTATION_BOOST_DIVISOR); // up to +12.5%
  const pay = Math.round((guarantee + bonus) * repBoost);

  return { pay, soldOut };
}

// Generate weekly offers for gigs and interviews
const generateWeeklyOffers = (currentWeek, currentPop) => {
  const offers = { gigs: [], interviews: [] };

  // Generate 6-8 gig offers
  const gigCount = GIG_OFFER_COUNT_BASE + Math.floor(rng() * GIG_OFFER_COUNT_RANDOM);
  for (let i = 0; i < gigCount; i++) {
    // Use venue weights based on popularity
    const venueWeights = venueWeightsByPop(currentPop);
    const venue = pickWeighted(VENUES, venueWeights);
    
    // Map venue key to subType for compatibility
    const subType = venue.key;
    
    const config = {
      club: { energy: VENUE_ENERGY_COSTS.club, popRange: [1, 2], repRange: [0, 1] },
      theater: { energy: VENUE_ENERGY_COSTS.theater, popRange: [2, 3], repRange: [0, 1] },
      festival: { energy: VENUE_ENERGY_COSTS.festival, popRange: [3, 4], repRange: [-1, 1] },
      arena: { energy: VENUE_ENERGY_COSTS.arena, popRange: [4, 5], repRange: [0, 2] },
    }[subType];

    const week = nextWeeks(currentWeek, WEEKLY_OFFER_MIN_WEEKS, WEEKLY_OFFER_MAX_WEEKS); // Spread across future weeks
    const payout = computeGigPayout(venue, { popularity: currentPop, reputation: DEFAULT_REPUTATION_FOR_OFFERS });
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
      money: payout.pay,
      popDelta,
      repDelta,
      soldOut: payout.soldOut,
    });
  }

  // Generate 5-7 interview offers
  const interviewCount = INTERVIEW_OFFER_COUNT_BASE + Math.floor(rng() * INTERVIEW_OFFER_COUNT_RANDOM);
  for (let i = 0; i < interviewCount; i++) {
    const subType = weightedPick([
      ["radio", INTERVIEW_WEIGHTS.radio],
      ["podcast", INTERVIEW_WEIGHTS.podcast],
      ["tv", INTERVIEW_WEIGHTS.tv],
    ]);

    // TV only available if popularity >= 65% or 2% lucky chance
    if (subType === "tv" && currentPop < TV_AVAILABILITY_THRESHOLD && rng() > TV_LUCKY_CHANCE) {
      continue; // Skip this iteration
    }

    const config = {
      radio: { energy: 0, scale: 0.6, popDelta: 1, repDelta: 0, money: INTERVIEW_MONEY_RANGES.radio.min + Math.floor(rng() * (INTERVIEW_MONEY_RANGES.radio.max - INTERVIEW_MONEY_RANGES.radio.min)) },
      podcast: {
        energy: 0,
        scale: 0.8,
        popDelta: 1 + Math.floor(rng() * 2),
        repDelta: 0,
        money: INTERVIEW_MONEY_RANGES.podcast.min + Math.floor(rng() * (INTERVIEW_MONEY_RANGES.podcast.max - INTERVIEW_MONEY_RANGES.podcast.min)),
      },
      tv: { energy: 0, scale: 1.8, popDelta: 5, repDelta: 1, money: 0 }, // No stipend for TV
    }[subType];

    const week = nextWeeks(currentWeek, WEEKLY_OFFER_MIN_WEEKS, WEEKLY_OFFER_MAX_WEEKS); // Spread across future weeks

    offers.interviews.push({
      type: "interview",
      subType,
      week,
      energyCost: config.energy,
      money: config.money,
      popDelta: config.popDelta,
      repDelta: config.repDelta,
    });
  }

  return offers;
};

// compute current age from starting age + elapsed years
const currentAge = (profile, time) => {
  const baseAge = Number(profile.age) || 0;
  const delta = Math.max(0, time.year - startYear);
  return baseAge + delta;
};

// Generate deterministic gradient from seed
const gradientFromSeed = (seed = 1) => {
  // simple deterministic gradient
  const a = (seed * 9301 + 49297) % 233280;
  const b = (seed * 233280 + 12345) % 65535;
  const h1 = a % 360, h2 = b % 360;
  return `conic-gradient(from 210deg, hsl(${h1} 70% 50%), hsl(${h2} 70% 50%))`;
};

// Generate contextually relevant NPC comments based on post content
const generateContextualComments = (postText, npcAccounts, week, commentCount = 3) => {
  try {
    // Validate inputs
    if (!postText || !npcAccounts || !Array.isArray(npcAccounts) || npcAccounts.length === 0) {
      return [];
    }
    
    const comments = [];
    
    // Analyze post content for themes and keywords
    const text = postText.toLowerCase();
    let commentTemplates = [];
    
    // Add week-based variation to make comments change each week
    const weekModifier = week % 4; // 4-week cycle for variety
    const isEvenWeek = week % 2 === 0;
    
    // Charts and releases theme
    if (text.includes('chart') || text.includes('release') || text.includes('heating up') || text.includes('new releases')) {
      commentTemplates = [
        "The charts are absolutely insane this week! 📈",
        "New releases everywhere! This is going to be huge! 🚀",
        "Can't wait to see the chart positions! 🎯",
        "The industry is buzzing with new music! ✨",
        "This week's releases are fire! 🔥",
        "Charts are going to be wild! 🎵",
        "So many new releases to check out! 🎧",
        "The competition is heating up! 💪",
        "Chart positions are going to be crazy! 📊",
        "New music dropping everywhere! 🎉",
        // Week-specific variations
        `Week ${week} is absolutely stacked with new music! 🎵`,
        `The charts in week ${week} are going to be legendary! 👑`,
        `This week's releases are absolutely insane! 🔥`,
        `Week ${week} is the week of new music! 🚀`
      ];
    }
    // Music scene and industry theme
    else if (text.includes('music scene') || text.includes('industry') || text.includes('artists') || text.includes('talent') || text.includes('waves')) {
      commentTemplates = [
        "The music scene is absolutely electric right now! ⚡",
        "So much talent emerging everywhere! 🌟",
        "Industry insiders are going crazy! 🎭",
        "This is what we live for! 🎶",
        "The scene is on fire! 🔥",
        "New artists are killing it! 💯",
        "Industry is buzzing with excitement! ✨",
        "Talent everywhere you look! 👀",
        "The scene is absolutely buzzing! 🐝",
        "New artists making waves everywhere! 🌊",
        // Week-specific variations
        `Week ${week} is bringing the heat to the music scene! 🔥`,
        `The industry is absolutely buzzing in week ${week}! 🐝`,
        `This week's talent discovery is incredible! 🌟`,
        `Week ${week} is showing us the future of music! 🚀`
      ];
    }
    // Critics and reviews theme
    else if (text.includes('critic') || text.includes('raving') || text.includes('review') || text.includes('drops')) {
      commentTemplates = [
        "Critics are going wild! 📰",
        "The reviews are incredible! ⭐",
        "Everyone's talking about this! 💬",
        "Critics can't stop raving! 🎭",
        "The buzz is real! 🐝",
        "Reviews are through the roof! 📈",
        "Critics are loving this! ❤️",
        "The hype is justified! 🎯",
        "Critics can't get enough! 📝",
        "The reviews are absolutely glowing! ✨",
        // Week-specific variations
        `Week ${week} reviews are absolutely glowing! ⭐`,
        `Critics can't stop talking about week ${week}! 📰`,
        `The buzz this week is absolutely insane! 🐝`,
        `Week ${week} is getting rave reviews everywhere! 🎭`
      ];
    }
    // Stats and data theme
    else if (text.includes('stats') || text.includes('data') || text.includes('streams') || text.includes('sales') || text.includes('update')) {
      commentTemplates = [
        "The numbers don't lie! 📊",
        "Stats are looking incredible! 📈",
        "Data shows the growth! 🚀",
        "Streams are through the roof! 🎵",
        "Sales are absolutely insane! 💰",
        "The metrics are fire! 🔥",
        "Numbers are speaking for themselves! 📊",
        "Data is telling the story! 📖",
        "Stats are absolutely mind-blowing! 🤯",
        "The data is incredible this week! 📈",
        // Week-specific variations
        `Week ${week} stats are absolutely mind-blowing! 🤯`,
        `The numbers this week are incredible! 📊`,
        `Week ${week} data is showing massive growth! 📈`,
        `This week's metrics are absolutely fire! 🔥`
      ];
    }
    // Fresh/new talent theme
    else if (text.includes('fresh') || text.includes('new') || text.includes('emerging') || text.includes('discovered')) {
      commentTemplates = [
        "Fresh talent everywhere! 🌱",
        "New artists are absolutely killing it! 💯",
        "The discovery is real! 🔍",
        "Fresh faces in the industry! 👥",
        "New talent is emerging everywhere! 🌟",
        "The discovery game is strong! 🎯",
        "Fresh blood in the scene! 🩸",
        "New artists are taking over! 👑",
        "The discovery is incredible! ✨",
        "Fresh talent is the future! 🚀",
        // Week-specific variations
        `Week ${week} is bringing fresh talent everywhere! 🌱`,
        `New artists discovered this week are incredible! 🌟`,
        `Week ${week} is the week of fresh faces! 👥`,
        `This week's talent discovery is absolutely legendary! 👑`
      ];
    }
    // General music excitement (fallback)
    else {
      commentTemplates = [
        "This is so exciting! 🎉",
        "Love the energy here! ✨",
        "This is going to be huge! 🚀",
        "Can't wait to see what happens! 👀",
        "The vibes are incredible! 🎵",
        "This is what music is about! 🎶",
        "Love this energy! 💯",
        "This is going to be amazing! 🌟",
        "The energy is absolutely electric! ⚡",
        "This is going to be legendary! 👑",
        // Week-specific variations
        `Week ${week} is absolutely electric! ⚡`,
        `The energy this week is incredible! ✨`,
        `Week ${week} is going to be legendary! 👑`,
        `This week's vibes are absolutely insane! 🎵`
      ];
    }
    
    // Shuffle NPCs to ensure different NPCs comment each week
    const shuffledNpcs = [...npcAccounts].sort(() => Math.random() - 0.5);
    
    // Generate comments from relevant templates with week-based selection
    for (let i = 0; i < commentCount && i < shuffledNpcs.length; i++) {
      const npc = shuffledNpcs[i];
      if (npc && !comments.some(c => c.userId === npc.id)) {
        // Use week-based selection to ensure variety
        const templateIndex = (week + i) % commentTemplates.length;
        const commentText = commentTemplates[templateIndex];
        
        comments.push({
          id: uid(),
          userId: npc.id,
          text: commentText,
          week: week
        });
      }
    }
    
    return comments;
  } catch (error) {
    console.warn('Error generating contextual comments:', error);
    return [];
  }
};

// ----- navigation items
const NAV = [
  { key: "Home", label: "Home", icon: "🏠" },
  { key: "Studio", label: "Studio", icon: "🎵" },
  { key: "Media", label: "Media", icon: "📱" },
  { key: "Activities", label: "Activities", icon: "🎯" },
];

// --------- state
const initialState = {
  profile: null, // {firstName, lastName, artistName, age, year, gender, difficulty}
  time: { week: 1, year: DEFAULT_YEAR },
  stats: {
    popularity: 1,
    inspiration: DEFAULT_STARTING_INSPIRATION,
    reputation: DEFAULT_STARTING_REPUTATION,
    energy: ENERGY_MAX,
    money: DEFAULT_STARTING_MONEY,
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
  projectsDraft: [], // Array<{ id, title, type: "EP"|"Album", trackIds: string[], weekReleased: null|number, yearReleased: null|number }>
  projectsReleased: [], // Array<{ id, title, type: "EP"|"Album", trackIds: string[], weekReleased: number, yearReleased: number }>
  alerts: [],
  weekSnaps: [], // Array<string> for weekly recap - each week overwrites the previous
  // Swiftly social app data
  social: {
    followers: 0,
    accounts: [], // [{id, handle, displayName, kind: 'player'|'gx'|'stats'|'npc', avatarType:'image'|'gradient', avatarDataURL?, seed?}]
    posts: [], // [{id, authorId, text, imageDataURL?, week, likes: number, likedBy: string[], comments: [{id, userId, text, week}], visibility:'public'}]
    feed: [] // same shape as posts but used for algorithmic/industry posts
  },
  player: { profilePhotoDataURL: null }, // set at New Game or via Settings/Profile
  apps: { 
    wavefy: { followers: 0 }, 
    viewtube: { subs: 0 },
    swiftly: { followers: 0 }
  },
  // simple engagement anti-spam (per week limits)
  limits: { likesThisWeek: {}, commentsThisWeek: {} } // {postId: count}
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

      // Migration: ensure project arrays exist
      if (!payload.projectsDraft) payload.projectsDraft = [];
      if (!payload.projectsReleased) payload.projectsReleased = [];

      // Migration: ensure songs have projectIds and sales fields
      if (payload.releases) {
        payload.releases = payload.releases.map(song => ({
          ...song,
          projectIds: song.projectIds || [],
          salesHistory: song.salesHistory || [],
          salesFirstWeek: song.salesFirstWeek || null,
          salesLifetime: song.salesLifetime || 0,
          inProjects: song.inProjects || { epIds: [], albumIds: [] }
        }));
      }

      // Migration: ensure projects have sales fields
      if (payload.projects) {
        payload.projects = payload.projects.map(project => ({
          ...project,
          salesHistory: project.salesHistory || [],
          salesFirstWeek: project.salesFirstWeek || null,
          salesLifetime: project.salesLifetime || 0
        }));
      }

      // Migration: ensure projectsReleased have sales fields
      if (payload.projectsReleased) {
        payload.projectsReleased = payload.projectsReleased.map(project => ({
          ...project,
          salesHistory: project.salesHistory || [],
          salesFirstWeek: project.salesFirstWeek || null,
          salesLifetime: project.salesLifetime || 0
        }));
      }

      // Migration: initialize inProjects by scanning released projects
      if (payload.releases && payload.projectsReleased) {
        payload.releases = payload.releases.map(release => {
          if (!release.inProjects) release.inProjects = { epIds: [], albumIds: [] };
          
          // Scan projects to see where this track was used
          payload.projectsReleased.forEach(project => {
            if (project.trackIds && project.trackIds.includes(release.id)) {
              if (project.type === "EP") {
                if (!release.inProjects.epIds.includes(project.id)) {
                  release.inProjects.epIds.push(project.id);
                }
              } else if (project.type === "Album") {
                if (!release.inProjects.albumIds.includes(project.id)) {
                  release.inProjects.albumIds.push(project.id);
                }
              }
            }
          });
          
          return release;
        });
      }

      // Migration: ensure Swiftly social data exists
      if (!payload.social) {
        payload.social = {
          followers: 0,
          accounts: [],
          posts: [],
          feed: []
        };
      }

      // Migration: backfill createdWeek for existing posts
      if (payload.social && payload.social.posts) {
        payload.social.posts = payload.social.posts.map(post => ({
          ...post,
          createdWeek: post.createdWeek || post.week || payload.time?.week || 1,
          views: post.views || Math.floor((post.likes || 0) * (Math.random() * 3 + 2)) // Estimate views based on likes
        }));
      }
      if (payload.social && payload.social.feed) {
        payload.social.feed = payload.social.feed.map(post => ({
          ...post,
          createdWeek: post.createdWeek || post.week || payload.time?.week || 1,
          views: post.views || Math.floor((post.likes || 0) * (Math.random() * 3 + 2)) // Estimate views based on likes
        }));
      }

      // Migration: ensure player profile photo data exists
      if (!payload.player) {
        payload.player = { profilePhotoDataURL: null };
      }

      // Migration: ensure apps data exists
      if (!payload.apps) {
        payload.apps = { 
          wavefy: { followers: payload?.platforms?.wavefy?.followers || 0 }, 
          viewtube: { subs: payload?.platforms?.viewtube?.subs || 0 },
          swiftly: { followers: 0 }
        };
      }

      // Migration: ensure limits data exists
      if (!payload.limits) {
        payload.limits = { likesThisWeek: {}, commentsThisWeek: {} };
      }

      // Seed official accounts on migration (if not present)
      if (payload.social && payload.social.accounts.length === 0) {
        const stageNameNoSpaces = (payload.profile?.artistName || "Artist").replace(/\s+/g, "");
        
        payload.social.accounts = [
          // GossipXtra (kind='gx'), handle @GossipXtra
          {
            id: "gossipxtra",
            handle: "GossipXtra",
            displayName: "GossipXtra",
            kind: "gx",
            avatarType: "image",
            avatarDataURL: null, // will be filled by asset loader
            seed: "gossipxtra",
            verified: true // Always verified
          },
          // Stats Finder (kind='stats'), handle @StatsFinder
          {
            id: "statsfinder",
            handle: "StatsFinder",
            displayName: "Stats Finder",
            kind: "stats",
            avatarType: "image",
            avatarDataURL: null, // will be filled by asset loader
            seed: "statsfinder",
            verified: true // Always verified
          },
          // Player account (kind='player'), handle @<stageNameNoSpaces>
          {
            id: "player",
            handle: stageNameNoSpaces,
            displayName: payload.profile?.artistName || "Artist",
            kind: "player",
            avatarType: "gradient",
            seed: "player",
            verified: false // Will be updated based on follower count
          },
          // Industry News (kind='industry'), handle @IndustryNews
          {
            id: "industry",
            handle: "IndustryNews",
            displayName: "Industry News",
            kind: "industry",
            avatarType: "gradient",
            seed: "industry",
            verified: true // Industry news is verified
          },
          // Trending Topics (kind='trending'), handle @TrendingTopics
          {
            id: "trending",
            handle: "TrendingTopics",
            displayName: "Trending Topics",
            kind: "trending",
            avatarType: "gradient",
            seed: "trending",
            verified: true // Trending topics is verified
          }
        ];

        // Create 8-15 NPC accounts (kind='npc'), gradient avatars, deterministic by seed
        const npcCount = 8 + Math.floor(Math.random() * 8); // 8-15 NPCs
        const npcNames = [
          "Michael Brown", "Jessica White", "Ryan Taylor", "Amanda Clark", "Kevin Martinez",
                  "Marcus Johnson", "Sarah Chen", "Alex Rodriguez", "Emma Thompson", "David Kim",
        "Lisa Park", "James Wilson", "Maria Garcia", "Chris Davis", "Anna Lee"
        ];

        for (let i = 0; i < npcCount; i++) {
          try {
            const npcSeed = `npc_${i}_${payload.profile?.artistName || "default"}`;
            const npcName = npcNames[i % npcNames.length];
            
            // Generate realistic social media handles with variety
            const nameParts = npcName.split(' ');
            const firstName = nameParts[0] || 'user';
            const lastName = nameParts[1] || 'user';
            
            // Create different handle styles for variety
            const handleStyles = [
              `@${firstName.toLowerCase()}${lastName.toLowerCase()}`,
              `@${firstName.toLowerCase()}.${lastName.toLowerCase()}`,
              `@${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
              `@${firstName.toLowerCase()}${lastName.toLowerCase()}${Math.floor(Math.random() * 999)}`,
              `@${firstName.toLowerCase()}${lastName.toLowerCase().charAt(0)}`
            ];
            
            const handle = handleStyles[Math.floor(Math.random() * handleStyles.length)];
            
            payload.social.accounts.push({
              id: `npc_${i}`,
              handle: handle,
              displayName: npcName,
              kind: "npc",
              avatarType: "gradient",
              seed: npcSeed
            });
          } catch (error) {
            console.warn(`Error creating NPC ${i}:`, error);
            // Fallback NPC creation
            payload.social.accounts.push({
              id: `npc_${i}`,
              handle: `@user${i}`,
              displayName: `User ${i}`,
              kind: "npc",
              avatarType: "gradient",
              seed: `npc_${i}_fallback`
            });
          }
        }
      }

        // Ensure new account types exist (for existing saves)
        if (payload.social && payload.social.accounts.length > 0) {
          const existingAccountIds = payload.social.accounts.map(a => a.id);
          
          // Add Industry News account if missing
          if (!existingAccountIds.includes("industry")) {
            payload.social.accounts.push({
              id: "industry",
              handle: "IndustryNews",
              displayName: "Industry News",
              kind: "industry",
              avatarType: "gradient",
              seed: "industry",
              verified: true
            });
          }
          
          // Add Trending Topics account if missing
          if (!existingAccountIds.includes("trending")) {
            payload.social.accounts.push({
              id: "trending",
              handle: "TrendingTopics",
              displayName: "Trending Topics",
              kind: "trending",
              avatarType: "gradient",
              seed: "trending",
              verified: true
            });
          }
          
          // Force update verification status for official accounts
          payload.social.accounts = payload.social.accounts.map(account => {
            if (account.kind === 'gx' || account.kind === 'stats' || account.kind === 'industry' || account.kind === 'trending') {
              return { ...account, verified: true };
            }
            return account;
          });
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
        player: {
          profilePhotoDataURL: p.profilePhotoDataURL || null
        },
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
      
      // Auto-generate quality based on current stats and future skills
      let baseQuality = BASE_QUALITY; // Base quality
      
      // Energy and inspiration influence quality
      const energyBonus = Math.floor((state.stats.energy / ENERGY_MAX) * ENERGY_QUALITY_BONUS_MAX); // 0-20 bonus
      const inspirationBonus = Math.floor((state.stats.inspiration / INSPIRATION_MAX) * INSPIRATION_QUALITY_BONUS_MAX); // 0-15 bonus
      
      // Future: Add skill bonuses here
      // const songwritingSkill = state.skills?.songwriting || 0;
      // const skillBonus = Math.floor(songwritingSkill * 0.5); // 0-25 bonus
      
      // Add some randomness for variety
      const randomBonus = Math.floor(Math.random() * RANDOM_QUALITY_BONUS_MAX); // 0-14 bonus
      
      const quality = clamp(
        baseQuality + energyBonus + inspirationBonus + randomBonus,
        MIN_QUALITY, // Minimum quality
        MAX_QUALITY  // Maximum quality
      );
      
      const draft = { id: uid(), title, quality };

      return {
        ...state,
        drafts: [draft, ...state.drafts],
        stats: { ...state.stats, inspiration: inspLeft, energy: energyLeft },
      };
    }

    case "CREATE_SONG": {
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

      const { title, quality } = action.payload;
      const draft = { id: uid(), title, quality };

      return {
        ...state,
        drafts: [draft, ...state.drafts],
        stats: { ...state.stats, inspiration: inspLeft, energy: energyLeft },
        alerts: [
          {
            id: uid(),
            kind: "success",
            msg: `Created "${title}"`,
            t: Date.now(),
          },
          ...state.alerts,
        ],
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
        kind: "song",
        tracks: [],
        salesHistory: [],
        salesFirstWeek: null,
        salesLifetime: 0,
        streamsLifetime: 0,
        inProjects: { epIds: [], albumIds: [] }
      };
      
      // Add snap for song release
      const newSnap = {
        id: uid(),
        week: state.time.week,
        kind: "release",
        msg: `Your single "${d.title}" released!`,
      };
      
      return {
        ...state,
        drafts: state.drafts.filter((x) => x.id !== id),
        releases: [rel, ...state.releases],
        weekSnaps: [newSnap.msg, ...(state.weekSnaps || [])],
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
      const { title, type, songIds } = action.payload; // type: "EP" | "Album"
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
        type, // "EP" | "Album"
        songs: chosen.map((d) => ({
          id: d.id,
          title: d.title,
          quality: d.quality,
        })),
        weekReleased: state.time.week,
        yearReleased: state.time.year,
        streamsHistory: [],
        salesHistory: [],
        salesFirstWeek: null,
        salesLifetime: 0,
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
        kind: "project",
        projectType: type,
        tracks: chosen.map((d) => ({ id: d.id, title: d.title, quality: d.quality })),
        salesHistory: [],
        salesFirstWeek: null,
        salesLifetime: 0,
        streamsLifetime: 0,
      };

      // Add snap for project release
      const newSnap = {
        id: uid(),
        week: state.time.week,
        kind: "release",
        msg: `Your ${type.toLowerCase()} "${project.title}" released!`,
      };

      return {
        ...state,
        drafts: state.drafts.filter((d) => !songIds.includes(d.id)), // remove used drafts
        projects: [project, ...state.projects],
        releases: [release, ...state.releases],
        weekSnaps: [newSnap.msg, ...(state.weekSnaps || [])],
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

    // Create a draft project (EP/Album)
    case "CREATE_DRAFT_PROJECT": {
      const { title, type } = action.payload;
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

      const draftProject = {
        id: uid(),
        title: title.trim(),
        type,
        trackIds: [],
        weekReleased: null,
        yearReleased: null,
      };

      return {
        ...state,
        projectsDraft: [draftProject, ...state.projectsDraft],
        alerts: [
          {
            id: uid(),
            kind: "success",
            msg: `Created draft ${type}: "${draftProject.title}"`,
            t: Date.now(),
          },
          ...state.alerts,
        ],
      };
    }

    // Update a draft project with selected tracks
    case "UPDATE_DRAFT_PROJECT": {
      const { projectId, trackIds } = action.payload;
      const project = state.projectsDraft.find(p => p.id === projectId);
      if (!project) return state;

      // Update track inProjects tracking
      const allTracks = [...state.releases, ...state.drafts];
      allTracks.forEach(track => {
        track.inProjects ??= { epIds: [], albumIds: [] };
        
        if (project.type === "EP") {
          // Remove from EP tracking if not selected
          track.inProjects.epIds = track.inProjects.epIds.filter(id => id !== projectId);
          // Add to EP tracking if selected
          if (trackIds.includes(track.id)) {
            track.inProjects.epIds.push(projectId);
          }
        } else if (project.type === "Album") {
          // Remove from Album tracking if not selected
          track.inProjects.albumIds = track.inProjects.albumIds.filter(id => id !== projectId);
          // Add to Album tracking if selected
          if (trackIds.includes(track.id)) {
            track.inProjects.albumIds.push(projectId);
          }
        }
      });

      const updatedProject = { ...project, trackIds };
      
      return {
        ...state,
        projectsDraft: state.projectsDraft.map(p => 
          p.id === projectId ? updatedProject : p
        ),
        alerts: [
          {
            id: uid(),
            kind: "success",
            msg: `Updated "${project.title}" with ${trackIds.length} tracks`,
            t: Date.now(),
          },
          ...state.alerts,
        ],
      };
    }

    // Release a draft project
    case "RELEASE_PROJECT": {
      const { projectId } = action.payload;
      const draftProject = state.projectsDraft.find(p => p.id === projectId);
      if (!draftProject) return state;

      const rules = PROJECT_RULES[draftProject.type];
      if (draftProject.trackIds.length < rules.min || draftProject.trackIds.length > rules.max) {
        return {
          ...state,
          alerts: [
            {
              id: uid(),
              kind: "info",
              msg: `${draftProject.type} must have ${rules.min}-${rules.max} tracks.`,
              t: Date.now(),
            },
            ...state.alerts,
          ],
        };
      }

      // Get all tracks (released + unreleased)
      const allTracks = [...state.releases, ...state.drafts];
      const selectedTracks = allTracks.filter(t => draftProject.trackIds.includes(t.id));
      
      // Ensure we have valid tracks
      if (selectedTracks.length === 0) {
        return {
          ...state,
          alerts: [
            {
              id: uid(),
              kind: "info",
              msg: "No valid tracks found for this project.",
              t: Date.now(),
            },
            ...state.alerts,
          ],
        };
      }
      
      // Release any unreleased tracks first
      const unreleasedTracks = selectedTracks.filter(t => !t.weekReleased);
      const newReleases = unreleasedTracks.map(track => ({
        id: track.id,
        title: track.title,
        quality: track.quality,
        weekReleased: state.time.week,
        yearReleased: state.time.year,
        weeksOn: 0,
        peakPos: null,
        lastWeekPos: null,
        streamsHistory: [],
        kind: "song",
        projectIds: [draftProject.id],
        salesHistory: [],
        salesFirstWeek: null,
        salesLifetime: 0,
        inProjects: { epIds: [], albumIds: [] }
      }));

      // Update existing released tracks with project association
      const updatedReleases = state.releases.map(release => {
        if (draftProject.trackIds.includes(release.id)) {
          return {
            ...release,
            projectIds: [...(release.projectIds || []), draftProject.id]
          };
        }
        return release;
      });

      // Create the released project
      const releasedProject = {
        ...draftProject,
        weekReleased: state.time.week,
        yearReleased: state.time.year,
        salesHistory: [],
        salesFirstWeek: null,
        salesLifetime: 0,
      };

      // Create project release entry
      const avgQuality = Math.round(
        selectedTracks.reduce((sum, t) => sum + t.quality, 0) / selectedTracks.length
      );
      
      const projectRelease = {
        id: draftProject.id,
        title: `${draftProject.title} (${draftProject.type})`,
        type: draftProject.type,
        quality: avgQuality,
        weekReleased: state.time.week,
        yearReleased: state.time.year,
        weeksOn: 0,
        peakPos: null,
        lastWeekPos: null,
        streamsHistory: [],
        kind: "project",
        projectType: draftProject.type,
        trackIds: draftProject.trackIds, // Use trackIds instead of tracks
        salesHistory: [],
        salesFirstWeek: null,
        salesLifetime: 0,
        streamsLifetime: 0,
      };

      // Update inProjects tracking for all tracks in this project
      const updatedTracksWithProjects = [...newReleases, ...updatedReleases].map(track => {
        if (draftProject.trackIds.includes(track.id)) {
          const currentInProjects = track.inProjects || { epIds: [], albumIds: [] };
          if (draftProject.type === "EP") {
            return {
              ...track,
              inProjects: {
                ...currentInProjects,
                epIds: [...currentInProjects.epIds, draftProject.id]
              }
            };
          } else {
            return {
              ...track,
              inProjects: {
                ...currentInProjects,
                albumIds: [...currentInProjects.albumIds, draftProject.id]
              }
            };
          }
        }
        return track;
      });

      // Add snap for project release
      const newSnap = {
        id: uid(),
        week: state.time.week,
        kind: "release",
        msg: `Your ${draftProject.type.toLowerCase()} "${draftProject.title}" released!`,
      };

      return {
        ...state,
        drafts: state.drafts.filter(d => !draftProject.trackIds.includes(d.id)),
        projectsDraft: state.projectsDraft.filter(p => p.id !== projectId),
        projectsReleased: [releasedProject, ...state.projectsReleased],
        releases: [...updatedTracksWithProjects, projectRelease],
        weekSnaps: [newSnap.msg, ...(state.weekSnaps || [])],
        alerts: [
          {
            id: uid(),
            kind: "success",
            msg: `Released ${draftProject.type}: "${draftProject.title}"`,
            t: Date.now(),
          },
          ...state.alerts,
        ],
      };
    }

    // Delete a draft project
    case "DELETE_DRAFT_PROJECT": {
      const projectId = action.payload;
      const project = state.projectsDraft.find(p => p.id === projectId);
      if (!project) return state;

      return {
        ...state,
        projectsDraft: state.projectsDraft.filter(p => p.id !== projectId),
        alerts: [
          {
            id: uid(),
            kind: "info",
            msg: `Deleted draft project: "${project.title}"`,
            t: Date.now(),
          },
          ...state.alerts,
        ],
      };
    }

    // Delete a draft song
    case "DELETE_DRAFT_SONG": {
      const songId = action.payload;
      const song = state.drafts.find(d => d.id === songId);
      if (!song) return state;

      return {
        ...state,
        drafts: state.drafts.filter(d => d.id !== songId),
        alerts: [
          {
            id: uid(),
            kind: "info",
            msg: `Deleted draft song: "${song.title}"`,
            t: Date.now(),
          },
          ...state.alerts,
        ],
      };
    }

    case "ADVANCE_WEEK": {
      const { popularity, reputation } = state.stats;

      // Capture pre-week stats for delta calculations
      const preMoney = state.stats.money;
      const prePop = state.stats.popularity;
      const preRep = state.stats.reputation;

      // Create local array for weekly snaps
      const snaps = [];

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
      let hasViralEvent = false;

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
          let viralPop = 0;
          if (
            event.type === "interview" &&
            ["radio", "podcast"].includes(event.subType)
          ) {
            if (rng() < VIRAL_CHANCE) { // 5% viral chance
              const extraPop = VIRAL_POP_BONUS_MIN + Math.floor(rng() * (VIRAL_POP_BONUS_MAX - VIRAL_POP_BONUS_MIN + 1)); // +1 to +3%
              viralPop = extraPop;
              viralBonus = ` (WENT VIRAL! +${extraPop}% Popularity)`;
              hasViralEvent = true;
            }
          }

          completedEvents.push({
            ...event,
            viralBonus,
            viralPop,
            message: `Completed ${event.subType} ${event.type} (Week ${state.time.week}): +${fmtMoney(event.money)}, Pop +${event.popDelta + viralPop}, Rep ${event.repDelta > 0 ? "+" : ""}${event.repDelta}${viralBonus}`,
          });
        } else {
          // Postpone the event
          const postponedEvent = { ...event, week: event.week + 1 };
          if (postponedEvent.week > WEEKS_PER_YEAR) postponedEvent.week = 1; // wrap year
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
          (popularity * POP_WEIGHT + reputation * REP_WEIGHT) * DISCOVERY_POP_REP_MULTIPLIER +
          r.quality * QUALITY_DISCOVERY_MULTIPLIER +
          rng() * STREAM_DISCOVERY_RANDOM_MAX;

        const decay = Math.max(STREAM_DECAY_MIN, 1 - r.weeksOn * STREAM_DECAY_PER_WEEK);
        const streams = Math.max(0, Math.round(discovery * decay));

        return {
          ...r,
          weeksOn: r.weeksOn + 1,
          streamsHistory: [...r.streamsHistory, streams],
        };
      });

      // Calculate weekly sales for all releases
      const updatedWithSales = updated.map((r) => {
        const weekStreams = r.streamsHistory.at(-1) ?? 0;
        
        // Initialize sales fields if missing
        r.salesHistory ??= [];
        r.salesLifetime ??= 0;
        r.salesFirstWeek ??= null;
        r.inProjects ??= { epIds: [], albumIds: [] };
        
        if (r.kind === "project") {
          // For projects (EP/Album), calculate album units
          const project = state.projectsReleased.find(p => p.id === r.id) || 
                         state.projectsDraft.find(p => p.id === r.id) ||
                         state.projects.find(p => p.id === r.id);
          
          if (project) {
            // Sum streams from all member tracks
            const sumTrackStreams = project.trackIds?.reduce((sum, trackId) => {
              const track = state.releases.find(r => r.kind !== "project" && r.id === trackId);
              return sum + (track?.streamsHistory?.at(-1) ?? 0);
            }, 0) || 0;
            
            // Calculate album units
            const baseAlbumUnits = Math.round(sumTrackStreams / ALBUM_STREAMS_PER_UNIT);
            
            // Add release week bump for first week
            const releaseBump = r.weeksOn === 1
              ? Math.round((state.stats.popularity * RELEASE_BUMP_POP_MULTIPLIER + state.stats.reputation * RELEASE_BUMP_REP_MULTIPLIER) * ((r.projectType || r.type) === "Album" ? ALBUM_RELEASE_BUMP_MULTIPLIER : EP_RELEASE_BUMP_MULTIPLIER))
              : 0;
            
            const weekAlbumUnits = Math.max(0, baseAlbumUnits + releaseBump);
            
            // Update sales history
            r.salesHistory = [...r.salesHistory, weekAlbumUnits];
            r.salesLifetime = r.salesLifetime + weekAlbumUnits;
            if (r.weeksOn === 1) r.salesFirstWeek = weekAlbumUnits;
            
            // Update certification
            r.cert = certForUnits(r.salesLifetime);
          }
        } else {
          // For individual songs, calculate track sales
          const weekTrackSales = Math.round(weekStreams / TRACK_STREAMS_PER_SALE);
          
          // Update sales history
          r.salesHistory = [...r.salesHistory, weekTrackSales];
          r.salesLifetime = r.salesLifetime + weekTrackSales;
          if (r.weeksOn === 1) r.salesFirstWeek = weekTrackSales;
          
          // Update certification
          r.cert = certForUnits(r.salesLifetime);
        }
        
        return r;
      });

      // rank by this-week streams
      const ranked = [...updatedWithSales]
        .sort(
          (a, b) =>
            (b.streamsHistory.at(-1) ?? 0) - (a.streamsHistory.at(-1) ?? 0),
        )
        .map((r, i) => ({ id: r.id, pos: i + 1 }));

      const afterRank = updatedWithSales.map((r) => {
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

      // Add streams snap if non-zero
      if (weekStreams > 0) {
        snaps.push(`Streams: ${weekStreams.toLocaleString()} (+${fmtMoney(pay)})`);
      }

      // Add event-related snaps
      if (eventEffects.money !== 0) {
        snaps.push(`Gigs & interviews: +${fmtMoney(eventEffects.money)}`);
      }
      if (eventEffects.pop !== 0) {
        snaps.push(`Popularity: ${eventEffects.pop > 0 ? '+' : ''}${eventEffects.pop}% from events`);
      }
      if (eventEffects.rep !== 0) {
        snaps.push(`Reputation: ${eventEffects.rep > 0 ? '+' : ''}${eventEffects.rep}% from events`);
      }

      // Add viral event snap
      if (hasViralEvent) {
        snaps.push('One of your interviews went viral! Extra discovery this week.');
      }
      
      // Calculate Swiftly follower gains from events and activities
      let swiftFollowerGain = 0;
      if (completedEvents.length > 0) {
        // Base follower gain from completing events
        swiftFollowerGain += completedEvents.length * 2; // +2 followers per event
        
        // Bonus for viral events
        if (hasViralEvent) {
          swiftFollowerGain += 15; // +15 followers for viral content
        }
        
        // Bonus for high-profile events
        const highProfileEvents = completedEvents.filter(e => 
          e.type === 'interview' && ['tv', 'magazine'].includes(e.subType)
        );
        swiftFollowerGain += highProfileEvents.length * 5; // +5 followers per high-profile event
      }
      
      // Add follower gain from streaming success
      const totalWeekStreams = updatedWithSales.reduce((sum, r) => sum + (r.streamsHistory?.at(-1) ?? 0), 0);
      if (totalWeekStreams > 10000) {
        swiftFollowerGain += Math.floor(totalWeekStreams / 10000); // +1 follower per 10k streams
      }
      
      // Add follower gain from chart performance
      const chartingReleases = updatedWithSales.filter(r => 
        r.streamsHistory?.at(-1) > 50000 // 50k+ streams = charting
      );
      swiftFollowerGain += chartingReleases.length * 3; // +3 followers per charting release

      // Calculate weekly sales totals
      const weekTrackSales = updatedWithSales
        .filter(r => r.kind !== "project")
        .reduce((sum, r) => sum + (r.salesHistory?.at(-1) ?? 0), 0);
      
      const weekAlbumUnits = updatedWithSales
        .filter(r => r.kind === "project")
        .reduce((sum, r) => sum + (r.salesHistory?.at(-1) ?? 0), 0);
      
      // Add sales snaps
      if (weekTrackSales > 0) {
        snaps.push(`Singles sales: +${weekTrackSales.toLocaleString()} units`);
      }
      if (weekAlbumUnits > 0) {
        snaps.push(`Project sales: +${weekAlbumUnits.toLocaleString()} units`);
      }
      
      // Add Swiftly follower gains
      if (swiftFollowerGain > 0) {
        snaps.push(`Swiftly followers: +${swiftFollowerGain}`);
      }
      
      // Check if player just got verified
      const currentFollowers = (state.social?.followers || 0) + swiftFollowerGain;
      const wasVerified = state.social?.accounts?.find(a => a.kind === 'player')?.verified || false;
      const nowVerified = currentFollowers >= 75000;
      
      if (!wasVerified && nowVerified) {
        snaps.push(`🎉 Congratulations! You're now verified on Swiftly!`);
      }
      
      // Detect releases this week and show first week sales
      const thisWeekReleases = updatedWithSales.filter(
        (r) => r.weekReleased === state.time.week && r.yearReleased === state.time.year
      );
      thisWeekReleases.forEach((r) => {
        snaps.push(`Released: "${r.title}"`);
        
        // Show first week sales if available
        if (r.salesFirstWeek > 0) {
          if (r.kind === "project") {
            snaps.push(`First week: "${r.title}" — ${r.salesFirstWeek.toLocaleString()} units`);
          } else {
            snaps.push(`First week: "${r.title}" — ${r.salesFirstWeek.toLocaleString()} units`);
          }
        }
      });

      // stat drift from streams (existing)
      const popFromStreams = weekStreams / POP_FROM_STREAMS_DIVISOR;
      const repDrift = REPUTATION_DRIFT;

      // apply chart drift first
      let newPop = clamp(
        Math.round(clamp(state.stats.popularity + popFromStreams, 1, POPULARITY_MAX)),
        1,
        POPULARITY_MAX,
      );
      let newRep = clamp(
        Math.round(clamp(state.stats.reputation + repDrift, 1, POPULARITY_MAX)),
        1,
        POPULARITY_MAX,
      );

      // add event effects
      newPop = clamp(newPop + eventEffects.pop, 1, POPULARITY_MAX);
      newRep = clamp(newRep + eventEffects.rep, 1, POPULARITY_MAX);

      // tick time (existing)
      let { week, year } = state.time;
      week += 1;
      if (week > WEEKS_PER_YEAR) {
        week = 1;
        year += 1;
      }

      // weekly renewals then apply event modifiers
      let nextEnergy = clamp(remainingEnergy, 0, ENERGY_MAX);
      // Reset energy to full each week if no events were completed
      if (completedEvents.length === 0) {
        nextEnergy = ENERGY_MAX;
      }
      let nextInsp = clamp(INSPIRATION_MAX, 0, INSPIRATION_MAX);

      const nextMoney = state.stats.money + pay + eventEffects.money;

      // Generate new offers for the new week
      const newOffers = generateWeeklyOffers(week, newPop);

      // Generate Swiftly feed posts for the new week (target: 8-10 posts minimum)
      const newFeedPosts = [];
      
      try {
        // GossipXtra: 2-4 posts per week (increased for more content)
        const gossipCount = Math.floor(Math.random() * 3) + 2; // 2-4
        for (let i = 0; i < gossipCount; i++) {
        const gossipLines = [
          "The music scene is buzzing this week! 🎵",
          "New artists are making waves everywhere! 🌊",
          "Industry insiders are talking about some fresh talent! ✨",
          "The charts are heating up with new releases! 🔥",
          "Music critics are raving about this week's drops! ⭐"
        ];
        
        const randomGossip = gossipLines[Math.floor(Math.random() * gossipLines.length)];
        const mentionPlayer = Math.random() < 0.3; // 30% chance to mention player
        
        let gossipText = randomGossip;
        let hypeDelta = 0;
        
        if (mentionPlayer && state.profile?.artistName) {
          const playerName = state.profile.artistName;
          gossipText = `${randomGossip} ${playerName} is definitely one to watch! 👀`;
          hypeDelta = Math.random() < 0.5 ? 1 : -1; // 50/50 up/down
        }
        
        // Generate contextually relevant NPC comments for GossipXtra posts
        let npcComments = [];
        try {
          const gossipNpcs = (state.social?.accounts || []).filter(a => a.kind === "npc");
          const commentCount = Math.floor(Math.random() * 3) + 2; // 2-4 NPC comments
          npcComments = generateContextualComments(gossipText, gossipNpcs, week, commentCount);
        } catch (error) {
          console.warn('Error generating GossipXtra comments:', error);
          npcComments = [];
        }
        
        const views = Math.floor(Math.random() * 90000) + 10000; // 10k-100k views
        const likes = Math.floor(views * (Math.random() * 0.02 + 0.01)); // 1-3% of views become likes
        
        newFeedPosts.push({
          id: uid(),
          authorId: "gossipxtra",
          text: gossipText,
          imageDataURL: null,
          week: week,
          createdWeek: week,
          likes: likes,
          views: views,
          likedBy: [],
          comments: npcComments,
          visibility: "public",
          hypeDelta: hypeDelta
        });
      }
      
      // Stats Finder: 1 post per week with chart data
      const playerReleases = state.releases.filter(r => r.kind === "song");
      const playerProjects = state.releases.filter(r => r.kind === "project");
      
      let statsText = "Weekly music stats update! 📊";
      let hasStats = false;
      
      if (playerReleases.length > 0 || playerProjects.length > 0) {
        hasStats = true;
        
        // Find top performing single
        const topSingle = playerReleases
          .map(r => ({ ...r, weekStreams: r.streamsHistory?.at(-1) || 0 }))
          .sort((a, b) => b.weekStreams - a.weekStreams)[0];
        
        // Find top performing project
        const topProject = playerProjects
          .map(r => ({ ...r, weekStreams: r.streamsHistory?.at(-1) || 0 }))
          .sort((a, b) => b.weekStreams - a.weekStreams)[0];
        
        if (topSingle && topSingle.weekStreams > 0) {
          const lastWeekStreams = topSingle.streamsHistory?.at(-2) || 0;
          const change = topSingle.weekStreams - lastWeekStreams;
          const arrow = change > 0 ? "↗️" : change < 0 ? "↘️" : "➡️";
          statsText += `\n\nTop Single: "${topSingle.title}" - ${topSingle.weekStreams.toLocaleString()} streams ${arrow}`;
        }
        
        if (topProject && topProject.weekStreams > 0) {
          const lastWeekStreams = topProject.streamsHistory?.at(-2) || 0;
          const change = topProject.weekStreams - lastWeekStreams;
          const arrow = change > 0 ? "↗️" : change < 0 ? "↘️" : "➡️";
          statsText += `\n\nTop Project: "${topProject.title}" - ${topProject.weekStreams.toLocaleString()} streams ${arrow}`;
        }
        
        // Show first week sales if any releases this week
        const thisWeekReleases = [...playerReleases, ...playerProjects].filter(
          r => r.weekReleased === week && r.yearReleased === year
        );
        
        if (thisWeekReleases.length > 0) {
          statsText += `\n\nNew Releases: ${thisWeekReleases.length} this week!`;
          thisWeekReleases.forEach(r => {
            if (r.salesFirstWeek > 0) {
              statsText += `\n"${r.title}": ${r.salesFirstWeek.toLocaleString()} units`;
            }
          });
        }
      }
      
      if (!hasStats) {
        statsText += `\n\nNo chart data available yet. Release some music to see your stats!`;
      }
      
      const views = Math.floor(Math.random() * 90000) + 10000; // 10k-100k views
      const likes = Math.floor(views * (Math.random() * 0.02 + 0.01)); // 1-3% of views become likes
      
      // Generate contextually relevant NPC comments for Stats Finder posts
      let statsComments = [];
      try {
        const statsNpcs = (state.social?.accounts || []).filter(a => a.kind === "npc");
        const statsCommentCount = Math.floor(Math.random() * 2) + 1; // 1-2 NPC comments
        statsComments = generateContextualComments(statsText, statsNpcs, week, statsCommentCount);
      } catch (error) {
        console.warn('Error generating Stats Finder comments:', error);
        statsComments = [];
      }
      
      newFeedPosts.push({
        id: uid(),
        authorId: "statsfinder",
        text: statsText,
        imageDataURL: null,
        week: week,
        createdWeek: week,
        likes: likes,
        views: views,
        likedBy: [],
        comments: statsComments,
        visibility: "public"
      });
      
      // Generate 3-5 NPC posts to keep feed fresh (increased for more content)
      const npcCount = 3 + Math.floor(Math.random() * 3); // 3-5 NPCs
      const weeklyNpcs = (state.social?.accounts || []).filter(a => a.kind === "npc");
      
      for (let i = 0; i < npcCount && weeklyNpcs.length > 0; i++) {
        const npc = weeklyNpcs[Math.floor(Math.random() * weeklyNpcs.length)];
        if (npc) {
          const npcPosts = [
            "Just discovered some amazing new music! 🎵",
            "The vibes this week are incredible! ✨",
            "Can't stop listening to the new releases! 🎧",
            "Music is life! 🎶",
            "Supporting local artists! 🌟"
          ];
          
          const npcText = npcPosts[Math.floor(Math.random() * npcPosts.length)];
          
          const likes = Math.floor(Math.random() * 5) + 1; // 1-5 likes
          const views = Math.floor(likes * (Math.random() * 3 + 2)); // 2-5x likes for views
          
          newFeedPosts.push({
            id: uid(),
            authorId: npc.id,
            text: npcText,
            imageDataURL: null,
            week: week,
            createdWeek: week,
            likes: likes,
            views: views,
            likedBy: [],
            comments: [],
            visibility: "public"
          });
        }
      }
      
      // Generate Industry News posts (2-3 posts per week for more content)
      const industryNewsCount = 2 + Math.floor(Math.random() * 2); // 2-3 posts
      const industryNewsPosts = [
        "Music industry insiders are predicting a huge year ahead! 🚀",
        "New streaming platforms are changing the game! 📱",
        "Independent artists are taking over the charts! 🎯",
        "The future of music distribution is here! 🌟",
        "Industry experts say this is the golden age of music! ✨",
        "New technology is revolutionizing music creation! 🎵",
        "The music business is evolving rapidly! 📈",
        "Artists are finding new ways to connect with fans! 💫",
        "The industry is embracing diversity like never before! 🌈",
        "Music festivals are getting bigger and better! 🎪"
      ];
      
      for (let i = 0; i < industryNewsCount; i++) {
        const newsText = industryNewsPosts[Math.floor(Math.random() * industryNewsPosts.length)];
        const views = Math.floor(Math.random() * 50000) + 5000; // 5k-55k views
        const likes = Math.floor(views * (Math.random() * 0.015 + 0.005)); // 0.5-2% of views become likes
        
        newFeedPosts.push({
          id: uid(),
          authorId: "industry", // New author type for industry news
          text: newsText,
          imageDataURL: null,
          week: week,
          createdWeek: week,
          likes: likes,
          views: views,
          likedBy: [],
          comments: [],
          visibility: "public"
        });
      }
      
      // Generate contextually relevant NPC comments on player posts
      const playerPosts = state.social?.posts?.filter(p => p.authorId === "player") || [];
      const availableNpcs = (state.social?.accounts || []).filter(a => a.kind === "npc");
      
      if (playerPosts.length > 0 && availableNpcs.length > 0) {
        // Add NPC comments to 1-3 random player posts
        const postsToCommentOn = playerPosts
          .sort(() => Math.random() - 0.5) // Shuffle
          .slice(0, Math.min(3, playerPosts.length));
        
        postsToCommentOn.forEach(post => {
          try {
            const commentCount = Math.floor(Math.random() * 3) + 1; // 1-3 NPC comments
            const contextualComments = generateContextualComments(post.text, availableNpcs, week, commentCount);
            
            // Add comments to the post
            post.comments = post.comments || [];
            post.comments.push(...contextualComments);
          } catch (error) {
            console.warn('Error generating player post comments:', error);
            // Continue without adding comments if generation fails
          }
        });
      }
      
      // Generate Trending Topics posts (1-2 posts per week for more content)
      const trendingCount = 1 + Math.floor(Math.random() * 2); // 1-2 posts
      const trendingTopics = [
        "Viral challenges are taking over social media! 🎭",
        "Everyone's talking about the new music trends! 🔥",
        "Social media is buzzing with music content! 📱",
        "New dance moves are going viral! 💃",
        "Music memes are everywhere this week! 😂",
        "The internet is obsessed with this week's releases! 🌐",
        "TikTok is exploding with new music! 📱",
        "Viral sounds are dominating the charts! 🎵",
        "Social media trends are driving music discovery! 🚀",
        "The internet can't stop talking about music! 💬"
      ];
      
      for (let i = 0; i < trendingCount; i++) {
        const trendingText = trendingTopics[Math.floor(Math.random() * trendingTopics.length)];
        const views = Math.floor(Math.random() * 80000) + 20000; // 20k-100k views
        const likes = Math.floor(views * (Math.random() * 0.02 + 0.01)); // 1-3% of views become likes
        
        newFeedPosts.push({
          id: uid(),
          authorId: "trending", // New author type for trending topics
          text: trendingText,
          imageDataURL: null,
          week: week,
          createdWeek: week,
          likes: likes,
          views: views,
          likedBy: [],
          comments: [],
          visibility: "public"
        });
      }
      
      // Check for Swiftly momentum bumps (posts with 20+ likes)
      const popularPosts = state.social?.posts?.filter(p => p.likes >= 20) || [];
      if (popularPosts.length > 0) {
        // Apply momentum bump to currently promoted tracks
        const momentumBump = 5;
        // This would be implemented in a more sophisticated way in a real game
        // For now, we'll just note that it happened
        console.log(`Swiftly momentum: ${popularPosts.length} popular posts this week`);
      }
      
      // Debug logging for Swiftly
      console.log(`Swiftly weekly tick: Generated ${newFeedPosts.length} feed posts, reset limits`);
      
      // Count posts by type for better debugging
      const postCounts = {};
      newFeedPosts.forEach(post => {
        postCounts[post.authorId] = (postCounts[post.authorId] || 0) + 1;
      });
      console.log('Post breakdown by type:', postCounts);
      
      console.log('New feed posts:', newFeedPosts.map(p => ({ 
        authorId: p.authorId, 
        week: p.week, 
        createdWeek: p.createdWeek,
        text: p.text.substring(0, 50) + '...'
      })));
      
      // Note: Pruning is handled in the Swiftly component and when opening the app
      
    } catch (error) {
      console.error('Error generating Swiftly feed posts:', error);
      // Continue with empty feed posts if generation fails
    }

      // Compute final stat deltas
      const moneyDelta = nextMoney - preMoney;
      const popDelta = newPop - prePop;
      const repDelta = newRep - preRep;

      // Add stat delta snaps if not already covered
      if (popDelta !== 0 && eventEffects.pop === 0) {
        snaps.push(`Popularity change: ${popDelta > 0 ? '+' : ''}${popDelta}%`);
      }
      if (repDelta !== 0 && eventEffects.rep === 0) {
        snaps.push(`Reputation change: ${repDelta > 0 ? '+' : ''}${repDelta}%`);
      }
      if (moneyDelta !== 0 && eventEffects.money === 0) {
        snaps.push(`Money change: ${moneyDelta > 0 ? '+' : ''}${fmtMoney(moneyDelta)}`);
      }

      // Build alerts
      const alerts = [
        {
          id: uid(),
          kind: "info",
          msg: `Week ${state.time.week} → Week ${week} — ${weekStreams.toLocaleString()} streams (+${fmtMoney(pay)})`,
          t: Date.now(),
        },
      ];

      // Add special year change alert
      if (year > state.time.year) {
        alerts.push({
          id: uid(),
          kind: "success",
          msg: `🎉 Welcome to ${year}! A new year begins!`,
          t: Date.now(),
        });
      }

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
        social: {
          ...state.social,
          feed: newFeedPosts, // Replace entire feed with new posts each week
          followers: (state.social?.followers || 0) + swiftFollowerGain,
          // Update player verification status based on follower count
          accounts: state.social.accounts.map(account => {
            if (account.kind === 'player') {
              return {
                ...account,
                verified: (state.social?.followers || 0) + swiftFollowerGain >= 75000
              };
            }
            return account;
          })
        },
        
        limits: { likesThisWeek: {}, commentsThisWeek: {} },
        alerts: [...alerts, ...state.alerts],
        weekSnaps: snaps, // Each week overwrites the previous list
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

    // Swiftly social app actions
    case "SWIFTLY_CREATE_POST": {
      const { text, imageDataURL } = action.payload;
      
      // Check if player has enough energy (2⚡)
      if (state.stats.energy < 2) {
        return {
          ...state,
          alerts: [
            {
              id: uid(),
              kind: "info",
              msg: "Not enough energy to post (need 2⚡)",
              t: Date.now(),
            },
            ...state.alerts,
          ],
        };
      }

      const newPost = {
        id: uid(),
        authorId: "player",
        text: text.trim(),
        imageDataURL: imageDataURL || null,
        week: state.time.week,
        createdWeek: state.time.week,
        likes: 0,
        views: 0, // Will be calculated based on followers
        likedBy: [],
        comments: [],
        visibility: "public",
        alt: imageDataURL ? "User image" : null
      };

      // Calculate engagement based on current followers
      const currentFollowers = state.social.followers || 0;
      let followerBoost, initialViews, initialLikes;
      
      if (currentFollowers < 100) {
        // 0-100 followers: small gains
        followerBoost = Math.floor(Math.random() * 3) + 1; // 1-3 followers
        initialViews = Math.floor(Math.random() * 50) + 10; // 10-60 views
        initialLikes = Math.floor(initialViews * (Math.random() * 0.1 + 0.05)); // 5-15% of views become likes
      } else if (currentFollowers < 1000) {
        // 100-1000 followers: moderate gains
        followerBoost = Math.floor(Math.random() * 5) + 2; // 2-7 followers
        initialViews = Math.floor(Math.random() * 200) + 50; // 50-250 views
        initialLikes = Math.floor(initialViews * (Math.random() * 0.1 + 0.05)); // 5-15% of views become likes
      } else if (currentFollowers < 10000) {
        // 1000-10000 followers: good gains
        followerBoost = Math.floor(Math.random() * 10) + 5; // 5-15 followers
        initialViews = Math.floor(Math.random() * 500) + 100; // 100-600 views
        initialLikes = Math.floor(initialViews * (Math.random() * 0.1 + 0.05)); // 5-15% of views become likes
      } else {
        // 10000+ followers: viral potential
        followerBoost = Math.floor(Math.random() * 20) + 10; // 10-30 followers
        initialViews = Math.floor(Math.random() * 1000) + 200; // 200-1200 views
        initialLikes = Math.floor(initialViews * (Math.random() * 0.1 + 0.05)); // 5-15% of views become likes
      }
      
      // Update post with calculated engagement
      const updatedPost = {
        ...newPost,
        views: initialViews,
        likes: initialLikes
      };
      
      const newFollowers = currentFollowers + followerBoost;

      return {
        ...state,
        social: {
          ...state.social,
          posts: [updatedPost, ...state.social.posts],
          followers: newFollowers
        },
        apps: {
          ...state.apps,
          swiftly: { followers: newFollowers }
        },
        stats: {
          ...state.stats,
          energy: Math.max(0, state.stats.energy - 2)
        },
        alerts: [
          {
            id: uid(),
            kind: "success",
            msg: `Posted to Swiftly! +${followerBoost} followers`,
            t: Date.now(),
          },
          ...state.alerts,
        ],
      };
    }

    case "SWIFTLY_LIKE_POST": {
      const { postId } = action.payload;
      
      // Find post in both posts and feed arrays
      let post = state.social.posts.find(p => p.id === postId);
      let isInPosts = true;
      
      if (!post) {
        post = state.social.feed.find(p => p.id === postId);
        isInPosts = false;
      }
      
      if (!post) return state;

      // Check weekly limit (max 3 likes per post per week)
      const currentLikes = state.limits.likesThisWeek[postId] || 0;
      if (currentLikes >= 3) {
        return {
          ...state,
          alerts: [
            {
              id: uid(),
              kind: "info",
              msg: "Weekly like limit reached for this post",
              t: Date.now(),
            },
            ...state.alerts,
          ],
        };
      }

      const isLiked = post.likedBy.includes("player");
      let newLikedBy, newLikes, newLimits;

      if (isLiked) {
        // Unlike
        newLikedBy = post.likedBy.filter(id => id !== "player");
        newLikes = post.likes - 1;
        newLimits = { ...state.limits };
        if (newLimits.likesThisWeek[postId]) {
          newLimits.likesThisWeek[postId] = Math.max(0, newLimits.likesThisWeek[postId] - 1);
        }
      } else {
        // Like
        newLikedBy = [...post.likedBy, "player"];
        newLikes = post.likes + 1;
        newLimits = {
          ...state.limits,
          likesThisWeek: {
            ...state.limits.likesThisWeek,
            [postId]: (state.limits.likesThisWeek[postId] || 0) + 1
          }
        };
      }

      // Update the appropriate array
      if (isInPosts) {
        const updatedPosts = state.social.posts.map(p => 
          p.id === postId 
            ? { ...p, likes: newLikes, likedBy: newLikedBy }
            : p
        );
        
        return {
          ...state,
          social: {
            ...state.social,
            posts: updatedPosts
          },
          limits: newLimits
        };
      } else {
        const updatedFeed = state.social.feed.map(p => 
          p.id === postId 
            ? { ...p, likes: newLikes, likedBy: newLikedBy }
            : p
        );
        
        return {
          ...state,
          social: {
            ...state.social,
            feed: updatedFeed
          },
          limits: newLimits
        };
      }
    }

    case "SWIFTLY_COMMENT_POST": {
      const { postId, text } = action.payload;
      
      // Find post in both posts and feed arrays
      let post = state.social.posts.find(p => p.id === postId);
      let isInPosts = true;
      
      if (!post) {
        post = state.social.feed.find(p => p.id === postId);
        isInPosts = false;
      }
      
      if (!post) return state;

      // Check weekly limit (max 3 comments per post per week)
      const currentComments = state.limits.commentsThisWeek[postId] || 0;
      if (currentComments >= 3) {
        return {
          ...state,
          alerts: [
            {
              id: uid(),
              kind: "info",
              msg: "Weekly comment limit reached for this post",
              t: Date.now(),
            },
            ...state.alerts,
          ],
        };
      }

      const newComment = {
        id: uid(),
        userId: "player",
        text: text.trim(),
        week: state.time.week
      };

      // Update the appropriate array
      if (isInPosts) {
        const updatedPosts = state.social.posts.map(p => 
          p.id === postId 
            ? { ...p, comments: [...p.comments, newComment] }
            : p
        );
        
        const newLimits = {
          ...state.limits,
          commentsThisWeek: {
            ...state.limits.commentsThisWeek,
            [postId]: (state.limits.commentsThisWeek[postId] || 0) + 1
          }
        };

        return {
          ...state,
          social: {
            ...state.social,
            posts: updatedPosts
          },
          limits: newLimits
        };
      } else {
        const updatedFeed = state.social.feed.map(p => 
          p.id === postId 
            ? { ...p, comments: [...p.comments, newComment] }
            : p
        );
        
        const newLimits = {
          ...state.limits,
          commentsThisWeek: {
            ...state.limits.commentsThisWeek,
            [postId]: (state.limits.commentsThisWeek[postId] || 0) + 1
          }
        };

        return {
          ...state,
          social: {
            ...state.social,
            feed: updatedFeed
          },
          limits: newLimits
        };
      }
    }

    case "SWIFTLY_UPDATE_PROFILE_PHOTO": {
      const { imageDataURL } = action.payload;
      
      return {
        ...state,
        player: {
          ...state.player,
          profilePhotoDataURL: imageDataURL
        },
        alerts: [
          {
            id: uid(),
            kind: "success",
            msg: "Profile photo updated!",
            t: Date.now(),
          },
          ...state.alerts,
        ],
      };
    }

    case "SWIFTLY_GENERATE_FEED_POSTS": {
      try {
        // Generate GossipXtra and Stats Finder posts for the week
        const newFeedPosts = [];
        
        // GossipXtra: 0-2 posts per week
        const gossipCount = Math.floor(Math.random() * 3); // 0-2
        for (let i = 0; i < gossipCount; i++) {
        const gossipLines = [
          "The music scene is buzzing this week! 🎵",
          "New artists are making waves everywhere! 🌊",
          "Industry insiders are talking about some fresh talent! ✨",
          "The charts are heating up with new releases! 🔥",
          "Music critics are raving about this week's drops! ⭐"
        ];
        
        const randomGossip = gossipLines[Math.floor(Math.random() * gossipLines.length)];
        const mentionPlayer = Math.random() < 0.3; // 30% chance to mention player
        
        let gossipText = randomGossip;
        let hypeDelta = 0;
        
        if (mentionPlayer && state.profile?.artistName) {
          const playerName = state.profile.artistName;
          gossipText = `${randomGossip} ${playerName} is definitely one to watch! 👀`;
          hypeDelta = Math.random() < 0.5 ? 1 : -1; // 50/50 up/down
        }
        
        const views = Math.floor(Math.random() * 90000) + 10000; // 10k-100k views
        const likes = Math.floor(views * (Math.random() * 0.02 + 0.01)); // 1-3% of views become likes
        
        // Generate contextually relevant NPC comments for GossipXtra posts
        let npcComments = [];
        try {
          const npcAccounts = state.social.accounts.filter(a => a.kind === "npc");
          const commentCount = Math.floor(Math.random() * 3) + 2; // 2-4 NPC comments
          npcComments = generateContextualComments(gossipText, npcAccounts, state.time.week, commentCount);
        } catch (error) {
          console.warn('Error generating GossipXtra comments in SWIFTLY_GENERATE_FEED_POSTS:', error);
          npcComments = [];
        }
        
        newFeedPosts.push({
          id: uid(),
          authorId: "gossipxtra",
          text: gossipText,
          imageDataURL: null,
          week: state.time.week,
          createdWeek: state.time.week,
          likes: likes,
          views: views,
          likedBy: [],
          comments: npcComments,
          visibility: "public",
          hypeDelta: hypeDelta
        });
      }
      
      // Stats Finder: 1 post per week with chart data
      const playerReleases = state.releases.filter(r => r.kind === "song");
      const playerProjects = state.releases.filter(r => r.kind === "project");
      
      let statsText = "Weekly music stats update! 📊";
      let hasStats = false;
      
      if (playerReleases.length > 0 || playerProjects.length > 0) {
        hasStats = true;
        
        // Find top performing single
        const topSingle = playerReleases
          .map(r => ({ ...r, weekStreams: r.streamsHistory?.at(-1) || 0 }))
          .sort((a, b) => b.weekStreams - a.weekStreams)[0];
        
        // Find top performing project
        const topProject = playerProjects
          .map(r => ({ ...r, weekStreams: r.streamsHistory?.at(-1) || 0 }))
          .sort((a, b) => b.weekStreams - a.weekStreams)[0];
        
        if (topSingle && topSingle.weekStreams > 0) {
          const lastWeekStreams = topSingle.streamsHistory?.at(-2) || 0;
          const change = topSingle.weekStreams - lastWeekStreams;
          const arrow = change > 0 ? "↗️" : change < 0 ? "↘️" : "➡️";
          statsText += `\n\nTop Single: "${topSingle.title}" - ${topSingle.weekStreams.toLocaleString()} streams ${arrow}`;
        }
        
        if (topProject && topProject.weekStreams > 0) {
          const lastWeekStreams = topProject.streamsHistory?.at(-2) || 0;
          const change = topProject.weekStreams - lastWeekStreams;
          const arrow = change > 0 ? "↗️" : change < 0 ? "↘️" : "➡️";
          statsText += `\n\nTop Project: "${topProject.title}" - ${topProject.weekStreams.toLocaleString()} streams ${arrow}`;
        }
        
        // Show first week sales if any releases this week
        const thisWeekReleases = [...playerReleases, ...playerProjects].filter(
          r => r.weekReleased === state.time.week && r.yearReleased === state.time.year
        );
        
        if (thisWeekReleases.length > 0) {
          statsText += `\n\nNew Releases: ${thisWeekReleases.length} this week!`;
          thisWeekReleases.forEach(r => {
            if (r.salesFirstWeek > 0) {
              statsText += `\n"${r.title}": ${r.salesFirstWeek.toLocaleString()} first week units`;
            }
          });
        }
      }
      
      if (!hasStats) {
        statsText += "\n\nNo chart data available yet. Release some music to see your stats!";
      }
      
      const views = Math.floor(Math.random() * 90000) + 10000; // 10k-100k views
      const likes = Math.floor(views * (Math.random() * 0.02 + 0.01)); // 1-3% of views become likes
      
      newFeedPosts.push({
        id: uid(),
        authorId: "statsfinder",
        text: statsText,
        imageDataURL: null,
        week: state.time.week,
        createdWeek: state.time.week,
        likes: likes,
        views: views,
        likedBy: [],
        comments: [],
        visibility: "public"
      });
      
      // Generate 1-2 NPC posts to keep feed fresh
      const npcCount = 1 + Math.floor(Math.random() * 2); // 1-2 NPCs
      const npcAccounts = state.social.accounts.filter(a => a.kind === "npc");
      
      for (let i = 0; i < npcCount; i++) {
        const npc = npcAccounts[Math.floor(Math.random() * npcAccounts.length)];
        if (npc) {
          const npcPosts = [
            "Just discovered some amazing new music! 🎵",
            "The vibes this week are incredible! ✨",
            "Can't stop listening to the new releases! 🎧",
            "Music is life! 🎶",
            "Supporting local artists! 🌟"
          ];
          
          const npcText = npcPosts[Math.floor(Math.random() * npcPosts.length)];
          
          const likes = Math.floor(Math.random() * 5) + 1; // 1-5 likes
          const views = Math.floor(likes * (Math.random() * 3 + 2)); // 2-5x likes for views
          
          newFeedPosts.push({
            id: uid(),
            authorId: npc.id,
            text: npcText,
            imageDataURL: null,
            week: state.time.week,
            createdWeek: state.time.week,
            likes: likes,
            views: views,
            likedBy: [],
            comments: [],
            visibility: "public"
          });
        }
      }
      
      return {
        ...state,
        social: {
          ...state.social,
          feed: newFeedPosts // Replace entire feed with new posts
        }
      };
      } catch (error) {
        console.error('Error in SWIFTLY_GENERATE_FEED_POSTS:', error);
        return state; // Return original state if generation fails
      }
    }

    case "SWIFTLY_RESET_LIMITS": {
      return {
        ...state,
        limits: { likesThisWeek: {}, commentsThisWeek: {} }
      };
    }

    default:
      return state;
  }
}

function useSavedReducer() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  // load once
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const loadedState = JSON.parse(raw);
        dispatch({ type: "LOAD", payload: loadedState });
        
        // Load Swiftly assets after migration
        if (loadedState.social) {
          console.log('Starting Swiftly asset loading...');
          ensureSwiftlyAssetsLoaded(loadedState).then(updatedState => {
            console.log('Swiftly assets loaded, updating state...');
            if (updatedState !== loadedState) {
              dispatch({ type: "LOAD", payload: updatedState });
            }
            setAssetsLoaded(true);
          }).catch(error => {
            console.error('Failed to load Swiftly assets:', error);
            setAssetsLoaded(true);
          });
        } else {
          setAssetsLoaded(true);
        }
      } catch (error) {
        console.error('Failed to load save:', error);
        setAssetsLoaded(true);
      }
    } else {
      setAssetsLoaded(true);
    }
  }, [assetsLoaded]);

  // persist
  useEffect(() => {
    if (assetsLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state, assetsLoaded]);

  return [state, dispatch];
}

// --------- UI atoms
const Panel = ({ children, className = "" }) => (
  <div className={`rounded-2xl bg-[#191a20] ring-1 ring-white/5 p-4 ${className}`}>
    {children}
  </div>
);



const Screen = ({ children }) => (
  <div
    className="min-h-[100dvh] pt-6"
    style={{
      // make room for the fixed footer; include iOS safe area
      paddingBottom: `calc(${NAV_HEIGHT_PX}px + env(safe-area-inset-bottom,0px) + 16px)`
    }}
  >
    <div className={SHELL}>{children}</div>
  </div>
);

// Time display component for year/week

const TopGrad = ({ title, subtitle, right }) => (
  <div className={SHELL}>
    <div className={`mb-4 w-full h-28 rounded-2xl bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] shadow-[0_12px_36px_-12px_rgba(59,130,246,.45)] p-5 flex items-end justify-between`}>
      <div>
        <div className="text-xl font-extrabold tracking-tight">{title}</div>
        {subtitle && <div className="text-white/80 -mt-0.5">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-4">
        {right}
      </div>
    </div>
  </div>
);

// (Optional) Add/replace a centered bottom action wrapper (for your Progress/Advance Week button)

// Error boundary for Studio subviews
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Studio subview error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <div className="text-lg font-semibold mb-2">Something went wrong</div>
          <div className="text-sm text-neutral-400 mb-4">This view encountered an error</div>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="rounded-xl px-4 py-2 bg-white/10 border border-white/20"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Studio tile component for the hub
function StudioTile({ icon, title, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl bg-white/[0.04] border border-white/10 px-5 py-6 text-left hover:bg-white/[0.06] transition w-full focus:outline-none focus:ring-2 focus:ring-white/20"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-neutral-400">{subtitle}</div>
    </button>
  );
}

// --------- Startup
function Startup({ hasSave, onContinue, onNewGame }) {
  return (
    <Page>
      <HeaderBar title="Sound Empire" subtitle="Start" right={null} />
      <Section className="pb-28 md:pb-32">
        <Card className="grid gap-4">
          {hasSave ? (
            <>
              <div className="text-neutral-400">
                We found a previous save on this device.
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={onContinue}
                  className="rounded-xl px-4 py-3 font-semibold bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8]"
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
              <div className="text-neutral-400">
                No save found. Create your artist to begin.
              </div>
              <button
                onClick={onNewGame}
                className="rounded-xl px-4 py-3 font-semibold bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8]"
              >
                Create New Artist
              </button>
            </>
          )}
        </Card>
      </Section>
    </Page>
  );
}

// --------- Pages
function Home({ state, dispatch, setTab }) {
  const handleSaveClick = async () => {
    const alert = await handleSave(state);
    dispatch({ type: "ALERT", payload: alert });
  };

  return (
    <Page>
      <HeaderBar
        title="Home"
        subtitle="Dash"
        right={
          <>
            <TimeDisplay time={state.time} />
            <SaveButton onSave={handleSaveClick} />
            <SettingsButton onOpen={() => setTab("Settings")} />
          </>
        }
      />

      <Section className="pb-28 md:pb-32">
        {/* Status row with money */}
        <Card className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-neutral-400">Status</span>
          </div>
          <div className="font-semibold pr-4 sm:pr-5">{fmtMoney(state.stats.money)}</div>
        </Card>

        {/* Artist info */}
        <Card className="flex items-center gap-4 mb-4">
          <div className="size-14 rounded-full bg-white/5 grid place-items-center">
            🎤
          </div>
          <div className="flex-1">
            <div className="text-neutral-400 text-sm">Artist</div>
            <div className="text-lg font-semibold">
              {state.profile?.artistName ?? "— (start a new game)"}
            </div>
            {state.profile && (
              <div className="text-neutral-400 text-sm">
                {`${state.profile.firstName ?? ""} ${state.profile.lastName ?? ""}`.trim() ||
                  "—"}{" "}
                • Age {state.profile.age || "—"}
              </div>
            )}
          </div>
        </Card>

        {/* Stats strip */}
        <Card className="bg-gradient-to-r from-[#151526] to-[#121218] mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="text-center">
              <div className="text-white/60 text-xs mb-1">Popularity</div>
              <div className="text-lg font-semibold text-white">{state.stats.popularity}%</div>
            </div>
            <div className="text-center">
              <div className="text-white/60 text-xs mb-1">Reputation</div>
              <div className="text-lg font-semibold text-white">{state.stats.reputation}%</div>
            </div>
            <div className="text-center">
              <div className="text-white/60 text-xs mb-1">Energy</div>
              <div className="text-lg font-semibold text-white">{state.stats.energy}/100</div>
            </div>
            <div className="text-center">
              <div className="text-white/60 text-xs mb-1">Inspiration</div>
              <div className="text-lg font-semibold text-white">{state.stats.inspiration}/100</div>
            </div>
          </div>
        </Card>

        {/* Upcoming Events */}
        <Card className="mb-4">
          <div className="font-semibold text-lg mb-4 text-white">Upcoming Events</div>
          {(() => {
            const upcoming = state.events.scheduled
              .filter((e) => e.week >= state.time.week)
              .sort((a, b) => a.week - b.week);

            return upcoming.length === 0 ? (
              <div className="text-neutral-400 text-center py-8">
                No events scheduled yet. Book gigs and interviews in the Media
                tab.
              </div>
            ) : (
              <div className="space-y-3">
                {upcoming.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-lg bg-white/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/8 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">
                        {(() => {
                          const icons = {
                            club: "🎭",
                            theater: "🎪",
                            festival: "🎡",
                            arena: "🏟️",
                            radio: "📻",
                            podcast: "🎙️",
                            tv: "📺",
                          };
                          return icons[e.subType] || "🎤";
                        })()}
                      </span>
                      <div className="flex-1">
                        <div className="font-semibold text-white">
                          {e.subType.charAt(0).toUpperCase() +
                            e.subType.slice(1)}{" "}
                          {e.type === "gig" ? "Gig" : "Interview"}
                        </div>
                        <div className="text-neutral-400 text-sm">
                          Week {e.week} • Energy: {e.energyCost} •{" "}
                          {fmtMoney(e.money)}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-right">
                      <div className="text-sm">
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
        </Card>

        {/* This Week's Summary */}
        <Card>
          <div className="font-semibold text-lg mb-4 text-white">This Week's Summary</div>
          {(() => {
            const weekSnaps = state.weekSnaps || [];
            
            return weekSnaps.length === 0 ? (
              <div className="text-neutral-400 text-center py-8">No updates yet.</div>
            ) : (
              <div className="space-y-2">
                {weekSnaps.slice(0, 8).map((snap, index) => (
                  <div
                    key={index}
                    className="text-sm py-2 px-3 rounded-md hover:bg-white/5 transition-colors border-l-2 border-white/10"
                  >
                    {snap}
                  </div>
                ))}
              </div>
            );
          })()}
        </Card>
      </Section>
    </Page>
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
    <Page>
      <HeaderBar title="Create Artist" subtitle="Character Setup" right={null} />
      <Section className="pb-28 md:pb-32">
        <Card className="p-0 overflow-hidden">
          <div className="p-6 bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8]">
            <div className="h-40 w-full rounded-xl bg-black/20 border border-white/10 grid place-items-center">
              <label className="cursor-pointer text-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files[0];
                    if (file) {
                      try {
                        // Simple image processing for profile photo
                        const reader = new FileReader();
                        reader.onload = () => {
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            
                            let { width, height } = img;
                            if (width > height) {
                              if (width > 256) {
                                height = (height * 256) / width;
                                width = 256;
                              }
                            } else {
                              if (height > 256) {
                                width = (width * 256) / height;
                                height = 256;
                              }
                            }
                            
                            canvas.width = width;
                            canvas.height = height;
                            ctx.drawImage(img, 0, 0, width, height);
                            const dataURL = canvas.toDataURL('image/jpeg', 0.8);
                            
                            // Store in form state for later use
                            setForm(f => ({ ...f, profilePhotoDataURL: dataURL }));
                          };
                          img.src = reader.result;
                        };
                        reader.readAsDataURL(file);
                      } catch (error) {
                        console.error('Profile photo processing failed:', error);
                        alert('Failed to process profile photo. Please try again.');
                      }
                    }
                  }}
                  className="hidden"
                />
                <div className="text-white/80">📷 Click to add profile picture (optional)</div>
                <div className="text-white/60 text-sm mt-2">Will be used in Swiftly</div>
              </label>
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
                className="rounded-xl px-4 py-2 font-semibold bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8]"
              >
                Create artist
              </button>
            </div>
          </div>
        </Card>
      </Section>
    </Page>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-neutral-400 text-sm mb-1">{label}</div>
      {children}
    </label>
  );
}

// --------- STUDIO (formerly Projects)
function Studio({ state, dispatch, setTab }) {
  // UI-only view state for Studio hub: "hub" | "record" | "drafts" | "released"
  const [studioView, setStudioView] = useState("hub");

  const handleSaveClick = async () => {
    const alert = await handleSave(state);
    dispatch({ type: "ALERT", payload: alert });
  };

  return (
    <Page>
      <HeaderBar
        title="Studio"
        subtitle={studioView === "hub" ? "Creative Hub" :
          studioView === "record" ? "Write • Release" :
          studioView === "drafts" ? "Build EPs & Albums" :
          "Songs & Projects stats"}
        right={
          <>
            <TimeDisplay time={state.time} />
            <SaveButton onSave={handleSaveClick} />
            <SettingsButton onOpen={() => setTab("Settings")} />
          </>
        }
      />

      <Section className="pb-28 md:pb-32">
        {studioView === "hub" && <StudioHome setStudioView={setStudioView} />}

        {studioView !== "hub" && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setStudioView("hub")}
              className="rounded-xl px-3 py-2 bg-white/[0.07] border border-white/10 text-sm"
            >
              ← Back to Hub
            </button>
          </div>
        )}

        {studioView === "record" && (
          <ErrorBoundary>
            <RecordSongsPanel state={state} dispatch={dispatch} setStudioView={setStudioView} />
          </ErrorBoundary>
        )}

        {studioView === "drafts" && (
          <ErrorBoundary>
            <DraftProjectsPanel state={state} dispatch={dispatch} setStudioView={setStudioView} />
          </ErrorBoundary>
        )}

        {studioView === "released" && (
          <ErrorBoundary>
            <ReleasedLibraryPanel state={state} />
          </ErrorBoundary>
        )}
      </Section>
    </Page>
  );
}

// StudioHome - shows the 3 tiles
function StudioHome({ setStudioView }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StudioTile
        icon="🧰"
        title="Record Songs"
        subtitle="Write • Release"
        onClick={() => setStudioView("record")}
      />
      <StudioTile
        icon="🧳"
        title="Draft Projects"
        subtitle="Build EPs & Albums"
        onClick={() => setStudioView("drafts")}
      />
      <StudioTile
        icon="🏆"
        title="Released Library"
        subtitle="Songs & Projects stats"
        onClick={() => setStudioView("released")}
      />
    </div>
  );
}





// Minimal wrapper components for the Studio panels
function RecordSongsPanel({ state, dispatch, setStudioView }) {
  const [songTitle, setSongTitle] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const createSong = () => {
    // Check for duplicate titles across drafts and releases
    const allTitles = [
      ...(state.drafts ?? []).map(d => d.title?.toLowerCase().trim()),
      ...(state.releases ?? []).map(r => r.title?.toLowerCase().trim())
    ];
    
    const normalizedTitle = songTitle.toLowerCase().trim();
    if (allTitles.includes(normalizedTitle)) {
      // Show error instead of creating duplicate
      alert(`A song with the title "${songTitle}" already exists!`);
      return;
    }
    
    dispatch({
      type: "WRITE_SONG",
      payload: songTitle,
    });
    setSongTitle("");
  };

  const releaseSong = (id) => {
    dispatch({ type: "RELEASE_SONG", payload: id });
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
    // Navigate to released library after releasing
    setTimeout(() => setStudioView("released"), 3000);
  };

  return (
    <div className="grid gap-4">
      {/* Success Alert */}
      {showSuccess && (
        <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 text-green-300 text-center">
          Song released successfully! 🎉
        </div>
      )}

      {/* Create new song */}
      <Card>
        <div className="font-semibold mb-3">Write New Song</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Song title"
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value)}
            className="rounded-xl bg-white/5 px-3 py-2 outline-none"
          />
          <button
            onClick={createSong}
            disabled={!songTitle.trim()}
            className="rounded-xl px-4 py-2 font-semibold bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Write Song
          </button>
        </div>
        <div className="mt-2 text-xs text-white/60">
          💡 Song quality auto-generates based on your energy, inspiration, and future skills
        </div>
      </Card>

      {/* Unreleased drafts */}
      <Card>
        <div className="font-semibold mb-2">Unreleased Tracks</div>
        {(state.drafts ?? []).length === 0 && (
          <div className="text-neutral-400">No drafts yet.</div>
        )}
        <div className="grid gap-2">
          {(state.drafts ?? []).map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2"
            >
              <div>
                <div className="font-semibold">{d.title ?? "—"}</div>
                <div className="text-neutral-400 text-sm">
                  Quality {d.quality ?? "—"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => releaseSong(d.id)}
                  className="rounded-lg px-3 py-1 bg-black/30 border border-white/10"
                >
                  Release Single
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete draft song "${d.title}"?`)) {
                      dispatch({ type: "DELETE_DRAFT_SONG", payload: d.id });
                    }
                  }}
                  className="rounded-lg px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30"
                  title="Delete Draft Song"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function DraftProjectsPanel({ state, dispatch, setStudioView }) {
  const [projTitle, setProjTitle] = useState("");
  const [projType, setProjType] = useState("EP");

  const createDraftProject = () => {
    // Check for duplicate project titles
    const allProjectTitles = [
      ...(state.projectsDraft ?? []).map(p => p.title?.toLowerCase().trim()),
      ...(state.releases ?? []).filter(r => r.kind === "project").map(r => r.title?.toLowerCase().trim())
    ];
    
    const normalizedTitle = projTitle.toLowerCase().trim();
    if (allProjectTitles.includes(normalizedTitle)) {
      alert(`A project with the title "${projTitle}" already exists!`);
      return;
    }
    
    dispatch({
      type: "CREATE_DRAFT_PROJECT",
      payload: {
        title: projTitle,
        type: projType,
      },
    });
    setProjTitle("");
  };

  const rules = PROJECT_RULES[projType];

  return (
    <div className="grid gap-4">
      {/* Create new draft project */}
      <Panel>
        <div className="font-semibold mb-3">Create New Draft</div>
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
            <option>Album</option>
          </select>
          <button
            onClick={createDraftProject}
            className="rounded-xl px-4 py-2 font-semibold bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8]"
          >
            Create Draft
          </button>
        </div>
        <div className="text-neutral-400 text-xs mt-2">
          EP: 3-7 tracks • Album: 8-14 tracks
        </div>
      </Panel>

      {/* Existing draft projects */}
      {(state.projectsDraft ?? []).length > 0 && (
        <Panel>
          <div className="font-semibold mb-3">Draft Projects</div>
          <div className="space-y-4">
            {(state.projectsDraft ?? []).map((project) => (
              <div key={project.id} className="border border-white/10 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold">{project.title ?? "—"}</div>
                    <div className={`${brand.dim} text-sm`}>
                      {project.type ?? "—"} • {(project.trackIds ?? []).length} tracks
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={`${brand.dim} text-xs`}>
                        {rules.min}-{rules.max} required
                      </div>
                      <div className={`text-sm ${(project.trackIds ?? []).length >= rules.min && (project.trackIds ?? []).length <= rules.max ? 'text-green-400' : 'text-red-400'}`}>
                        {(project.trackIds ?? []).length >= rules.min && (project.trackIds ?? []).length <= rules.max ? 'Valid' : 'Invalid'}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`Delete draft project "${project.title}"?`)) {
                          dispatch({ type: "DELETE_DRAFT_PROJECT", payload: project.id });
                        }
                      }}
                      className="rounded-lg px-3 py-1 bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30"
                      title="Delete Draft Project"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                
                {/* Track selection */}
                <div className="mb-3">
                  <div className="font-medium mb-2">Select Tracks:</div>
                  <div className="grid gap-2 max-h-32 overflow-y-auto">
                    {(() => {
                      // Smart track filtering based on project type
                      const allTracks = [...(state.releases ?? []), ...(state.drafts ?? [])];
                      
                      // Filter out project releases (EPs/Albums) - only show individual songs
                      const individualTracks = allTracks.filter(track => track.kind !== "project");
                      
                      // Apply track reuse rules based on project type
                      const availableTracks = individualTracks.filter(track => {
                        // Always show drafts
                        if (!track.weekReleased) return true;
                        
                        // Initialize inProjects if missing
                        track.inProjects ??= { epIds: [], albumIds: [] };
                        
                        if (projType === "EP") {
                          // For EP creation: show tracks where song.inProjects.albumIds.length === 0 AND song.inProjects.epIds.length === 0
                          return track.inProjects.albumIds.length === 0 && track.inProjects.epIds.length === 0;
                        } else {
                          // For Album creation: show tracks where song.inProjects.albumIds.length === 0 (EP usage is allowed)
                          return track.inProjects.albumIds.length === 0;
                        }
                      });
                      
                      return availableTracks.map((track) => {
                        // Initialize inProjects if missing
                        track.inProjects ??= { epIds: [], albumIds: [] };
                        
                        const isOnEP = track.inProjects.epIds.length > 0;
                        const isOnAlbum = track.inProjects.albumIds.length > 0;
                        
                        return (
                          <label key={track.id} className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(project.trackIds ?? []).includes(track.id)}
                              onChange={() => {
                                const newTrackIds = (project.trackIds ?? []).includes(track.id)
                                  ? (project.trackIds ?? []).filter(id => id !== track.id)
                                  : [...(project.trackIds ?? []), track.id];
                                
                                dispatch({
                                  type: "UPDATE_DRAFT_PROJECT",
                                  payload: { projectId: project.id, trackIds: newTrackIds }
                                });
                              }}
                              className="accent-white/80"
                            />
                            <div className="flex-1">
                              <div className="font-medium">{track.title ?? "—"}</div>
                              <div className={`${brand.dim} text-xs`}>
                                {track.weekReleased ? 'Released' : 'Draft'} • Quality {track.quality ?? "—"}
                                {isOnEP && <span className="text-blue-400 ml-1">• On EP</span>}
                                {isOnAlbum && <span className="text-red-400 ml-1">• On Album</span>}
                              </div>
                            </div>
                          </label>
                        );
                      });
                    })()}
                  </div>
                  <div className={`${brand.dim} text-xs mt-2`}>
                    {projType === "EP" 
                      ? "EPs can use any available tracks" 
                      : "Albums can reuse songs from EPs, but not from other albums"
                    }
                  </div>
                </div>

                {/* Release button */}
                <button
                  onClick={() => {
                    dispatch({ type: "RELEASE_PROJECT", payload: { projectId: project.id } });
                    // Navigate to released library after releasing
                    setTimeout(() => setStudioView("released"), 1000);
                  }}
                  disabled={(project.trackIds ?? []).length < rules.min || (project.trackIds ?? []).length > rules.max}
                  className={`w-full rounded-lg px-4 py-2 font-semibold ${
                    (project.trackIds ?? []).length >= rules.min && (project.trackIds ?? []).length <= rules.max
                      ? `bg-gradient-to-br ${brand.blueGrad}`
                      : 'bg-white/10 cursor-not-allowed'
                  }`}
                >
                  Release {project.type}
                </button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {(state.projectsDraft ?? []).length === 0 && (
        <Panel>
          <div className={`${brand.dim} text-center py-8`}>
            No draft projects yet. Create one above to get started.
          </div>
        </Panel>
      )}
    </div>
  );
}

function ReleasedLibraryPanel({ state }) {
  const [activeTab, setActiveTab] = useState("songs");

  // Filter releases by kind
  const songs = (state.releases ?? []).filter(r => r.kind === "song");
  const projects = (state.releases ?? []).filter(r => r.kind === "project");

  return (
    <div className="grid gap-4">
      {/* Tabs */}
      <Panel className="p-0 overflow-hidden">
        <div className="flex">
          {["songs", "projects"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-semibold ${activeTab === tab ? "bg-white/10" : "bg-white/[0.04]"}`}
            >
              {tab === "songs" ? "Songs" : "Projects"}
            </button>
          ))}
        </div>
      </Panel>

      {/* Songs Tab */}
      {activeTab === "songs" && (
        <Panel>
          <div className="font-semibold mb-3">Released Songs</div>
          {songs.length === 0 ? (
            <div className={`${brand.dim} text-center py-8`}>
              No released songs yet.
            </div>
          ) : (
            <div className="space-y-2">
              {songs.map((song) => {
                // Initialize sales fields if missing
                song.salesHistory ??= [];
                song.salesLifetime ??= 0;
                song.salesFirstWeek ??= null;
                song.cert ??= null;
                
                const streams = lifetimeStreams(song);
                const firstWeek = firstWeekStreams(song);
                const week1Sales = song.salesFirstWeek ?? 0;
                const lifetimeSales = song.salesLifetime ?? 0;
                const cert = song.cert;
                
                return (
                  <div key={song.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <div className="flex-1">
                      <div className="font-semibold">{song.title ?? "—"}</div>
                      <div className={`${brand.dim} text-xs`}>
                        Week {song.weekReleased ?? "—"} • Quality {song.quality ?? "—"}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-sm">
                        <div>Lifetime: {safeNum(streams).toLocaleString()}</div>
                        <div>Week 1: {safeNum(firstWeek).toLocaleString()}</div>
                        <div>Week 1 Sales: {safeNum(week1Sales).toLocaleString()} units</div>
                        <div>Lifetime Sales: {safeNum(lifetimeSales).toLocaleString()} units</div>
                      </div>
                      {cert && (
                        <div className={`text-xs px-2 py-1 rounded ${
                          cert.label === 'Diamond' ? 'bg-purple-500/20 text-purple-300' :
                          cert.label === 'Platinum' ? 'bg-gray-500/20 text-gray-300' :
                          'bg-yellow-500/20 text-yellow-300'
                        }`}>
                          {cert.label}{cert.times > 1 ? ` ×${cert.times}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {/* Projects Tab */}
      {activeTab === "projects" && (
        <Panel>
          <div className="font-semibold mb-3">Released Projects</div>
          {projects.length === 0 ? (
            <div className={`${brand.dim} text-center py-8`}>
              No released projects yet.
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => {
                // Initialize sales fields if missing
                project.salesHistory ??= [];
                project.salesLifetime ??= 0;
                project.salesFirstWeek ??= null;
                project.cert ??= null;
                
                const projectTracks = (state.releases ?? []).filter(r => r.kind !== "project" && (project.trackIds ?? []).some(trackId => trackId === r.id));
                const totalStreams = projectTracks.reduce((sum, track) => sum + lifetimeStreams(track), 0);
                const projectFirstWeekStreams = projectTracks.reduce((sum, track) => sum + firstWeekStreams(track), 0);
                const week1Sales = project.salesFirstWeek ?? 0;
                const lifetimeSales = project.salesLifetime ?? 0;
                const cert = project.cert;
                
                return (
                  <div key={project.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <div className="flex-1">
                      <div className="font-semibold">{project.title ?? "—"}</div>
                      <div className={`${brand.dim} text-xs`}>
                        {project.projectType ?? project.type ?? "—"} • {(project.trackIds ?? []).length} tracks • Week {project.weekReleased ?? "—"}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-sm">
                        <div>Tracks: {(project.trackIds ?? []).length}</div>
                        <div>Week 1: {safeNum(projectFirstWeekStreams).toLocaleString()} streams</div>
                        <div>Lifetime: {safeNum(totalStreams).toLocaleString()} streams</div>
                        <div>Week 1 Sales: {safeNum(week1Sales).toLocaleString()} units</div>
                        <div>Lifetime Sales: {safeNum(lifetimeSales).toLocaleString()} units</div>
                      </div>
                      {cert && (
                        <div className={`text-xs px-2 py-1 rounded ${
                          cert.label === 'Diamond' ? 'bg-purple-500/20 text-purple-300' :
                          cert.label === 'Platinum' ? 'bg-gray-500/20 text-gray-300' :
                          'bg-yellow-500/20 text-yellow-300'
                        }`}>
                          {cert.label}{cert.times > 1 ? ` ×${cert.times}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

// --------- MEDIA (Charts inside)
function Media({ state, dispatch, setTab }) {
  const [mediaTab, setMediaTab] = useState("Promo"); // "Promo" | "Charts"
  const hasRelease = state.releases.length > 0;

  const handleSaveClick = async () => {
    const alert = await handleSave(state);
    dispatch({ type: "ALERT", payload: alert });
  };

  return (
    <Page>
      <HeaderBar
        title="Media"
        subtitle="Social & Charts"
        right={
          <>
            <TimeDisplay time={state.time} />
            <SaveButton onSave={handleSaveClick} />
            <SettingsButton onOpen={() => setTab("Settings")} />
          </>
        }
      />

      <Section className="pb-28 md:pb-32">
        <Card className="p-0 overflow-hidden">
          <div className="flex border-b border-white/10">
            {[
              { key: "Promo", label: "Promo", icon: "📢" },
              { key: "Charts", label: "Charts", icon: "📊" }
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setMediaTab(t.key)}
                className={`flex-1 py-3 px-4 text-sm font-semibold transition-colors ${
                  mediaTab === t.key 
                    ? "bg-white/10 text-white border-b-2 border-blue-400" 
                    : "bg-white/[0.02] text-white/70 hover:bg-white/[0.05]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {mediaTab === "Promo" && (
              <div className="grid gap-3">
                <div className="font-semibold text-lg">Social & Promotion</div>
                
                {/* Swiftly App */}
                <Card className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-blue-500/20">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={swiftlyStyles.appIcon}>
                      {state.social?.swiftlyIconPath ? (
                        <img
                          src={state.social.swiftlyIconPath}
                          alt="Swiftly"
                          className={swiftlyStyles.appIconImg}
                          onError={(e) => {
                            // Fallback to emoji if image fails to load
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div className={`w-full h-full flex items-center justify-center text-2xl ${state.social?.swiftlyIconPath ? 'hidden' : 'flex'}`}>
                        📱
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-white">Swiftly</div>
                      <div className="text-sm text-blue-300">
                        {state.social?.followers || 0} followers • Social media app
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setTab("Swiftly")}
                    className="w-full rounded-xl px-4 py-2 font-semibold bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] text-white hover:from-[#2563EB] hover:to-[#1E40AF] transition-all"
                  >
                    Open Swiftly
                  </button>
                </Card>
                
                <div className="text-neutral-400 text-sm">
                  More social features coming soon...
                </div>
              </div>
            )}
            {mediaTab === "Charts" &&
              (hasRelease ? (
                <ChartsInner state={state} />
              ) : (
                <div className="grid gap-2 text-center py-8">
                  <div className="text-lg font-semibold">Charts Locked</div>
                  <div className="text-neutral-400">
                    Release at least one single or project to unlock Charts.
                  </div>
                </div>
              ))}
          </div>
        </Card>
      </Section>
    </Page>
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

// --------- SWIFTLY SOCIAL APP
function Swiftly({ state, dispatch, setTab }) {
  const [swiftlyTab, setSwiftlyTab] = useState("Home");
  const [composeText, setComposeText] = useState("");
  const [composeImage, setComposeImage] = useState(null);
  const [showComments, setShowComments] = useState({});
  const [commentText, setCommentText] = useState({});
  const [localAssets, setLocalAssets] = useState(null);

  // Load assets when component mounts (only once)
  useEffect(() => {
    if (state.social && !localAssets) {
      console.log('Swiftly component: Loading assets...');
      ensureSwiftlyAssetsLoaded(state).then(updatedState => {
        console.log('Swiftly component: Assets loaded, updating local state');
        setLocalAssets(updatedState);
        // Also update the global state
        if (updatedState !== state) {
          dispatch({ type: "LOAD", payload: updatedState });
        }
      }).catch(error => {
        console.error('Swiftly component: Failed to load assets:', error);
      });
    }
  }, []); // Only run once when component mounts

  // Prune old posts when component mounts
  useEffect(() => {
    if (state.social && state.time) {
      try {
        const prunedState = pruneOldSwiftlyPosts(state);
        if (prunedState !== state) {
          dispatch({ type: "LOAD", payload: prunedState });
        }
      } catch (error) {
        console.error('Error pruning Swiftly posts in component:', error);
        // Continue with original state if pruning fails
      }
    }
  }, [state.social, state.time, dispatch]);

  // Debug logging (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Swiftly component state:', {
        social: state.social,
        player: state.player,
        accounts: state.social?.accounts,
        gx: state.social?.accounts?.find(a => a.kind === 'gx'),
        stats: state.social?.accounts?.find(a => a.kind === 'stats'),
        placeholder: state.social?.placeholderDataURL,
        iconPath: state.social?.swiftlyIconPath
      });
    }
  }, [state]);

  // Helper functions for image handling
  const fileToDataURL = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const resizeDataURL = async (dataURL, maxSize) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = dataURL;
    });
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        const dataURL = await fileToDataURL(file);
        const resizedDataURL = await resizeDataURL(dataURL, 800);
        setComposeImage(resizedDataURL);
      } catch (error) {
        console.error('Image processing failed:', error);
        alert('Failed to process image. Please try again.');
      }
    }
  };

  const handleProfilePhotoUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        const dataURL = await fileToDataURL(file);
        const resizedDataURL = await resizeDataURL(dataURL, 256);
        dispatch({ type: "SWIFTLY_UPDATE_PROFILE_PHOTO", payload: { imageDataURL: resizedDataURL } });
      } catch (error) {
        console.error('Profile photo processing failed:', error);
        alert('Failed to process profile photo. Please try again.');
      }
    }
  };

  const handleCreatePost = () => {
    if (!composeText.trim() && !composeImage) {
      alert('Please add some text or an image to your post.');
      return;
    }

    dispatch({
      type: "SWIFTLY_CREATE_POST",
      payload: { text: composeText, imageDataURL: composeImage }
    });

    setComposeText("");
    setComposeImage(null);
    setSwiftlyTab("Home");
  };

  const handleLikePost = (postId) => {
    dispatch({ type: "SWIFTLY_LIKE_POST", payload: { postId } });
  };

  const handleCommentPost = (postId) => {
    const text = commentText[postId] || "";
    if (!text.trim()) return;

    dispatch({
      type: "SWIFTLY_COMMENT_POST",
      payload: { postId, text }
    });

    setCommentText({ ...commentText, [postId]: "" });
  };

  const toggleComments = (postId) => {
    setShowComments({
      ...showComments,
      [postId]: !showComments[postId]
    });
  };

  const getAccount = (id) => {
    return state.social?.accounts?.find(a => a.id === id) || {
      handle: "Unknown",
      displayName: "Unknown User",
      kind: "npc",
      avatarType: "gradient"
    };
  };



  const getSwiftlyAvatarURL = (account) => {
    // Use local assets if available, otherwise fall back to global state
    const effectiveState = localAssets || state;
    
    // Player
    if (account.kind === 'player') {
      return effectiveState.player?.profilePhotoDataURL || effectiveState.social?.placeholderDataURL || null;
    }
    // Official accounts
    if (account.kind === 'gx' || account.kind === 'stats') {
      return account.avatarDataURL || effectiveState.social?.placeholderDataURL || null;
    }
    // Industry and Trending accounts: gradient by default
    if (account.kind === 'industry' || account.kind === 'trending') {
      return null; // Use gradient avatar
    }
    // NPCs: gradient by default
    if (account.avatarType === 'gradient') return null;
    return account.avatarDataURL || effectiveState.social?.placeholderDataURL || null;
  };







  const renderAvatar = (account) => {
    const avatarURL = getSwiftlyAvatarURL(account);
    
    if (avatarURL) {
      return (
        <div className="relative">
          <img
            src={avatarURL}
            alt={`${account.displayName} avatar`}
            className={swiftlyStyles.avatar}
            onError={(e) => {
              // Fallback to gradient if image fails to load
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          {/* Gradient fallback (hidden by default) */}
          <div
            className={`${swiftlyStyles.avatarGradient} absolute inset-0`}
            style={{ background: gradientFromSeed(account.seed || account.id), display: 'none' }}
          >
            {account.displayName.charAt(0).toUpperCase()}
          </div>
        </div>
      );
    }
    
    // Gradient fallback for NPCs or official accounts that should use gradients
    return (
      <div
        className={swiftlyStyles.avatarGradient}
        style={{ background: gradientFromSeed(account.seed || account.id) }}
      >
        {account.displayName.charAt(0).toUpperCase()}
      </div>
    );
  };

  const renderPostCard = (post) => {
    const account = getAccount(post.authorId);
    const isLiked = post.likedBy?.includes("player") || false;
    const canLike = (state.limits?.likesThisWeek?.[post.id] || 0) < 3;
    const canComment = (state.limits?.commentsThisWeek?.[post.id] || 0) < 3;

    return (
      <Card key={post.id} className="mb-4">
        <div className={`${swiftlyStyles.postHeader} mb-3`}>
          {renderAvatar(account)}
          <div className={swiftlyStyles.meta}>
            <div className={swiftlyStyles.name}>
              {account.displayName} <span className="handle">@{account.handle}</span>
              {account.verified && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 bg-blue-500 rounded-full text-white text-xs font-bold">
                  ✓
                </span>
              )}
            </div>
            <div className={swiftlyStyles.sub}>
              Week {post.week}
            </div>
          </div>
        </div>
        
        <div className="mb-3">
          <div className="text-white whitespace-pre-wrap">{post.text}</div>
          {post.imageDataURL && (
            <img
              src={post.imageDataURL}
              alt={post.alt || "Post image"}
              className="mt-3 w-full rounded-xl max-w-full"
            />
          )}
        </div>
        
        <div className="flex items-center gap-4 text-sm">
          <button
            onClick={() => handleLikePost(post.id)}
            disabled={!canLike && !isLiked}
            className={`flex items-center gap-2 ${isLiked ? 'text-red-400' : 'text-neutral-400'} hover:text-red-300 transition-colors disabled:opacity-50`}
          >
            <span className="text-lg">{isLiked ? '❤️' : '🤍'}</span>
            <span>{post.likes || 0}</span>
          </button>
          
          <button
            onClick={() => toggleComments(post.id)}
            className="flex items-center gap-2 text-neutral-400 hover:text-neutral-300 transition-colors"
          >
            <div className="text-lg">💬</div>
            <span>{post.comments?.length || 0}</span>
          </button>
          
          <div className="flex items-center gap-2 text-neutral-400">
            <span className="text-lg">📊</span>
            <span>{post.views ? post.views.toLocaleString() : '0'}</span>
          </div>
        </div>
        
        {/* Comments section */}
        {showComments[post.id] && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <div className="space-y-2 mb-3">
              {post.comments?.slice(0, 5).map((comment) => {
                const commentAccount = getAccount(comment.userId);
                return (
                  <div key={comment.id} className="flex items-start gap-2">
                    {renderAvatar(commentAccount)}
                    <div className="flex-1">
                      <div className="text-sm">
                        <span className="font-semibold text-white">
                          {commentAccount.displayName}
                          {commentAccount.verified && (
                            <span className="ml-1 inline-flex items-center justify-center w-3 h-3 bg-blue-500 rounded-full text-white text-xs font-bold">
                              ✓
                            </span>
                          )}
                        </span>
                        <span className="text-neutral-400 ml-2">{comment.text}</span>
                      </div>
                      <div className="text-neutral-400 text-xs">Week {comment.week}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Show more comments indicator if there are more than 5 */}
            {post.comments && post.comments.length > 5 && (
              <div className="text-center text-neutral-400 text-sm mb-3">
                +{post.comments.length - 5} more comments
              </div>
            )}
            
            {canComment && (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add a comment..."
                  value={commentText[post.id] || ""}
                  onChange={(e) => setCommentText({
                    ...commentText,
                    [post.id]: e.target.value
                  })}
                  className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm outline-none border border-white/10"
                  maxLength={100}
                />
                <button
                  onClick={() => handleCommentPost(post.id)}
                  disabled={!commentText[post.id]?.trim()}
                  className="rounded-lg px-3 py-2 bg-blue-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Post
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    );
  };

  const renderHome = () => {
    const allPosts = [
      ...(state.social?.posts || []),
      ...(state.social?.feed || [])
    ].sort((a, b) => {
      // Sort by createdWeek first (most recent first), then by week as fallback
      const aCreated = a.createdWeek || a.week || 0;
      const bCreated = b.createdWeek || b.week || 0;
      return bCreated - aCreated;
    });

    // Debug logging for posts being rendered
    if (process.env.NODE_ENV === 'development') {
      console.log('Swiftly renderHome - All posts:', allPosts.map(p => ({
        authorId: p.authorId,
        week: p.week,
        createdWeek: p.createdWeek,
        text: p.text.substring(0, 30) + '...'
      })));
    }

    return (
      <div>
        <div className="font-semibold text-lg mb-4">Timeline</div>
        {allPosts.length === 0 ? (
          <div className="text-neutral-400 text-center py-8">
            No posts yet. Be the first to post something!
          </div>
        ) : (
          allPosts.map(renderPostCard)
        )}
      </div>
    );
  };

  const renderCompose = () => {
    return (
      <div>
        <div className="font-semibold text-lg mb-4">Create Post</div>
        <Card>
          <textarea
            placeholder="What's on your mind? (max 240 characters)"
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
            maxLength={240}
            className="w-full rounded-xl bg-white/5 px-3 py-2 py-3 outline-none border border-white/10 mb-3 resize-none"
            rows={4}
          />
          
          <div className="flex items-center gap-3 mb-3">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <span className="rounded-lg px-3 py-2 bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">
                📷 Attach Image
              </span>
            </label>
            {composeImage && (
              <button
                onClick={() => setComposeImage(null)}
                className="rounded-lg px-3 py-2 bg-red-500/20 text-red-300 text-sm hover:bg-red-500/30 transition-colors"
              >
                Remove Image
              </button>
            )}
          </div>
          
          {composeImage && (
            <div className="mb-3">
              <img
                src={composeImage}
                alt="Post image preview"
                className="w-full rounded-xl max-w-full max-h-64 object-cover"
              />
            </div>
          )}
          
          <div className="flex items-center justify-between">
            <div className="text-sm text-neutral-400">
              Energy cost: 2⚡ • {240 - composeText.length} characters left
            </div>
            <button
              onClick={handleCreatePost}
              disabled={(!composeText.trim() && !composeImage) || state.stats.energy < 2}
              className="rounded-xl px-4 py-2 font-semibold bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Post (2⚡)
            </button>
          </div>
        </Card>
      </div>
    );
  };

  const renderProfile = () => {
    const playerAccount = (state.social?.accounts || []).find(a => a.id === "player");
    const playerPosts = (state.social?.posts || []).filter(p => p.authorId === "player");

    return (
      <div>
        <div className="font-semibold text-lg mb-4">Profile</div>
        
        {/* Profile Header */}
        <Card className="text-center mb-4">
          <div className="mb-3">
            {state.player?.profilePhotoDataURL ? (
              <img
                src={state.player.profilePhotoDataURL}
                alt="Profile photo"
                className="w-20 h-20 rounded-full object-cover mx-auto border-2 border-white/20"
              />
            ) : state.social?.placeholderDataURL ? (
              <img
                src={state.social.placeholderDataURL}
                alt="Default profile photo"
                className="w-20 h-20 rounded-full object-cover mx-auto border-2 border-white/20"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] mx-auto flex items-center justify-center text-white text-2xl font-bold">
                {state.profile?.artistName?.charAt(0)?.toUpperCase() || "A"}
              </div>
            )}
          </div>
          
          <div className="font-semibold text-xl text-white mb-1 flex items-center justify-center gap-2">
            {state.profile?.artistName || "Artist"}
            {playerAccount?.verified && (
              <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-500 rounded-full text-white text-sm font-bold">
                ✓
              </span>
            )}
          </div>
          <div className="text-neutral-400 mb-3">
            @{playerAccount?.handle || "artist"}
          </div>
          
          <div className="text-2xl font-bold text-blue-400 mb-3">
            {state.social?.followers || 0} followers
          </div>
          
          {/* Engagement Stats */}
          <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
            <div className="text-center">
              <div className="text-white font-semibold">
                {state.social?.posts?.length || 0}
              </div>
              <div className="text-neutral-400">Posts</div>
            </div>
            <div className="text-center">
              <div className="text-white font-semibold">
                {state.social?.posts?.reduce((sum, p) => sum + (p.likes || 0), 0) || 0}
              </div>
              <div className="text-neutral-400">Total Likes</div>
            </div>
          </div>
          
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={handleProfilePhotoUpload}
              className="hidden"
            />
            <span className="rounded-lg px-3 py-2 bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">
              📷 Edit Profile Photo
            </span>
          </label>
        </Card>
        
        {/* Recent Posts */}
        <div className="font-semibold text-lg mb-3">Recent Posts</div>
        {playerPosts.length === 0 ? (
          <div className="text-neutral-400 text-center py-8">
            No posts yet. Start sharing your thoughts!
          </div>
        ) : (
          playerPosts.slice(0, 5).map(renderPostCard)
        )}
      </div>
    );
  };

  const renderDiscover = () => {
    const gossipPosts = state.social?.feed?.filter(p => p.authorId === "gossipxra") || [];
    const statsPosts = state.social?.feed?.filter(p => p.authorId === "statsfinder") || [];
    const industryPosts = state.social?.feed?.filter(p => p.authorId === "industry") || [];
    const trendingPosts = state.social?.feed?.filter(p => p.authorId === "trending") || [];
    const npcPosts = state.social?.feed?.filter(p => {
      const account = getAccount(p.authorId);
      return account.kind === "npc";
    }) || [];

    return (
      <div>
        <div className="font-semibold text-lg mb-4">Discover</div>
        
        {/* GossipXtra Stream */}
        <Card className="mb-4">
          <div className="font-semibold mb-3 text-blue-400">📰 GossipXtra</div>
          {gossipPosts.length === 0 ? (
            <div className="text-neutral-400 text-sm">No gossip posts yet.</div>
          ) : (
            <div className="space-y-3">
              {gossipPosts.slice(0, 3).map(renderPostCard)}
            </div>
          )}
        </Card>
        
        {/* Stats Finder Stream */}
        <Card className="mb-4">
          <div className="font-semibold mb-3 text-green-400">📊 Stats Finder</div>
          {statsPosts.length === 0 ? (
            <div className="text-neutral-400 text-sm">No stats posts yet.</div>
          ) : (
            <div className="space-y-3">
              {statsPosts.slice(0, 3).map(renderPostCard)}
            </div>
          )}
        </Card>
        
        {/* Industry News Stream */}
        <Card className="mb-4">
          <div className="font-semibold mb-3 text-orange-400">🏢 Industry News</div>
          {industryPosts.length === 0 ? (
            <div className="text-neutral-400 text-sm">No industry news yet.</div>
          ) : (
            <div className="space-y-3">
              {industryPosts.slice(0, 3).map(renderPostCard)}
            </div>
          )}
        </Card>
        
        {/* Trending Topics Stream */}
        <Card className="mb-4">
          <div className="font-semibold mb-3 text-pink-400">🔥 Trending Topics</div>
          {trendingPosts.length === 0 ? (
            <div className="text-neutral-400 text-sm">No trending topics yet.</div>
          ) : (
            <div className="space-y-3">
              {trendingPosts.slice(0, 3).map(renderPostCard)}
            </div>
          )}
        </Card>
        
        {/* NPC Carousel */}
        <Card>
          <div className="font-semibold mb-3 text-purple-400">👥 Community</div>
          {npcPosts.length === 0 ? (
            <div className="text-neutral-400 text-sm">No community posts yet.</div>
          ) : (
            <div className="space-y-3">
              {npcPosts.slice(0, 2).map(renderPostCard)}
            </div>
          )}
        </Card>
      </div>
    );
  };

  const renderSettings = () => {
    const playerAccount = (state.social?.accounts || []).find(a => a.id === "player");
    
    return (
      <div>
        <div className="font-semibold text-lg mb-4">Swiftly Settings</div>
        
        <Card className="mb-4">
          <div className="font-semibold mb-3">Account Status</div>
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400">Verification Status:</span>
              <span className={`font-semibold ${playerAccount?.verified ? 'text-blue-400' : 'text-neutral-400'}`}>
                {playerAccount?.verified ? '✅ Verified' : '⏳ Pending'}
              </span>
            </div>
            {!playerAccount?.verified && (
              <div className="text-xs text-neutral-500 bg-white/5 p-2 rounded">
                Reach 75,000+ followers to get verified! Current: {state.social?.followers || 0} followers
              </div>
            )}
          </div>
          
          <div className="font-semibold mb-3">Cache & Data</div>
          <div className="space-y-2">
            <button
              onClick={() => {
                if (confirm('Clear Swiftly cache? This will reset weekly limits but keep your posts and followers.')) {
                  dispatch({ type: "SWIFTLY_RESET_LIMITS" });
                  alert('Swiftly cache cleared!');
                }
              }}
              className="rounded-lg px-3 py-2 bg-orange-500/20 text-orange-300 text-sm hover:bg-orange-500/30 transition-colors"
            >
              🗑️ Clear Swiftly Cache
            </button>
            <button
              onClick={async () => {
                console.log('Manually reloading Swiftly assets...');
                try {
                  const updatedState = await ensureSwiftlyAssetsLoaded(state);
                  dispatch({ type: "LOAD", payload: updatedState });
                  alert('Swiftly assets reloaded! Check console for details.');
                } catch (error) {
                  console.error('Failed to reload assets:', error);
                  alert('Failed to reload assets. Check console for details.');
                }
              }}
              className="rounded-lg px-3 py-2 bg-blue-500/20 text-blue-300 text-sm hover:bg-blue-500/30 transition-colors"
            >
              🔄 Reload Assets
            </button>
            <button
              onClick={() => {
                if (confirm('Force update verification status? This will verify all official accounts.')) {
                  // Force update verification status
                  const updatedState = {
                    ...state,
                    social: {
                      ...state.social,
                      accounts: state.social.accounts.map(account => {
                        if (account.kind === 'gx' || account.kind === 'stats' || account.kind === 'industry' || account.kind === 'trending') {
                          return { ...account, verified: true };
                        }
                        return account;
                      })
                    }
                  };
                  dispatch({ type: "LOAD", payload: updatedState });
                  alert('Verification status updated! Official accounts should now show verified badges.');
                }
              }}
              className="rounded-lg px-3 py-2 bg-green-500/20 text-green-300 text-sm hover:bg-green-500/30 transition-colors"
            >
              ✅ Force Verify Official Accounts
            </button>
          </div>
        </Card>
        
        <Card>
          <div className="font-semibold mb-3">About Swiftly</div>
          <div className="text-sm text-neutral-400 space-y-2">
            <div>• Share your thoughts and music journey</div>
            <div>• Connect with other artists and fans</div>
            <div>• Get industry insights from GossipXtra</div>
            <div>• Track your stats with Stats Finder</div>
            <div>• Stay updated with Industry News</div>
            <div>• Discover Trending Topics and viral content</div>
            <div>• Posts cost 2⚡ energy</div>
            <div>• Player posts last 52 weeks, NPC posts expire after 2 weeks</div>
          </div>
        </Card>
      </div>
    );
  };

  return (
    <Page>
      <HeaderBar
        title="Swiftly"
        subtitle="Social Media"
        right={
          <button
            onClick={() => setTab("Media")}
            className="rounded-xl px-3 py-2 bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
          >
            ← Back
          </button>
        }
      />

      <Section className="pb-28 md:pb-32">
        {/* Swiftly Tabs */}
        <Card className="p-0 overflow-hidden mb-4">
          <div className="flex border-b border-white/10">
            {[
              { key: "Home", label: "Home", icon: "🏠" },
              { key: "Compose", label: "Compose", icon: "✏️" },
              { key: "Profile", label: "Profile", icon: "👤" },
              { key: "Discover", label: "Discover", icon: "🔍" },
              { key: "Settings", label: "Settings", icon: "⚙️" }
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setSwiftlyTab(t.key)}
                className={`flex-1 py-3 px-2 text-xs font-semibold transition-colors ${
                  swiftlyTab === t.key 
                    ? "bg-white/10 text-white border-b-2 border-blue-400" 
                    : "bg-white/[0.02] text-white/70 hover:bg-white/[0.05]"
                }`}
              >
                <div className="text-sm mb-1">{t.icon}</div>
                {t.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Tab Content */}
        {swiftlyTab === "Home" && renderHome()}
        {swiftlyTab === "Compose" && renderCompose()}
        {swiftlyTab === "Profile" && renderProfile()}
        {swiftlyTab === "Discover" && renderDiscover()}
        {swiftlyTab === "Settings" && renderSettings()}
      </Section>
    </Page>
  );
}

// --------- ACTIVITIES
function Activities({ state, dispatch, setTab }) {
  const [showGigs, setShowGigs] = useState(false);
  const [showInterviews, setShowInterviews] = useState(false);

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

  const handleSaveClick = async () => {
    const alert = await handleSave(state);
    dispatch({ type: "ALERT", payload: alert });
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
    <Page>
      <HeaderBar
        title="Activities"
        subtitle="Skills • Jobs • Shop • Finance"
        right={
          <>
            <TimeDisplay time={state.time} />
            <SaveButton onSave={handleSaveClick} />
            <SettingsButton onOpen={() => setTab("Settings")} />
          </>
        }
      />
      
      <Section className="pb-28 md:pb-32">
        {/* Event Booking Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Card className="text-center">
            <div className="text-2xl mb-2">🎸</div>
            <div className="font-semibold mb-2">Book Gigs</div>
            <div className="text-neutral-400 text-sm mb-3">
              {state.events.scheduled.filter((e) => e.type === "gig").length}/5
              scheduled
            </div>
            <button
              onClick={() => setShowGigs(!showGigs)}
              className={`rounded-xl px-4 py-2 font-semibold ${showGigs ? "bg-white/10" : "bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8]"}`}
            >
              {showGigs ? "Hide Offers" : "View Offers"}
            </button>
          </Card>

          <Card className="text-center">
            <div className="text-2xl mb-2">🎤</div>
            <div className="font-semibold mb-2">Book Interviews</div>
            <div className="text-neutral-400 text-sm mb-3">
              {
                state.events.scheduled.filter((e) => e.type === "interview")
                  .length
              }
              /3 scheduled
            </div>
            <button
              onClick={() => setShowInterviews(!showInterviews)}
              className={`rounded-xl px-4 py-2 font-semibold ${showInterviews ? "bg-white/10" : "bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8]"}`}
            >
              {showInterviews ? "Hide Offers" : "View Offers"}
            </button>
          </Card>
        </div>

        {/* Gigs Panel */}
        {showGigs && (
          <Card className="mb-4">
            <div className="font-semibold text-lg mb-3">Available Gigs</div>
            {state.events.offers.gigs.length === 0 ? (
              <div className="text-neutral-400 text-center py-4">
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
                          {offer.subType === "arena" || offer.subType === "festival" ? (
                            <span className="text-yellow-400 ml-2 text-xs">★ Rare</span>
                          ) : null}
                        </div>
                        <div className="text-neutral-400 text-sm">
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
          </Card>
        )}

        {/* Interviews Panel */}
        {showInterviews && (
          <Card className="mb-4">
            <div className="font-semibold text-lg mb-3">Available Interviews</div>
            {state.events.offers.interviews.length === 0 ? (
              <div className="text-neutral-400 text-center py-4">
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
                        <div className="text-neutral-400 text-sm">
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
          </Card>
        )}

        <div className="grid gap-4">
          <Card>
            <div className="font-semibold mb-1">Skills (coming soon)</div>
            <div className="text-neutral-400">
              Upskill to improve song quality, promo impact, and earnings.
            </div>
          </Card>
          <Card>
            <div className="font-semibold mb-1">Jobs (coming soon)</div>
            <div className="text-neutral-400">
              Take gigs to earn cash, gain rep, or recover inspiration.
            </div>
          </Card>
          <Card>
            <div className="font-semibold mb-1">Shop (coming soon)</div>
            <div className="text-neutral-400">
              Buy gear and items that affect stats and production.
            </div>
          </Card>
          <Card>
            <div className="font-semibold mb-1">Finance (coming soon)</div>
            <div className="text-neutral-400">
              Track income and expenses from releases and activities.
            </div>
          </Card>
        </div>
      </Section>
    </Page>
  );
}

function Alerts({ state, dispatch }) {
  return (
    <Page>
      <HeaderBar title="Alerts" right={null} />
      <Section className="pb-28 md:pb-32">
        <div className="grid gap-2">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => dispatch({ type: "MARK_ALERTS_READ" })}
              className="rounded-xl px-3 py-2 bg-black/20 border border-white/10"
            >
              Mark all read
            </button>
          </div>
          {state.alerts.length === 0 && (
            <Card className="text-neutral-400">No alerts yet.</Card>
          )}
          {state.alerts.map((alert) => (
            <Card key={alert.id} className="text-neutral-400">
              {alert.msg}
            </Card>
          ))}
        </div>
      </Section>
    </Page>
  );
}

function Settings({ state, dispatch }) {
  return (
    <Page>
      <HeaderBar
        title="Settings"
        subtitle="Game Options & Controls"
        right={null}
      />
      <Section className="pb-28 md:pb-32">
        <div className="grid gap-4">
          <div className="flex justify-end mb-2 gap-2">
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="rounded-xl px-3 py-2 bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 transition-colors"
            >
              Reset to Startup
            </button>
            <button
              onClick={() => dispatch({ type: "DELETE_SAVE" })}
              className="rounded-xl px-3 py-2 bg-red-500/20 text-white hover:bg-red-500/30 transition-colors"
            >
              Delete Save
            </button>
          </div>
          <Card>
            <div className="font-semibold mb-2">Game Controls</div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Auto-save</span>
                <span className="text-green-400 text-sm">Enabled</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Sound effects</span>
                <span className="text-green-400 text-sm">On</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Music</span>
                <span className="text-white/60 text-sm">Off</span>
              </div>
            </div>
          </Card>
          
          <Card>
            <div className="font-semibold mb-2">Profile Photo</div>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {state.player?.profilePhotoDataURL ? (
                  <img
                    src={state.player.profilePhotoDataURL}
                    alt="Profile photo"
                    className="w-16 h-16 rounded-full object-cover border-2 border-white/20"
                  />
                ) : state.social?.placeholderDataURL ? (
                  <img
                    src={state.social.placeholderDataURL}
                    alt="Default profile photo"
                    className="w-16 h-16 rounded-full object-cover border-2 border-white/20"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] flex items-center justify-center text-white text-xl font-bold">
                    {state.profile?.artistName?.charAt(0)?.toUpperCase() || "A"}
                  </div>
                )}
                <div>
                  <div className="text-sm text-white">Current Photo</div>
                  <div className="text-xs text-neutral-400">Used in Swiftly</div>
                </div>
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (event) => {
                    const file = event.target.files[0];
                    if (file) {
                      try {
                        const reader = new FileReader();
                        reader.onload = () => {
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const ctx = canvas.getContext('2d');
                            
                            let { width, height } = img;
                            if (width > height) {
                              if (width > 256) {
                                height = (height * 256) / width;
                                width = 256;
                              }
                            } else {
                              if (height > 256) {
                                width = (width * 256) / height;
                                height = 256;
                              }
                            }
                            
                            canvas.width = width;
                            canvas.height = height;
                            ctx.drawImage(img, 0, 0, width, height);
                            const dataURL = canvas.toDataURL('image/jpeg', 0.8);
                            
                            dispatch({ type: "SWIFTLY_UPDATE_PROFILE_PHOTO", payload: { imageDataURL: dataURL } });
                          };
                          img.src = reader.result;
                        };
                        reader.readAsDataURL(file);
                      } catch (error) {
                        console.error('Profile photo processing failed:', error);
                        alert('Failed to process profile photo. Please try again.');
                      }
                    }
                  }}
                  className="hidden"
                />
                <span className="rounded-lg px-3 py-2 bg-white/10 text-white text-sm hover:bg-white/20 transition-colors">
                  📷 Change Profile Photo
                </span>
              </label>
            </div>
          </Card>
          
          <Card>
            <div className="font-semibold mb-2">About</div>
            <div className="space-y-2 text-sm">
              <div>Sound Empire - Next</div>
              <div className="text-white/60">Music career simulation game</div>
              <div className="text-white/60">Version 1.0.0</div>
            </div>
          </Card>

          <Card>
            <div className="font-semibold mb-2">Save Data</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Last saved:</span>
                <span className="text-white/60">Just now</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Game time:</span>
                <span className="text-white/60">Week {state.time.week}, {state.time.year}</span>
              </div>
            </div>
          </Card>
        </div>
      </Section>
    </Page>
  );
}


function App() {
  const [state, dispatch] = useSavedReducer();
  const [tab, setTab] = useState("Home");

  // Check if we have a profile to determine what to show
  const hasProfile = state.profile && state.profile.artistName;
  const hasSave = localStorage.getItem(STORAGE_KEY) !== null;

  // If no profile, show startup screen
  if (!hasProfile) {
    return (
      <div className="bg-[#0b0b0f] min-h-screen flex flex-col">
        {tab === "Create" ? (
          <Create dispatch={dispatch} />
        ) : (
          <Startup 
            hasSave={hasSave} 
            onContinue={() => {
              // This would load the existing save
              // For now, just reload the page
              window.location.reload();
            }}
            onNewGame={() => setTab("Create")}
          />
        )}
      </div>
    );
  }

  // If we have a profile, show the main game
  return (
    <div className="bg-[#0b0b0f] min-h-screen flex flex-col">
      <main className="flex-1">
        {tab === "Home" && <Home state={state} dispatch={dispatch} setTab={setTab} />}
        {tab === "Studio" && <Studio state={state} dispatch={dispatch} setTab={setTab} />}
        {tab === "Media" && <Media state={state} dispatch={dispatch} setTab={setTab} />}
        {tab === "Activities" && <Activities state={state} dispatch={dispatch} setTab={setTab} />}
        {tab === "Settings" && <Settings state={state} dispatch={dispatch} />}
        {tab === "Alerts" && <Alerts state={state} dispatch={dispatch} />}
        {tab === "Swiftly" && <Swiftly state={state} dispatch={dispatch} setTab={setTab} />}
      </main>

      <BottomNav 
        tab={tab} 
        setTab={setTab} 
        onProgressWeek={() => dispatch({ type: "ADVANCE_WEEK" })} 
      />
    </div>
  );
}

export default App;
