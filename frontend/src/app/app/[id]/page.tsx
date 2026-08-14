"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type App = {
  id: string;
  name: string;
  problem: string;
  significance: string;
  how_to_use: string;
  download_url: string;
  publisher: string;
  created_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function AppDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [app, setApp] = useState<App | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;

    fetch(`${API_URL}/api/apps/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("App not found");
        return res.json();
      })
      .then((data) => {
        setApp(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-8 py-12 text-center">
          <p className="text-lg text-[var(--muted)]">
            {error || "App not found"}
          </p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm font-medium text-[var(--accent)] hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
              O
            </div>
            <span className="text-lg font-semibold tracking-tight">
              OpenApp Hub
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm text-[var(--muted)] transition hover:text-white"
          >
            ← All apps
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {app.name}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Published by {app.publisher || "Anonymous"}
          </p>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Problem it solves
            </h2>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed text-zinc-200">
              {app.problem}
            </p>
          </section>

          {app.significance && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Why it matters
              </h2>
              <p className="mt-3 whitespace-pre-wrap leading-relaxed text-zinc-200">
                {app.significance}
              </p>
            </section>
          )}

          {app.how_to_use && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                How to use it
              </h2>
              <p className="mt-3 whitespace-pre-wrap leading-relaxed text-zinc-200">
                {app.how_to_use}
              </p>
            </section>
          )}
        </div>

        {app.download_url && (
          <div className="mt-10">
            <a
              href={app.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3.5 font-medium text-white transition hover:bg-[var(--accent-hover)]"
            >
              Get the app
              <span aria-hidden>→</span>
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
