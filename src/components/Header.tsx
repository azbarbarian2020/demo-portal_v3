"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function Header() {
  const [title, setTitle] = useState("Demo Portal");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.portal_title) setTitle(data.portal_title);
        if (data.portal_logo) setLogoUrl(`/api/image?path=${encodeURIComponent(data.portal_logo)}&t=${Date.now()}`);
      })
      .catch(() => {});
  }, []);

  return (
    <header className="bg-gradient-to-r from-[#0c2340] to-[#11567F] px-8 py-5 flex items-center justify-between shadow-lg">
      <Link href="/" className="flex items-center gap-4">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={title}
            className="h-16 w-16 rounded-full object-contain bg-white/10"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-white/10 flex items-center justify-center">
            <svg className="w-9 h-9 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
        )}
        <div>
          <h1 className="text-white text-lg font-bold tracking-wide">{title}</h1>
        </div>
      </Link>
      <nav className="flex items-center gap-4">
        <Link
          href="/admin/analytics"
          className="text-sm font-medium text-blue-200 hover:text-white transition-colors px-3 py-1.5 rounded-md hover:bg-white/10"
        >
          Analytics
        </Link>
        <Link
          href="/admin"
          className="text-sm font-medium text-blue-200 hover:text-white transition-colors px-3 py-1.5 rounded-md hover:bg-white/10"
        >
          Admin
        </Link>
      </nav>
    </header>
  );
}
