"use client";

import { useEffect, useRef, useCallback } from "react";
import { Demo } from "@/lib/types";

interface DemoViewerProps {
  demo: Demo;
  onClose: () => void;
  onIdleTimeout: () => void;
}

export default function DemoViewer({ demo, onClose, onIdleTimeout }: DemoViewerProps) {
  const lastActivityRef = useRef(Date.now());
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const idleCheckRef = useRef<NodeJS.Timeout | null>(null);
  const activitySinceLastBeatRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    activitySinceLastBeatRef.current = true;
  }, []);

  useEffect(() => {
    // Activity detection on parent window (blur = user clicked into iframe)
    const handleBlur = () => resetActivity();
    const handleFocus = () => resetActivity();
    const handleMouseMove = () => resetActivity();

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("keydown", resetActivity);

    // Listen for postMessage activity signals from injected script in iframe
    const handleMessage = (e: MessageEvent) => {
      if (e.data === "demo-activity") {
        resetActivity();
      }
    };
    window.addEventListener("message", handleMessage);

    // Heartbeat: send every 30s only if activity occurred since last tick
    heartbeatRef.current = setInterval(async () => {
      if (activitySinceLastBeatRef.current) {
        activitySinceLastBeatRef.current = false;
        await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "heartbeat", demo_id: demo.id }),
        });
      }
    }, 30000);

    // Idle check: every 30s check if idle timeout exceeded
    const timeoutMs = (demo.idle_timeout_minutes || 15) * 60 * 1000;
    idleCheckRef.current = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= timeoutMs) {
        onIdleTimeout();
      }
    }, 30000);

    // Unlock on tab close
    const handleUnload = () => {
      navigator.sendBeacon(
        "/api/sessions",
        new Blob([JSON.stringify({ action: "unlock", demo_id: demo.id })], { type: "application/json" })
      );
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keydown", resetActivity);
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("beforeunload", handleUnload);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (idleCheckRef.current) clearInterval(idleCheckRef.current);
    };
  }, [demo.id, demo.idle_timeout_minutes, resetActivity, onIdleTimeout]);

  const iframeSrc = `/apps/${demo.proxy_path}/`;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Demos
          </button>
          <span className="text-sm font-medium text-gray-800">{demo.name}</span>
        </div>
        <span className="text-xs text-gray-500">
          Idle timeout: {demo.idle_timeout_minutes || 15} min
        </span>
      </div>
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        className="flex-1 w-full border-none min-h-0"
        title={demo.name}
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
