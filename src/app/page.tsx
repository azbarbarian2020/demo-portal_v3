"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Demo, DemoSession, DEFAULT_TOPICS, DEFAULT_CAPABILITIES } from "@/lib/types";
import FilterBar from "@/components/FilterBar";
import DemoGrid from "@/components/DemoGrid";
import DemoDetail from "@/components/DemoDetail";
import DemoViewer from "@/components/DemoViewer";

interface SessionWithIdle extends DemoSession {
  idle_seconds: number;
  idle_timeout_minutes: number;
}

export default function Home() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [sessions, setSessions] = useState<SessionWithIdle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([]);
  const [selectedDemo, setSelectedDemo] = useState<Demo | null>(null);
  const [topics, setTopics] = useState<string[]>(DEFAULT_TOPICS);
  const [capabilities, setCapabilities] = useState<string[]>(DEFAULT_CAPABILITIES);
  const [currentUser, setCurrentUser] = useState<string>("");
  const [viewingDemo, setViewingDemo] = useState<Demo | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const r = await fetch("/api/sessions");
      if (r.ok) {
        const data = await r.json();
        setSessions(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const fetchDemos = async (retries = 3): Promise<void> => {
      for (let i = 0; i < retries; i++) {
        try {
          const r = await fetch("/api/demos");
          if (!r.ok) throw new Error(`${r.status}`);
          const data = await r.json();
          if (Array.isArray(data)) {
            setDemos(data);
            setLoading(false);
            return;
          }
        } catch {
          if (i < retries - 1) await new Promise((res) => setTimeout(res, 1500));
        }
      }
      setLoading(false);
    };
    fetchDemos();
    fetchSessions();

    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.topics) setTopics(data.topics);
        if (data.capabilities) setCapabilities(data.capabilities);
      })
      .catch(() => {});

    // Poll sessions every 10 seconds for live idle timer updates
    const sessionInterval = setInterval(fetchSessions, 10000);
    // Poll demos every 30 seconds for live service status updates
    const demoInterval = setInterval(async () => {
      try {
        const r = await fetch("/api/demos");
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data)) setDemos(data);
        }
      } catch { /* ignore */ }
    }, 30000);
    return () => { clearInterval(sessionInterval); clearInterval(demoInterval); };
  }, [fetchSessions]);

  // Detect current user
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setCurrentUser(data.user);
      })
      .catch(() => {});
  }, []);

  // Clear stale active_demo cookie when portal page is displayed (not viewing a demo).
  // This prevents the middleware from rewriting portal "/" requests if the cookie
  // persisted from a previous iframe session (e.g., browser refresh after crash).
  useEffect(() => {
    if (!viewingDemo) {
      document.cookie = "active_demo=;path=/;max-age=0";
    }
  }, [viewingDemo]);

  const [resumingDemo, setResumingDemo] = useState<number | null>(null);

  const handleLaunch = useCallback(async (demo: Demo) => {
    if (!demo.proxy_path) {
      if (!demo.entry_url) {
        alert("This demo has no launch URL configured.");
        return;
      }
      // External demos: acquire session lock to show "in use" status, then open in new tab.
      // Don't block launch if lock fails — external apps often support multiple users.
      try {
        await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "lock", demo_id: demo.id }),
        });
      } catch {
        // Network error is non-fatal for external demos — still open the tab
      }
      const url = demo.entry_url.startsWith("http") ? demo.entry_url : `https://${demo.entry_url}`;
      window.open(url, "_blank");
      fetchSessions();
      return;
    }

    // If service is inactive and auto-resume is enabled, resume first
    if (demo.service_name && demo.auto_resume_enabled && demo.service_status && demo.service_status !== "RUNNING") {
      setResumingDemo(demo.id);
      try {
        const resumeRes = await fetch(`/api/demos/${demo.id}/resume`, { method: "POST" });
        const resumeData = await resumeRes.json();
        if (!resumeRes.ok) {
          alert(resumeData.error || "Failed to resume service");
          setResumingDemo(null);
          return;
        }
        if (resumeData.status !== "READY") {
          alert("Service is starting but not ready yet. Please try again in a moment.");
          setResumingDemo(null);
          return;
        }
        // Refresh demos to update status badge
        try {
          const r = await fetch("/api/demos");
          if (r.ok) { const data = await r.json(); if (Array.isArray(data)) setDemos(data); }
        } catch { /* ignore */ }
      } catch {
        alert("Network error — could not resume service");
        setResumingDemo(null);
        return;
      }
      setResumingDemo(null);
    }

    // Lock the demo
    let lockRes: Response;
    try {
      lockRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lock", demo_id: demo.id }),
      });
    } catch {
      alert("Network error — could not launch demo");
      return;
    }

    if (!lockRes.ok) {
      const err = await lockRes.json();
      alert(err.error || "Could not lock demo");
      return;
    }

    // Switch to demo viewing mode (iframe)
    setViewingDemo(demo);
    fetchSessions();
  }, [fetchSessions]);

  const handleCloseDemo = useCallback(async () => {
    // Clear the active_demo cookie
    document.cookie = "active_demo=;path=/;max-age=0";
    if (viewingDemo) {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlock", demo_id: viewingDemo.id }),
      });
    }
    setViewingDemo(null);
    fetchSessions();
  }, [viewingDemo, fetchSessions]);

  const handleIdleTimeout = useCallback(async () => {
    // Clear the active_demo cookie
    document.cookie = "active_demo=;path=/;max-age=0";
    if (viewingDemo) {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlock", demo_id: viewingDemo.id }),
      });
    }
    setViewingDemo(null);
    fetchSessions();
  }, [viewingDemo, fetchSessions]);

  const handleRelease = useCallback(async (demo: Demo) => {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unlock", demo_id: demo.id }),
    });
    if (!res.ok) {
      alert("Failed to release demo. Try refreshing the page.");
    }
    fetchSessions();
  }, [fetchSessions]);

  const filtered = useMemo(() => {
    return demos.filter((d) => {
      if (d.status !== "PUBLISHED") return false;

      if (search) {
        const q = search.toLowerCase();
        if (
          !d.name.toLowerCase().includes(q) &&
          !d.short_description?.toLowerCase().includes(q) &&
          !d.description?.toLowerCase().includes(q)
        )
          return false;
      }

      if (selectedTopics.length > 0) {
        if (!selectedTopics.some((t) => d.topics.includes(t))) return false;
      }

      if (selectedCapabilities.length > 0) {
        if (!selectedCapabilities.some((c) => d.capabilities.includes(c))) return false;
      }

      return true;
    });
  }, [demos, search, selectedTopics, selectedCapabilities]);

  // Demo viewing mode — show iframe
  if (viewingDemo) {
    return (
      <DemoViewer
        demo={viewingDemo}
        onClose={handleCloseDemo}
        onIdleTimeout={handleIdleTimeout}
      />
    );
  }

  // Browse mode — show demo tiles
  return (
    <div className="flex-1 overflow-auto px-8 py-8">
      <div className="max-w-7xl mx-auto w-full">
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          selectedTopics={selectedTopics}
          onTopicsChange={setSelectedTopics}
          selectedCapabilities={selectedCapabilities}
          onCapabilitiesChange={setSelectedCapabilities}
          topics={topics}
          capabilities={capabilities}
        />
      </div>

      <div>
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block w-6 h-6 border-2 border-[var(--sf-blue)] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm mt-2">Loading demos...</p>
          </div>
        ) : (
          <DemoGrid
            demos={filtered}
            sessions={sessions}
            currentUser={currentUser}
            resumingDemoId={resumingDemo}
            onInfo={setSelectedDemo}
            onLaunch={handleLaunch}
            onRelease={handleRelease}
          />
        )}
      </div>

      <DemoDetail demo={selectedDemo} onClose={() => setSelectedDemo(null)} />
      </div>
    </div>
  );
}
