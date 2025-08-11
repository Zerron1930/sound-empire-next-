import React from "react";
import { NAV_HEIGHT_PX, SHELL } from "./Layout.jsx";

const Btn = ({ active, children, onClick }) => (
  <button
    onClick={onClick}
    className={[
      "h-12 px-4 rounded-2xl flex items-center justify-center gap-2 text-sm font-medium",
      active ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
    ].join(" ")}
  >
    {children}
  </button>
);

export default function BottomNav({ tab, setTab, onProgressWeek }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40">
      <div className="bg-black/40 backdrop-blur supports-[backdrop-filter]:backdrop-blur border-t border-white/10">
        <div className={`${SHELL} py-3 flex items-center justify-between gap-2 sm:gap-3`}>
          <Btn active={tab === "Home"} onClick={() => setTab("Home")}>
            🏠 Home
          </Btn>
          <Btn active={tab === "Studio"} onClick={() => setTab("Studio")}>
            🎵 Studio
          </Btn>

          {/* Center Progress button */}
          <button
            onClick={onProgressWeek}
            className="h-12 px-5 rounded-2xl bg-[#1f6fff] text-white font-semibold shadow-[0_8px_24px_-6px_rgba(31,111,255,.6)]"
          >
            » Progress Week
          </button>

          <Btn active={tab === "Media"} onClick={() => setTab("Media")}>
            📱 Media
          </Btn>
          <Btn active={tab === "Activities"} onClick={() => setTab("Activities")}>
            🎯 Activities
          </Btn>
        </div>
      </div>
      {/* Safe-area spacer so content never hides behind nav on mobile */}
      <div className="h-[env(safe-area-inset-bottom,0px)]" />
    </div>
  );
}
