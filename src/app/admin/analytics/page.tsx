"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

interface AnalyticsData {
  summary: {
    totalSessions: number;
    uniqueUsers: number;
    avgDurationMinutes: number;
    totalDemos: number;
  };
  usageByDemo: { demo_id: number; name: string; launch_count: number; total_minutes: number; unique_users: number }[];
  usageOverTime: { date: string; launch_count: number }[];
  topUsers: { user_name: string; launch_count: number; total_minutes: number }[];
  durationDistribution: { bucket: string; count: number }[];
  topicPopularity: { topic: string; launch_count: number }[];
  capabilityPopularity: { capability: string; launch_count: number }[];
}

const COLORS = ["#29B5E8", "#11567F", "#0c2340", "#4ecdc4", "#ff6b6b", "#feca57", "#48dbfb", "#ff9ff3"];

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [userFilter, setUserFilter] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      if (userFilter) params.set("user", userFilter);

      const res = await fetch(`/api/analytics?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      const json = await res.json();
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, userFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Demo usage, engagement, and popularity metrics</p>
        </div>
        <Link
          href="/admin"
          className="text-sm font-medium text-[var(--sf-blue)] hover:text-[var(--sf-dark)] transition-colors"
        >
          Back to Admin
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 shadow-sm flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">User</label>
          <input
            type="text"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder="Filter by user..."
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sf-blue)]"
          />
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-1.5 bg-[var(--sf-blue)] text-white text-sm font-medium rounded-lg hover:bg-[var(--sf-dark)] transition-colors"
        >
          Apply
        </button>
        <button
          onClick={() => { setFromDate(""); setToDate(""); setUserFilter(""); }}
          className="px-4 py-1.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Clear
        </button>
      </div>

      {loading && (
        <div className="text-center py-20 text-gray-500">Loading analytics...</div>
      )}

      {error && (
        <div className="text-center py-20 text-red-500">{error}</div>
      )}

      {data && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <MetricCard label="Total Sessions" value={data.summary.totalSessions} />
            <MetricCard label="Unique Users" value={data.summary.uniqueUsers} />
            <MetricCard label="Avg Duration" value={`${data.summary.avgDurationMinutes} min`} />
            <MetricCard label="Demos Used" value={data.summary.totalDemos} />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Usage Over Time */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Usage Over Time</h3>
              {data.usageOverTime.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={data.usageOverTime}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="launch_count" stroke="#29B5E8" strokeWidth={2} dot={{ r: 3 }} name="Launches" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 py-10 text-center">No data yet</p>
              )}
            </div>

            {/* Top Demos */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Top Demos</h3>
              {data.usageByDemo.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.usageByDemo} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip />
                    <Bar dataKey="launch_count" fill="#29B5E8" radius={[0, 4, 4, 0]} name="Launches" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 py-10 text-center">No data yet</p>
              )}
            </div>

            {/* Top Users */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Top Users</h3>
              {data.topUsers.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.topUsers}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="user_name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="launch_count" fill="#11567F" radius={[4, 4, 0, 0]} name="Launches" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 py-10 text-center">No data yet</p>
              )}
            </div>

            {/* Duration Distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Session Duration</h3>
              {data.durationDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={data.durationDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#4ecdc4" radius={[4, 4, 0, 0]} name="Sessions" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 py-10 text-center">No data yet</p>
              )}
            </div>

            {/* Topic Popularity */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Topic Popularity</h3>
              {data.topicPopularity.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={data.topicPopularity}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      dataKey="launch_count"
                      nameKey="topic"
                      label={(props) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {data.topicPopularity.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 py-10 text-center">No data yet</p>
              )}
            </div>

            {/* Capability Popularity */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Capability Popularity</h3>
              {data.capabilityPopularity.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={data.capabilityPopularity}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      dataKey="launch_count"
                      nameKey="capability"
                      label={(props) => `${props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {data.capabilityPopularity.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 py-10 text-center">No data yet</p>
              )}
            </div>
          </div>

          {/* Detailed Table */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mt-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Demo Details</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Demo</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Launches</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Total Time</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Unique Users</th>
                  </tr>
                </thead>
                <tbody>
                  {data.usageByDemo.map((d) => (
                    <tr key={d.demo_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-900">{d.name}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{d.launch_count}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{d.total_minutes} min</td>
                      <td className="py-2 px-3 text-right text-gray-700">{d.unique_users}</td>
                    </tr>
                  ))}
                  {data.usageByDemo.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-400">
                        No usage data yet. Analytics will populate as demos are launched.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
