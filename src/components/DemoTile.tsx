"use client";

import { Demo, DemoSession } from "@/lib/types";

interface DemoTileProps {
  demo: Demo;
  session?: DemoSession & { idle_seconds: number };
  currentUser?: string;
  isResuming?: boolean;
  onInfo: (demo: Demo) => void;
  onLaunch: (demo: Demo) => void;
  onRelease?: (demo: Demo) => void;
}

function formatIdleTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function DemoTile({ demo, session, currentUser, isResuming, onInfo, onLaunch, onRelease }: DemoTileProps) {
  const isLocked = !!session && session.locked_by !== currentUser;
  const isMySession = !!session && session.locked_by === currentUser;
  // External demos (no proxy_path) support multiple concurrent users — show "In Use" badge but don't disable Launch
  const isBlocked = isLocked && !!demo.proxy_path;

  return (
    <div className={`bg-white rounded-xl border overflow-hidden shadow-sm flex flex-col transition-all duration-200 ${
      isBlocked
        ? "border-red-200 opacity-75"
        : "border-gray-200 hover:shadow-lg hover:border-gray-300 group"
    }`}>
      <div className="aspect-video bg-gray-100 relative overflow-hidden">
        {demo.thumbnail_url ? (
          <img
            src={demo.thumbnail_url}
            alt={demo.name}
            className={`w-full h-full object-cover ${isBlocked ? "grayscale" : ""}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        <span className="absolute top-2 right-2 text-xs font-medium px-2 py-0.5 rounded-full bg-white/90 text-[var(--sf-dark)]">
          {demo.demo_type}
        </span>
        {!demo.proxy_path && (
          <span className="absolute bottom-2 right-2 text-[9px] font-medium px-1.5 py-0.5 rounded bg-gray-800/70 text-white flex items-center gap-0.5" title="Opens in new tab (separate login)">
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            New tab
          </span>
        )}
        {isLocked && (
          <div className="absolute top-2 left-2 text-xs font-medium px-2 py-0.5 rounded-full bg-red-500 text-white">
            In Use
          </div>
        )}
        {isMySession && (
          <div className="absolute top-2 left-2 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500 text-white">
            Your Session
          </div>
        )}
        {!isLocked && !isMySession && demo.service_status === "RUNNING" && (
          <div className="absolute top-2 left-2 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500 text-white">
            Active
          </div>
        )}
        {!isLocked && !isMySession && demo.service_name && demo.service_status && demo.service_status !== "RUNNING" && (
          <div className="absolute top-2 left-2 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-400 text-white">
            Inactive
          </div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-1">{demo.name}</h3>
        <p className="text-xs text-gray-500 mb-3 line-clamp-2 flex-1">{demo.short_description}</p>

        {isLocked && session && (
          <div className="mb-3 p-2 bg-red-50 rounded-lg border border-red-100">
            <p className="text-xs text-red-700 font-medium">Used by: {session.locked_by}</p>
            <p className="text-xs text-red-600">
              Timeout: {demo.idle_timeout_minutes} min | Idle: {formatIdleTime(session.idle_seconds)}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-1 mb-3">
          {(demo.topics || []).map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--sf-light)] text-[var(--sf-dark)] font-medium">
              {t}
            </span>
          ))}
          {(demo.capabilities || []).slice(0, 2).map((c) => (
            <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
              {c}
            </span>
          ))}
          {(demo.capabilities || []).length > 2 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              +{(demo.capabilities || []).length - 2}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          {isBlocked ? (
            <button
              disabled
              className="flex-1 text-center text-xs font-medium px-3 py-2 rounded-lg bg-gray-300 text-gray-500 cursor-not-allowed"
            >
              Unavailable
            </button>
          ) : isResuming ? (
            <button
              disabled
              className="flex-1 text-center text-xs font-medium px-3 py-2 rounded-lg bg-amber-500 text-white cursor-wait"
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Starting...
              </span>
            </button>
          ) : (
            <>
              <button
                onClick={() => onLaunch(demo)}
                className="flex-1 text-center text-xs font-medium px-3 py-2 rounded-lg bg-[var(--sf-blue)] text-white hover:bg-[var(--sf-dark)] transition-colors"
              >
                {isMySession ? "Resume" : "Launch"}
              </button>
              {isMySession && !demo.proxy_path && onRelease && (
                <button
                  onClick={() => onRelease(demo)}
                  className="text-xs font-medium px-3 py-2 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 transition-colors"
                >
                  Release
                </button>
              )}
            </>
          )}
          <button
            onClick={() => onInfo(demo)}
            className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Info
          </button>
        </div>
      </div>
    </div>
  );
}
