"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const WEEKDAYS = [
  { key: "MON", label: "Mon" },
  { key: "TUE", label: "Tue" },
  { key: "WED", label: "Wed" },
  { key: "THU", label: "Thu" },
  { key: "FRI", label: "Fri" },
  { key: "SAT", label: "Sat" },
  { key: "SUN", label: "Sun" },
];

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
];

export default function SettingsPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [newCapability, setNewCapability] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Branding state
  const [portalTitle, setPortalTitle] = useState("Demo Portal");
  const [portalLogo, setPortalLogo] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);

  // Portal schedule state
  const [portalSchedule, setPortalSchedule] = useState({
    start_time: "05:00",
    stop_time: "17:15",
    days: "MON,TUE,WED,THU,FRI",
    timezone: "America/Los_Angeles",
    compute_pool: "DEMO_PORTAL_POOL",
    service_name: "DEMO_PORTAL.PUBLIC.DEMO_PORTAL_SVC",
  });
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.topics) setTopics(data.topics);
        if (data.capabilities) setCapabilities(data.capabilities);
        if (data.portal_title) setPortalTitle(data.portal_title);
        if (data.portal_logo) setPortalLogo(data.portal_logo);
      });

    fetch("/api/portal-schedule")
      .then((r) => r.json())
      .then((data) => {
        if (data.configured && !data.parse_error) {
          setPortalSchedule({
            start_time: data.start_time || "05:00",
            stop_time: data.stop_time || "17:15",
            days: data.days || "MON,TUE,WED,THU,FRI",
            timezone: data.timezone || "America/Los_Angeles",
            compute_pool: data.compute_pool || "DEMO_PORTAL_POOL",
            service_name: data.service_name || "DEMO_PORTAL.PUBLIC.DEMO_PORTAL_SVC",
          });
        }
        setScheduleLoaded(true);
      })
      .catch(() => setScheduleLoaded(true));
  }, []);

  const addTopic = () => {
    const val = newTopic.trim();
    if (val && !topics.includes(val)) {
      setTopics([...topics, val]);
      setNewTopic("");
    }
  };

  const addCapability = () => {
    const val = newCapability.trim();
    if (val && !capabilities.includes(val)) {
      setCapabilities([...capabilities, val]);
      setNewCapability("");
    }
  };

  const removeTopic = (t: string) => setTopics(topics.filter((x) => x !== t));
  const removeCapability = (c: string) => setCapabilities(capabilities.filter((x) => x !== c));

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topics, capabilities }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="px-6 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <button
          onClick={() => router.push("/admin")}
          className="text-sm text-gray-500 hover:underline"
        >
          Back to Admin
        </button>
      </div>

      <div className="space-y-6">
        {/* Branding Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Branding</h2>
          <p className="text-xs text-gray-500 mb-4">Customize your portal title and logo. Changes appear immediately in the header.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Portal Title</label>
              <input
                type="text"
                value={portalTitle}
                onChange={(e) => setPortalTitle(e.target.value)}
                placeholder="Demo Portal"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Logo</label>
              <div className="flex items-center gap-4">
                {portalLogo ? (
                  <img
                    src={`/api/image?path=${encodeURIComponent(portalLogo)}`}
                    alt="Current logo"
                    className="h-14 w-14 rounded-full object-contain bg-gray-100 border border-gray-200"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
                    <span className="text-xs text-gray-400">None</span>
                  </div>
                )}
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setLogoUploading(true);
                      try {
                        const form = new FormData();
                        form.append("file", file);
                        const res = await fetch("/api/settings/logo", { method: "POST", body: form });
                        const data = await res.json();
                        if (data.path) setPortalLogo(data.path);
                      } catch { /* ignore */ }
                      setLogoUploading(false);
                    }}
                    className="text-xs"
                    disabled={logoUploading}
                  />
                  {logoUploading && <p className="text-xs text-gray-500 mt-1">Uploading...</p>}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={async () => {
                  setSavingBranding(true);
                  await fetch("/api/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ portal_title: portalTitle }),
                  });
                  setSavingBranding(false);
                  setBrandingSaved(true);
                  setTimeout(() => setBrandingSaved(false), 2000);
                }}
                disabled={savingBranding}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-[var(--sf-blue)] text-white hover:bg-[var(--sf-dark)] disabled:opacity-50"
              >
                {savingBranding ? "Saving..." : "Save Branding"}
              </button>
              {brandingSaved && <span className="text-sm text-green-600">Saved!</span>}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Topics</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {topics.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[var(--sf-light)] text-[var(--sf-dark)]">
                {t}
                <button onClick={() => removeTopic(t)} className="text-[var(--sf-dark)] hover:text-red-500 ml-0.5">
                  &times;
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTopic()}
              placeholder="Add topic..."
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
            />
            <button
              onClick={addTopic}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--sf-blue)] text-white hover:bg-[var(--sf-dark)]"
            >
              Add
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Capabilities</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {capabilities.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                {c}
                <button onClick={() => removeCapability(c)} className="text-gray-500 hover:text-red-500 ml-0.5">
                  &times;
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newCapability}
              onChange={(e) => setNewCapability(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCapability()}
              placeholder="Add capability..."
              className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
            />
            <button
              onClick={addCapability}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--sf-blue)] text-white hover:bg-[var(--sf-dark)]"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-[var(--sf-blue)] text-white hover:bg-[var(--sf-dark)] disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {saved && <span className="text-sm text-green-600">Saved!</span>}
      </div>

      {scheduleLoaded && (
        <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Portal Service Schedule</h2>
          <p className="text-xs text-gray-500 mb-4">Controls when the Demo Portal service and compute pool start/stop.</p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                <input
                  type="time"
                  value={portalSchedule.start_time}
                  onChange={(e) => setPortalSchedule({ ...portalSchedule, start_time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Stop Time</label>
                <input
                  type="time"
                  value={portalSchedule.stop_time}
                  onChange={(e) => setPortalSchedule({ ...portalSchedule, stop_time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Active Days</label>
              <div className="flex gap-1">
                {WEEKDAYS.map((day) => {
                  const activeDays = portalSchedule.days.split(",").filter(Boolean);
                  const isActive = activeDays.includes(day.key);
                  return (
                    <button
                      key={day.key}
                      onClick={() => {
                        const days = isActive
                          ? activeDays.filter((d) => d !== day.key)
                          : [...activeDays, day.key];
                        setPortalSchedule({ ...portalSchedule, days: days.join(",") });
                      }}
                      className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${
                        isActive
                          ? "bg-[var(--sf-blue)] text-white border-[var(--sf-blue)]"
                          : "bg-white text-gray-500 border-gray-200 hover:border-[var(--sf-blue)]"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Timezone</label>
              <select
                value={portalSchedule.timezone}
                onChange={(e) => setPortalSchedule({ ...portalSchedule, timezone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Compute Pool</label>
                <input
                  type="text"
                  value={portalSchedule.compute_pool}
                  onChange={(e) => setPortalSchedule({ ...portalSchedule, compute_pool: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Service Name</label>
                <input
                  type="text"
                  value={portalSchedule.service_name}
                  onChange={(e) => setPortalSchedule({ ...portalSchedule, service_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={async () => {
                  setSavingSchedule(true);
                  try {
                    const res = await fetch("/api/portal-schedule", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(portalSchedule),
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      alert(data.error || "Failed to save schedule");
                    } else {
                      setScheduleSaved(true);
                      setTimeout(() => setScheduleSaved(false), 2000);
                    }
                  } catch {
                    alert("Network error saving schedule");
                  } finally {
                    setSavingSchedule(false);
                  }
                }}
                disabled={savingSchedule}
                className="text-sm font-medium px-4 py-2 rounded-lg bg-[var(--sf-blue)] text-white hover:bg-[var(--sf-dark)] disabled:opacity-50"
              >
                {savingSchedule ? "Saving..." : "Save Portal Schedule"}
              </button>
              {scheduleSaved && <span className="text-sm text-green-600">Schedule updated!</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
