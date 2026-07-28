"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { DEFAULT_TOPICS, DEFAULT_CAPABILITIES, Demo } from "@/lib/types";

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

export default function EditDemoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [topicOptions, setTopicOptions] = useState<string[]>(DEFAULT_TOPICS);
  const [capabilityOptions, setCapabilityOptions] = useState<string[]>(DEFAULT_CAPABILITIES);

  const [form, setForm] = useState({
    name: "",
    short_description: "",
    description: "",
    demo_type: "SPCS" as "SPCS" | "STREAMLIT",
    entry_url: "",
    video_url: "",
    topics: [] as string[],
    capabilities: [] as string[],
    status: "PUBLISHED",
    thumbnail_stage_path: "" as string | null,
    click_script_stage_path: "" as string | null,
    internal_host: "",
    proxy_path: "",
    idle_timeout_minutes: 15,
    service_name: "",
    compute_pool: "",
    schedule_start: "06:00",
    schedule_stop: "17:00",
    schedule_days: "MON,TUE,WED,THU,FRI",
    schedule_timezone: "America/Los_Angeles",
    auto_resume_enabled: true,
    schedule_enabled: false,
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [scriptFile, setScriptFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/demos/${id}`)
      .then((r) => r.json())
      .then((data: Demo) => {
        setForm({
          name: data.name || "",
          short_description: data.short_description || "",
          description: data.description || "",
          demo_type: data.demo_type || "SPCS",
          entry_url: data.entry_url || "",
          video_url: data.video_url || "",
          topics: data.topics || [],
          capabilities: data.capabilities || [],
          status: data.status || "PUBLISHED",
          thumbnail_stage_path: data.thumbnail_stage_path,
          click_script_stage_path: data.click_script_stage_path,
          internal_host: data.internal_host || "",
          proxy_path: data.proxy_path || "",
          idle_timeout_minutes: data.idle_timeout_minutes || 15,
          service_name: data.service_name || "",
          compute_pool: data.compute_pool || "",
          schedule_start: data.schedule_start || "06:00",
          schedule_stop: data.schedule_stop || "17:00",
          schedule_days: data.schedule_days || "MON,TUE,WED,THU,FRI",
          schedule_timezone: data.schedule_timezone || "America/Los_Angeles",
          auto_resume_enabled: data.auto_resume_enabled ?? true,
          schedule_enabled: !!(data.schedule_start && data.schedule_stop),
        });
        if (data.thumbnail_url) {
          setImagePreview(data.thumbnail_url);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.topics) setTopicOptions(data.topics);
        if (data.capabilities) setCapabilityOptions(data.capabilities);
      })
      .catch(() => {});
  }, [id]);

  const updateForm = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleArray = (key: "topics" | "capabilities", val: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(val)
        ? prev[key].filter((v) => v !== val)
        : [...prev[key], val],
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    try {
      const slug = form.name.toLowerCase().replace(/\s+/g, "_");
      let thumbnail_stage_path = form.thumbnail_stage_path;
      let click_script_stage_path = form.click_script_stage_path;

      if (imageFile) {
        const imgForm = new FormData();
        imgForm.append("file", imageFile);
        imgForm.append("stageType", "images");
        imgForm.append("destPath", `${slug}/${imageFile.name}`);
        await fetch("/api/upload", { method: "POST", body: imgForm });
        thumbnail_stage_path = `${slug}/${imageFile.name}`;
      }

      if (scriptFile) {
        const scriptForm = new FormData();
        scriptForm.append("file", scriptFile);
        scriptForm.append("stageType", "scripts");
        scriptForm.append("destPath", `${slug}/${scriptFile.name}`);
        await fetch("/api/upload", { method: "POST", body: scriptForm });
        click_script_stage_path = `${slug}/${scriptFile.name}`;
      }

      const res = await fetch(`/api/demos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          thumbnail_stage_path,
          click_script_stage_path,
          service_name: form.service_name || null,
          compute_pool: form.compute_pool || null,
          schedule_start: form.schedule_enabled ? form.schedule_start : null,
          schedule_stop: form.schedule_enabled ? form.schedule_stop : null,
          schedule_days: form.schedule_enabled ? form.schedule_days : null,
          schedule_timezone: form.schedule_enabled ? form.schedule_timezone : null,
          auto_resume_enabled: form.schedule_enabled ? form.auto_resume_enabled : false,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update demo");
      }

      // Create/update schedule tasks
      try {
        await fetch(`/api/demos/${id}/schedule`, { method: "POST" });
      } catch {
        // Non-critical
      }

      router.push("/admin");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-6 max-w-2xl mx-auto">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Edit Demo</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Demo Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateForm("name", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
          <input
            type="text"
            value={form.short_description}
            onChange={(e) => updateForm("short_description", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Description</label>
          <textarea
            value={form.description}
            onChange={(e) => updateForm("description", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)] min-h-[100px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Demo Type</label>
            <div className="flex gap-2">
              {(["SPCS", "STREAMLIT"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => updateForm("demo_type", t)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    form.demo_type === t
                      ? "bg-[var(--sf-blue)] text-white border-[var(--sf-blue)]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-[var(--sf-blue)]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => updateForm("status", e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Entry URL</label>
          <input
            type="url"
            value={form.entry_url}
            onChange={(e) => updateForm("entry_url", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Video URL</label>
          <input
            type="url"
            value={form.video_url}
            onChange={(e) => updateForm("video_url", e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
          />
        </div>

        <div className="border-t border-gray-200 pt-5 mt-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Gateway Proxy (Single Sign-On)</h3>
          <p className="text-xs text-gray-500 mb-3">Configure to serve this demo through the portal without requiring a second login. Only for SPCS demos.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Internal Host</label>
              <input
                type="text"
                placeholder="service.schema.db.snowflakecomputing.internal:8080"
                value={form.internal_host}
                onChange={(e) => updateForm("internal_host", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Proxy Path (slug)</label>
              <input
                type="text"
                placeholder="oee"
                value={form.proxy_path}
                onChange={(e) => updateForm("proxy_path", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Idle Timeout (minutes)</label>
            <input
              type="number"
              min="1"
              max="120"
              value={form.idle_timeout_minutes}
              onChange={(e) => updateForm("idle_timeout_minutes", parseInt(e.target.value) || 15)}
              className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
            />
          </div>
        </div>

        <div className="border-t border-gray-200 pt-5 mt-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Service Schedule</h3>
          <p className="text-xs text-gray-500 mb-3">Automatically start and stop the service on a schedule to save compute costs.</p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Service Name (fully qualified)</label>
                <input
                  type="text"
                  placeholder="DB.SCHEMA.SERVICE_NAME"
                  value={form.service_name}
                  onChange={(e) => updateForm("service_name", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Compute Pool</label>
                <input
                  type="text"
                  placeholder="POOL_NAME"
                  value={form.compute_pool}
                  onChange={(e) => updateForm("compute_pool", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-600">Enable Schedule</label>
              <button
                onClick={() => updateForm("schedule_enabled", !form.schedule_enabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  form.schedule_enabled ? "bg-[var(--sf-blue)]" : "bg-gray-300"
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  form.schedule_enabled ? "translate-x-5" : ""
                }`} />
              </button>
            </div>

            {form.schedule_enabled && (
              <div className="space-y-3 pl-2 border-l-2 border-[var(--sf-blue)]/20">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                    <input
                      type="time"
                      value={form.schedule_start}
                      onChange={(e) => updateForm("schedule_start", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Stop Time</label>
                    <input
                      type="time"
                      value={form.schedule_stop}
                      onChange={(e) => updateForm("schedule_stop", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Active Days</label>
                  <div className="flex gap-1">
                    {WEEKDAYS.map((day) => {
                      const activeDays = form.schedule_days.split(",").filter(Boolean);
                      const isActive = activeDays.includes(day.key);
                      return (
                        <button
                          key={day.key}
                          onClick={() => {
                            const days = isActive
                              ? activeDays.filter((d) => d !== day.key)
                              : [...activeDays, day.key];
                            updateForm("schedule_days", days.join(","));
                          }}
                          className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${
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
                    value={form.schedule_timezone}
                    onChange={(e) => updateForm("schedule_timezone", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-gray-600">Auto-resume on launch</label>
                  <button
                    onClick={() => updateForm("auto_resume_enabled", !form.auto_resume_enabled)}
                    className={`relative w-9 h-4.5 rounded-full transition-colors ${
                      form.auto_resume_enabled ? "bg-[var(--sf-blue)]" : "bg-gray-300"
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${
                      form.auto_resume_enabled ? "translate-x-4" : ""
                    }`} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Topics</label>
          <div className="flex flex-wrap gap-2">
            {topicOptions.map((t) => (
              <button
                key={t}
                onClick={() => toggleArray("topics", t)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  form.topics.includes(t)
                    ? "bg-[var(--sf-blue)] text-white border-[var(--sf-blue)]"
                    : "bg-white text-gray-600 border-gray-200 hover:border-[var(--sf-blue)]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Capabilities</label>
          <div className="flex flex-wrap gap-2">
            {capabilityOptions.map((c) => (
              <button
                key={c}
                onClick={() => toggleArray("capabilities", c)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  form.capabilities.includes(c)
                    ? "bg-[var(--sf-blue)] text-white border-[var(--sf-blue)]"
                    : "bg-white text-gray-600 border-gray-200 hover:border-[var(--sf-blue)]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Screenshot</label>
          {imagePreview && (
            <div className="mb-2">
              <img src={imagePreview} alt="Current" className="max-h-32 rounded-lg border border-gray-200 mb-1" />
              <button
                onClick={() => { setImagePreview(null); setImageFile(null); updateForm("thumbnail_stage_path", null); }}
                className="text-xs text-red-500 hover:underline"
              >
                Remove image
              </button>
            </div>
          )}
          <input type="file" accept="image/*" onChange={handleImageChange} className="text-xs" />
          {form.thumbnail_stage_path && !imageFile && !imagePreview && (
            <p className="text-xs text-gray-400 mt-1">Current: {form.thumbnail_stage_path}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Click Script</label>
          {form.click_script_stage_path && !scriptFile && (
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs text-gray-600">{form.click_script_stage_path}</p>
              <button
                onClick={() => updateForm("click_script_stage_path", null)}
                className="text-xs text-red-500 hover:underline"
              >
                Remove
              </button>
            </div>
          )}
          <input
            type="file"
            accept=".pdf,.docx,.doc,.html"
            onChange={(e) => setScriptFile(e.target.files?.[0] || null)}
            className="text-xs"
          />
          {form.click_script_stage_path && !scriptFile && (
            <p className="text-xs text-gray-400 mt-1">Current: {form.click_script_stage_path}</p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}
      </div>

      <div className="flex justify-between mt-6">
        <button
          onClick={() => router.push("/admin")}
          className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="text-sm font-medium px-4 py-2 rounded-lg bg-[var(--sf-blue)] text-white hover:bg-[var(--sf-dark)] disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
