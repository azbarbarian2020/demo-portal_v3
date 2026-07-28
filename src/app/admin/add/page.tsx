"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_TOPICS, DEFAULT_CAPABILITIES } from "@/lib/types";

const STEPS = ["Basic Info", "Source", "Categories", "Files", "Schedule", "Review"];

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

interface StreamlitOption {
  name: string;
  database_name: string;
  schema_name: string;
  title: string;
  fully_qualified: string;
}

interface ServiceOption {
  name: string;
  database_name: string;
  schema_name: string;
  fully_qualified: string;
  dns_name: string;
  status: string;
}

interface DetectionResult {
  runtime?: string;
  embeddable?: boolean;
  internal_host?: string;
  suggested_proxy_path?: string;
  entry_url?: string;
  service_name?: string;
  service_status?: string;
  message?: string;
  title?: string;
}

export default function AddDemoPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [topics, setTopicsOptions] = useState<string[]>(DEFAULT_TOPICS);
  const [capabilities, setCapabilitiesOptions] = useState<string[]>(DEFAULT_CAPABILITIES);

  // Source detection state
  const [streamlits, setStreamlits] = useState<StreamlitOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [selectedStreamlit, setSelectedStreamlit] = useState("");
  const [selectedService, setSelectedService] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.topics) setTopicsOptions(data.topics);
        if (data.capabilities) setCapabilitiesOptions(data.capabilities);
      })
      .catch(() => {});
  }, []);

  const [form, setForm] = useState({
    name: "",
    short_description: "",
    description: "",
    demo_type: "SPCS" as "SPCS" | "STREAMLIT",
    entry_url: "",
    video_url: "",
    topics: [] as string[],
    capabilities: [] as string[],
    status: "PUBLISHED" as string,
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

  // Load Streamlits or Services when demo type changes
  useEffect(() => {
    if (form.demo_type === "STREAMLIT") {
      fetch("/api/demos/list-streamlits")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setStreamlits(data); })
        .catch(() => {});
    } else {
      fetch("/api/demos/list-services")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setServices(data); })
        .catch(() => {});
    }
  }, [form.demo_type]);

  // Detect Streamlit service info
  const detectStreamlit = async (fqn: string) => {
    setDetecting(true);
    setDetection(null);
    try {
      const res = await fetch("/api/demos/detect-streamlit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamlit_name: fqn }),
      });
      const data = await res.json();
      setDetection(data);
      if (data.embeddable && data.internal_host) {
        updateForm("internal_host", data.internal_host);
        updateForm("proxy_path", data.suggested_proxy_path || "");
        updateForm("entry_url", data.entry_url || "");
        if (data.title && !form.name) {
          updateForm("name", data.title);
        }
      } else if (data.entry_url) {
        updateForm("entry_url", data.entry_url);
        updateForm("internal_host", "");
        updateForm("proxy_path", "");
      }
    } catch {
      setDetection({ message: "Failed to detect service configuration" });
    } finally {
      setDetecting(false);
    }
  };

  // Detect SPCS service info — try server-side first (gets actual port), fall back to client-side
  const detectService = async (fqn: string) => {
    setDetecting(true);
    setDetection(null);
    try {
      // Find the service in our already-loaded list
      const svc = services.find((s) => s.fully_qualified === fqn);
      if (!svc) {
        setDetection({ embeddable: false, message: `Service '${fqn}' not found in list` });
        return;
      }

      // Try server-side detection first (may get actual port from SHOW ENDPOINTS)
      let internalHost: string | null = null;
      let proxyPath = "";
      let detectedComputePool = "";
      try {
        const res = await fetch("/api/demos/detect-service", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service_name: fqn }),
        });
        const data = await res.json();
        if (!data.error && data.internal_host) {
          internalHost = data.internal_host;
          proxyPath = data.suggested_proxy_path || "";
          if (data.compute_pool) detectedComputePool = data.compute_pool;
        }
      } catch {
        // Server-side detection failed — fall through to client-side
      }

      // Fall back to client-side construction if server-side failed
      if (!internalHost) {
        const dnsService = svc.name.toLowerCase().replace(/_/g, "-");
        const dnsSchema = svc.schema_name.toLowerCase().replace(/_/g, "-");
        const dnsDb = svc.database_name.toLowerCase().replace(/_/g, "-");
        internalHost = `${dnsService}.${dnsSchema}.${dnsDb}.snowflakecomputing.internal:8080`;
        proxyPath = svc.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }

      // Check for proxy path conflicts
      try {
        const conflictRes = await fetch(`/api/demos/check-proxy?path=${encodeURIComponent(proxyPath)}`);
        const conflictData = await conflictRes.json();
        if (conflictData.exists) {
          proxyPath = `${proxyPath}-2`;
        }
      } catch {
        // Non-critical
      }

      setDetection({
        embeddable: true,
        internal_host: internalHost,
        message: `Detected: ${internalHost}`,
        service_status: svc.status,
      });
      updateForm("internal_host", internalHost);
      updateForm("proxy_path", proxyPath);
      updateForm("entry_url", "");
      updateForm("service_name", fqn);
      updateForm("compute_pool", detectedComputePool);
    } catch {
      setDetection({ message: "Failed to detect service configuration" });
    } finally {
      setDetecting(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          entry_url: form.entry_url || null,
          internal_host: form.internal_host || null,
          proxy_path: form.proxy_path || null,
          service_name: form.service_name || null,
          compute_pool: form.compute_pool || null,
          schedule_start: form.schedule_enabled ? form.schedule_start : null,
          schedule_stop: form.schedule_enabled ? form.schedule_stop : null,
          schedule_days: form.schedule_enabled ? form.schedule_days : null,
          schedule_timezone: form.schedule_enabled ? form.schedule_timezone : null,
          auto_resume_enabled: form.schedule_enabled ? form.auto_resume_enabled : false,
          thumbnail_stage_path: imageFile ? `${form.name.toLowerCase().replace(/\s+/g, "_")}/${imageFile.name}` : null,
          click_script_stage_path: scriptFile ? `${form.name.toLowerCase().replace(/\s+/g, "_")}/${scriptFile.name}` : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create demo");
      }

      const result = await res.json();
      const newDemoId = result.id;

      // Create schedule tasks if enabled
      if (form.schedule_enabled && form.service_name && newDemoId) {
        try {
          await fetch(`/api/demos/${newDemoId}/schedule`, { method: "POST" });
        } catch {
          // Non-critical — schedule can be set up later
          console.error("Failed to create schedule tasks");
        }
      }

      if (imageFile) {
        const imgForm = new FormData();
        imgForm.append("file", imageFile);
        imgForm.append("stageType", "images");
        imgForm.append("destPath", `${form.name.toLowerCase().replace(/\s+/g, "_")}/${imageFile.name}`);
        await fetch("/api/upload", { method: "POST", body: imgForm });
      }

      if (scriptFile) {
        const scriptForm = new FormData();
        scriptForm.append("file", scriptFile);
        scriptForm.append("stageType", "scripts");
        scriptForm.append("destPath", `${form.name.toLowerCase().replace(/\s+/g, "_")}/${scriptFile.name}`);
        await fetch("/api/upload", { method: "POST", body: scriptForm });
      }

      router.push("/admin");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  const canNext = () => {
    switch (step) {
      case 0: return form.name.trim().length > 0;
      case 1: return form.entry_url.trim().length > 0 || form.internal_host.trim().length > 0;
      case 2: return true;
      case 3: return true;
      case 4: return true;
      case 5: return true;
      default: return true;
    }
  };

  return (
    <div className="px-6 py-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Add New Demo</h1>

      <div className="flex gap-1 mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={`h-1 rounded-full ${i <= step ? "bg-[var(--sf-blue)]" : "bg-gray-200"}`} />
            <p className={`text-[10px] mt-1 ${i === step ? "text-[var(--sf-dark)] font-medium" : "text-gray-400"}`}>
              {s}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Demo Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => updateForm("name", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
                placeholder="e.g. Predictive Maintenance Demo"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
              <input
                type="text"
                value={form.short_description}
                onChange={(e) => updateForm("short_description", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
                placeholder="Brief tagline for the demo tile"
                maxLength={500}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Description</label>
              <textarea
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)] min-h-[100px]"
                placeholder="Detailed description shown in the info panel"
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Demo Type *</label>
              <div className="flex gap-3">
                {(["SPCS", "STREAMLIT"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      updateForm("demo_type", t);
                      setDetection(null);
                      setSelectedStreamlit("");
                      setSelectedService("");
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      form.demo_type === t
                        ? "bg-[var(--sf-blue)] text-white border-[var(--sf-blue)]"
                        : "bg-white text-gray-600 border-gray-200 hover:border-[var(--sf-blue)]"
                    }`}
                  >
                    {t === "SPCS" ? "SPCS Application" : "Streamlit in Snowflake"}
                  </button>
                ))}
              </div>
            </div>

            {/* Streamlit picker */}
            {form.demo_type === "STREAMLIT" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Streamlit App</label>
                <select
                  value={selectedStreamlit}
                  onChange={(e) => {
                    const fqn = e.target.value;
                    setSelectedStreamlit(fqn);
                    if (fqn) detectStreamlit(fqn);
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
                >
                  <option value="">-- Choose a Streamlit app --</option>
                  {streamlits.map((s) => (
                    <option key={s.fully_qualified} value={s.fully_qualified}>
                      {s.title} ({s.database_name}.{s.schema_name})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* SPCS service picker */}
            {form.demo_type === "SPCS" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select SPCS Service</label>
                <select
                  value={selectedService}
                  onChange={(e) => {
                    const fqn = e.target.value;
                    setSelectedService(fqn);
                    if (fqn) detectService(fqn);
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
                >
                  <option value="">-- Choose an SPCS service --</option>
                  {services.map((s) => (
                    <option key={s.fully_qualified} value={s.fully_qualified}>
                      {s.name} ({s.database_name}.{s.schema_name}) - {s.status}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Detection loading */}
            {detecting && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                <div className="w-4 h-4 border-2 border-[var(--sf-blue)] border-t-transparent rounded-full animate-spin" />
                Detecting service configuration...
              </div>
            )}

            {/* Detection result */}
            {detection && !detecting && (
              <div className={`rounded-lg p-4 text-sm ${
                detection.embeddable === true
                  ? "bg-green-50 border border-green-200"
                  : detection.embeddable === false
                    ? "bg-amber-50 border border-amber-200"
                    : "bg-blue-50 border border-blue-200"
              }`}>
                {detection.embeddable === true && (
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="font-medium text-green-800">Embeddable - No second login required</p>
                      <p className="text-green-700 mt-1">{detection.message}</p>
                      {detection.service_status && detection.service_status !== "RUNNING" && (
                        <p className="text-amber-700 mt-1">Service status: {detection.service_status}</p>
                      )}
                    </div>
                  </div>
                )}
                {detection.embeddable === false && (
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="font-medium text-amber-800">Opens in new tab (separate login required)</p>
                      <p className="text-amber-700 mt-1">{detection.message}</p>
                    </div>
                  </div>
                )}
                {detection.embeddable === undefined && detection.internal_host && (
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="font-medium text-green-800">Service detected - will embed seamlessly</p>
                      <p className="text-green-700 mt-1">Internal host: {detection.internal_host}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Proxy config (shown when embeddable) */}
            {(form.internal_host || (detection && detection.embeddable !== false)) && form.internal_host && (
              <div className="space-y-3 pt-2 border-t border-gray-100">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Internal Host (auto-detected)</label>
                  <input
                    type="text"
                    value={form.internal_host}
                    onChange={(e) => updateForm("internal_host", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Proxy Path</label>
                    <input
                      type="text"
                      value={form.proxy_path}
                      onChange={(e) => updateForm("proxy_path", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      placeholder="e.g. my-demo"
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Idle Timeout</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={form.idle_timeout_minutes}
                        onChange={(e) => updateForm("idle_timeout_minutes", parseInt(e.target.value) || 15)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        min={1}
                        max={120}
                      />
                      <span className="text-xs text-gray-400">min</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Entry URL — optional for proxied apps, required for external */}
            {!form.internal_host && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entry URL *</label>
                <input
                  type="url"
                  value={form.entry_url}
                  onChange={(e) => updateForm("entry_url", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
                  placeholder="https://..."
                />
                <p className="text-xs text-gray-400 mt-1">The URL that opens when a user clicks Launch (opens in new tab)</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Video URL</label>
              <input
                type="url"
                value={form.video_url}
                onChange={(e) => updateForm("video_url", e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
                placeholder="https://youtube.com/... or mp4 URL"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Topics</label>
              <div className="flex flex-wrap gap-2">
                {topics.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleArray("topics", t)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
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
                {capabilities.map((c) => (
                  <button
                    key={c}
                    onClick={() => toggleArray("capabilities", c)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
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
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Screenshot Image</label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
                {imagePreview ? (
                  <div>
                    <img src={imagePreview} alt="Preview" className="max-h-40 mx-auto rounded-lg mb-2" />
                    <p className="text-xs text-gray-500">{imageFile?.name}</p>
                    <button
                      onClick={() => { setImageFile(null); setImagePreview(null); }}
                      className="text-xs text-red-500 hover:underline mt-1"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-gray-500 mb-2">Upload a screenshot of the demo</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="text-xs"
                    />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Click Script (PDF/DOCX)</label>
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
                {scriptFile ? (
                  <div>
                    <p className="text-sm text-gray-700">{scriptFile.name}</p>
                    <button
                      onClick={() => setScriptFile(null)}
                      className="text-xs text-red-500 hover:underline mt-1"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-gray-500 mb-2">Upload a click script document</p>
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.html"
                      onChange={(e) => setScriptFile(e.target.files?.[0] || null)}
                      className="text-xs"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <label className="text-sm font-medium text-gray-700">Enable Service Schedule</label>
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
            <p className="text-xs text-gray-500">Automatically start and stop the service on a schedule to save compute costs.</p>

            {form.schedule_enabled && (
              <div className="space-y-4 pt-2">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Start Time</label>
                    <input
                      type="time"
                      value={form.schedule_start}
                      onChange={(e) => updateForm("schedule_start", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Stop Time</label>
                    <input
                      type="time"
                      value={form.schedule_stop}
                      onChange={(e) => updateForm("schedule_stop", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">Active Days</label>
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">Timezone</label>
                  <select
                    value={form.schedule_timezone}
                    onChange={(e) => updateForm("schedule_timezone", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <label className="text-xs font-medium text-gray-500">Auto-resume on launch</label>
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

                {form.service_name && (
                  <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Service:</span>
                      <span className="font-mono">{form.service_name}</span>
                    </div>
                    {form.compute_pool && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Compute Pool:</span>
                        <span className="font-mono">{form.compute_pool}</span>
                      </div>
                    )}
                  </div>
                )}

                {!form.service_name && form.demo_type === "SPCS" && (
                  <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg">
                    No service detected. Go back to Source step and select an SPCS service to enable scheduling.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Review</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Name:</span>
                <span className="font-medium">{form.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Type:</span>
                <span>{form.demo_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Embedding:</span>
                <span className={form.proxy_path ? "text-green-700" : "text-amber-700"}>
                  {form.proxy_path ? "Embedded (no second login)" : "New tab (separate login)"}
                </span>
              </div>
              {form.proxy_path && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Proxy Path:</span>
                    <span className="text-xs font-mono">/apps/{form.proxy_path}/</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Idle Timeout:</span>
                    <span>{form.idle_timeout_minutes} min</span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Entry URL:</span>
                <span className="text-xs truncate max-w-[200px]">{form.entry_url}</span>
              </div>
              {form.video_url && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Video:</span>
                  <span className="text-xs truncate max-w-[200px]">{form.video_url}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Topics:</span>
                <span>{form.topics.join(", ") || "None"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Capabilities:</span>
                <span>{form.capabilities.join(", ") || "None"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Screenshot:</span>
                <span>{imageFile?.name || "None"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Click Script:</span>
                <span>{scriptFile?.name || "None"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Schedule:</span>
                <span className={form.schedule_enabled ? "text-green-700" : "text-gray-400"}>
                  {form.schedule_enabled
                    ? `${form.schedule_start} - ${form.schedule_stop} (${form.schedule_days})`
                    : "None"}
                </span>
              </div>
            </div>

            {imagePreview && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Tile Preview:</p>
                <div className="w-64 bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <img src={imagePreview} alt="" className="w-full aspect-video object-cover" />
                  <div className="p-3">
                    <h4 className="font-semibold text-xs text-gray-900">{form.name}</h4>
                    <p className="text-[10px] text-gray-500 line-clamp-1">{form.short_description}</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => updateForm("status", e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="PUBLISHED">Published</option>
                <option value="DRAFT">Draft</option>
              </select>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between mt-6">
        <button
          onClick={() => step > 0 ? setStep(step - 1) : router.push("/admin")}
          className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          {step === 0 ? "Cancel" : "Back"}
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext()}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-[var(--sf-blue)] text-white hover:bg-[var(--sf-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-[var(--sf-blue)] text-white hover:bg-[var(--sf-dark)] disabled:opacity-50"
          >
            {submitting ? "Publishing..." : "Publish Demo"}
          </button>
        )}
      </div>
    </div>
  );
}
