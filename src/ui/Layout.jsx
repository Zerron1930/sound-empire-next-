import React from "react";

// ----- layout constants
const NAV_HEIGHT_PX = 64; // keep footer nav height consistent
const SHELL = "mx-auto w-full max-w-[420px] sm:max-w-3xl px-4"; // one container to rule them all

// Brand constants
const brand = {
  blueGrad: "from-[#3B82F6] to-[#1D4ED8]", // blue-500 → blue-700
  bg: "bg-[#0b0b0f]",
  panel: "bg-[#141418]",
  card: "bg-[#191a20]",
  ring: "ring-1 ring-white/5",
  dim: "text-neutral-400",
  glow: "shadow-[0_12px_36px_-12px_rgba(59,130,246,.45)]", // blue glow
};

// Main page wrapper with proper bottom padding for bottom nav
export const Page = ({ children, className = "" }) => (
  <div className={`min-h-[100dvh] pt-6 ${className}`}>
    {children}
  </div>
);

// Header bar with blue gradient background
export const HeaderBar = ({ title, subtitle, right, className = "" }) => (
  <div className={`${SHELL} mb-4 ${className}`}>
    <div className={`w-full h-28 rounded-2xl bg-gradient-to-br ${brand.blueGrad} ${brand.glow} p-5 flex items-end justify-between`}>
      <div>
        <div className="text-xl font-extrabold tracking-tight text-white">{title}</div>
        {subtitle && <div className="text-white/80 -mt-0.5">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-4">
        {right}
      </div>
    </div>
  </div>
);

// Content section with proper bottom padding to avoid bottom nav overlap
export const Section = ({ children, className = "" }) => (
  <div className={`${SHELL} ${className}`}>
    {children}
  </div>
);

// Card component with consistent styling
export const Card = ({ children, className = "" }) => (
  <div className={`rounded-2xl ${brand.card} ${brand.ring} p-4 ${className}`}>
    {children}
  </div>
);

// Time display component for year/week
export const TimeDisplay = ({ time }) => (
  <div className="mt-3">
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-white/15 rounded-lg border border-white/20 shadow-sm">
      <span className="text-sm font-semibold text-white">{time.year}</span>
      <span className="text-white/60 text-xs">•</span>
      <span className="text-sm text-white/90">Week {time.week}</span>
      </div>
  </div>
);

// Save button component
export const SaveButton = ({ onSave, className = "" }) => (
  <button
    onClick={onSave}
    className={`rounded-xl bg-white/10 p-2 hover:bg-white/15 transition-colors ${className}`}
    aria-label="Save Game"
    title="Save Game"
  >
    💾
  </button>
);

// Settings button component
export const SettingsButton = ({ onOpen, className = "" }) => (
  <button
    onClick={onOpen}
    className={`rounded-xl bg-white/10 p-2 hover:bg-white/15 transition-colors ${className}`}
    aria-label="Open Settings"
    title="Settings"
  >
    ⚙️
  </button>
);

// Bottom action wrapper for Progress Week button
export const BottomAction = ({ children }) => (
  <div
    className="fixed inset-x-0"
    style={{ bottom: `calc(${NAV_HEIGHT_PX}px + env(safe-area-inset-bottom,0px))` }}
  >
    <div className={`${SHELL} flex justify-center pointer-events-none`}>
      <div className="pointer-events-auto">{children}</div>
    </div>
  </div>
);

// Export constants for use in other components
export { NAV_HEIGHT_PX, SHELL, brand };

// Swiftly app icon styles
export const swiftlyStyles = {
  appIcon: "w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-200",
  appIconImg: "w-10 h-10 rounded-xl object-cover",
  avatar: "w-10 h-10 rounded-full object-cover border-2 border-gray-700",
  avatarGradient: "w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm",
  postHeader: "flex items-center gap-3 min-w-0",
  meta: "flex flex-col min-w-0",
  name: "font-semibold whitespace-nowrap overflow-hidden text-ellipsis",
  sub: "text-gray-400 text-sm whitespace-nowrap"
};
