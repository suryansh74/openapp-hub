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
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50">
        <p className="text-zinc-600">{error || "App not found"}</p>
        <Link href="/" className="mt-4 text-sm underline">
          ← Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            OpenApp Hub
          </Link>
          <Link href="/" className="text-sm text-zinc-600 hover:text-zinc-900">
            ← All apps
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{app.name}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Published by {app.publisher || "Anonymous"}
        </p>

        <section className="mt-8 rounded-xl border bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Problem it solves
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-zinc-800">{app.problem}</p>
        </section>

        {app.significance && (
          <section className="mt-4 rounded-xl border bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Why it matters
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-zinc-800">
              {app.significance}
            </p>
          </section>
        )}

        {app.how_to_use && (
          <section className="mt-4 rounded-xl border bg-white p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              How to use it
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-zinc-800">
              {app.how_to_use}
            </p>
          </section>
        )}

        {app.download_url && (
          <div className="mt-8">
            <a
              href={app.download_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg bg-zinc-900 px-5 py-3 font-medium text-white hover:bg-zinc-700"
            >
              Get the app →
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
