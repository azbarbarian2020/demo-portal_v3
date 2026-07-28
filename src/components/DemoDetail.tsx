"use client";

import { Demo } from "@/lib/types";

interface DemoDetailProps {
  demo: Demo | null;
  onClose: () => void;
}

export default function DemoDetail({ demo, onClose }: DemoDetailProps) {
  if (!demo) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="font-semibold text-lg text-gray-900">{demo.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {demo.thumbnail_url && (
            <img
              src={demo.thumbnail_url}
              alt={demo.name}
              className="w-full rounded-lg border border-gray-200"
            />
          )}

          <div>
            <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-[var(--sf-light)] text-[var(--sf-dark)] mb-2">
              {demo.demo_type}
            </span>
            <p className="text-sm text-gray-600 leading-relaxed">{demo.description || demo.short_description}</p>
          </div>

          {demo.topics.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1.5">Topics</h4>
              <div className="flex flex-wrap gap-1">
                {demo.topics.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-[var(--sf-light)] text-[var(--sf-dark)]">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {demo.capabilities.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1.5">Capabilities</h4>
              <div className="flex flex-wrap gap-1">
                {demo.capabilities.map((c) => (
                  <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2">
            {demo.entry_url && (
              <a
                href={(demo.entry_url || "").startsWith("http") ? demo.entry_url! : `https://${demo.entry_url || ""}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center text-sm font-medium px-4 py-2.5 rounded-lg bg-[var(--sf-blue)] text-white hover:bg-[var(--sf-dark)] transition-colors"
              >
                Launch Demo
              </a>
            )}

            {demo.click_script_stage_path && (
              <a
                href={`/api/demos/${demo.id}/script`}
                className="block w-full text-center text-sm font-medium px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Download Click Script
              </a>
            )}

            {demo.video_url && (
              <a
                href={demo.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center text-sm font-medium px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Watch Video
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
