"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Demo } from "@/lib/types";

export default function AdminPage() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/demos")
      .then((r) => r.json())
      .then((data) => {
        setDemos(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/demos/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDemos(demos.filter((d) => d.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to delete demo");
    }
  };

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Admin Dashboard</h1>
        <div className="flex gap-3">
          <Link
            href="/admin/analytics"
            className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Analytics
          </Link>
          <Link
            href="/admin/settings"
            className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Settings
          </Link>
          <Link
            href="/admin/add"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-[var(--sf-blue)] text-white hover:bg-[var(--sf-dark)] transition-colors"
          >
            + Add Demo
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : demos.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 mb-3">No demos registered yet.</p>
          <Link
            href="/admin/add"
            className="text-sm font-medium text-[var(--sf-blue)] hover:underline"
          >
            Add your first demo
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Topics</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {demos.map((demo) => (
                <tr key={demo.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{demo.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {demo.demo_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      demo.status === "PUBLISHED"
                        ? "bg-green-50 text-green-700"
                        : demo.status === "DRAFT"
                        ? "bg-yellow-50 text-yellow-700"
                        : "bg-red-50 text-red-700"
                    }`}>
                      {demo.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {(demo.topics || []).join(", ")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/edit/${demo.id}`}
                      className="text-xs text-[var(--sf-blue)] hover:underline mr-3"
                    >
                      Edit
                    </Link>
                    {demo.entry_url && (
                      <a
                        href={(demo.entry_url || "").startsWith("http") ? demo.entry_url : `https://${demo.entry_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-500 hover:underline mr-3"
                      >
                        Launch
                      </a>
                    )}
                    <button
                      onClick={() => handleDelete(demo.id, demo.name)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
