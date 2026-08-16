"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

type App = {
  id: string;
  name: string;
  problem: string;
  significance: string;
  how_to_use: string;
  download_url: string;
  icon_url: string;
  publisher: string;
  publisher_avatar: string;
  publisher_username?: string;
  created_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function AppIcon({ src, name }: { src?: string; name: string }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={`${name} icon`}
        width={40}
        height={40}
        className="h-10 w-10 rounded-xl object-cover"
        unoptimized
      />
    );
  }
  // Fallback: first letter in a colored box
  const letter = (name || "A").charAt(0).toUpperCase();
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-sm font-bold text-[var(--accent)]">
      {letter}
    </div>
  );
}

function PublisherAvatar({ src, name }: { src?: string; name?: string }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={name || "Publisher"}
        width={20}
        height={20}
        className="h-5 w-5 rounded-full object-cover"
        unoptimized
      />
    );
  }
  const letter = (name || "A").charAt(0).toUpperCase();
  return (
    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--border)] text-[10px] font-medium text-[var(--muted)]">
      {letter}
    </div>
  );
}

export default function Home() {
  useEffect(() => {
    document.title = "OpenApp Hub";
  }, []);

  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 12;

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (searchQuery) params.set("q", searchQuery);
    fetch(`${API_URL}/api/apps?${params}`)
      .then(async (res) => {
        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Too many requests — please wait a moment");
        }
        return res.json();
      })
      .then((data) => {
        // Support both new paginated shape and legacy array
        if (Array.isArray(data)) {
          setApps(data);
          setTotalPages(1);
          setTotal(data.length);
        } else {
          setApps(Array.isArray(data.items) ? data.items : []);
          setTotalPages(data.total_pages || 1);
          setTotal(data.total || 0);
        }
        setLoading(false);
      })
      .catch((err) => {
        setApps([]);
        setLoading(false);
        console.error(err);
      });
  }, [searchQuery, page]);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
        <section className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Discover open-source apps
          </h1>
          <p className="mt-3 max-w-xl text-[var(--muted)]">
            Clear explanations of what each app does, why it matters, and how
            to use it — built for humans, not just developers.
          </p>
          <div className="mt-6 max-w-lg">
            <label className="sr-only" htmlFor="app-search">
              Search apps
            </label>
            <div className="relative">
              <svg
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                id="app-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, problem, or publisher…"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--accent)]"
              />
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
          </div>
        ) : apps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center">
            <p className="text-lg text-[var(--muted)]">
              {searchQuery ? `No apps match “${searchQuery}”.` : "No apps published yet."}
            </p>
            {!searchQuery && (
              <Link
                href="/publish"
                className="mt-4 inline-block text-sm font-medium text-[var(--accent)] hover:underline"
              >
                Be the first to publish →
              </Link>
            )}
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="mt-4 text-sm font-medium text-[var(--accent)] hover:underline"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {apps.map((app) => (
              <div
                key={app.id}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-zinc-500/40 hover:bg-[var(--card-hover)]"
              >
                <Link href={`/app/${app.id}`} className="block">
                  <div className="flex items-start gap-3.5">
                    <AppIcon src={app.icon_url} name={app.name} />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold leading-tight">{app.name}</h2>
                      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[var(--muted)]">
                        {app.problem}
                      </p>
                    </div>
                  </div>
                </Link>
                <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <PublisherAvatar src={app.publisher_avatar} name={app.publisher_username || app.publisher} />
                    {app.publisher_username ? (
                      <Link
                        href={`/u/${app.publisher_username}`}
                        className="truncate hover:text-[var(--foreground)] hover:underline"
                      >
                        @{app.publisher_username}
                      </Link>
                    ) : (
                      <span className="truncate">by {app.publisher || "Anonymous"}</span>
                    )}
                  </div>
                  <Link href={`/app/${app.id}`} className="opacity-0 transition group-hover:opacity-100 shrink-0">
                    View →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-sm text-[var(--muted)]">
              {total} app{total === 1 ? "" : "s"}
              {searchQuery ? ` matching “${searchQuery}”` : ""}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:bg-[var(--card)] disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-[var(--muted)]">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:bg-[var(--card)] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
