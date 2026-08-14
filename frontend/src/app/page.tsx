"use client";

import { useEffect, useState } from "react";
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

export default function Home() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/apps`)
      .then((res) => res.json())
      .then((data) => {
        setApps(data || []);
        setLoading(false);
      })
      .catch(() => {
        setApps([]);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            OpenApp Hub
          </Link>
          <Link
            href="/publish"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Publish an App
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Discover open-source apps
          </h1>
          <p className="mt-2 text-zinc-600">
            Clear explanations. Real problems solved. Built for humans.
          </p>
        </div>

        {loading ? (
          <p className="text-zinc-500">Loading apps...</p>
        ) : apps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
            <p className="text-zinc-600">No apps published yet.</p>
            <Link
              href="/publish"
              className="mt-4 inline-block text-sm font-medium text-zinc-900 underline"
            >
              Be the first to publish →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {apps.map((app) => (
              <Link
                key={app.id}
                href={`/app/${app.id}`}
                className="rounded-xl border bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <h2 className="text-lg font-semibold">{app.name}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
                  {app.problem}
                </p>
                <p className="mt-3 text-xs text-zinc-400">
                  by {app.publisher || "Anonymous"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
