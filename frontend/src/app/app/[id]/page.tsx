"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  created_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function AppIcon({ src, name, size = 56 }: { src?: string; name: string; size?: number }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={`${name} icon`}
        width={size}
        height={size}
        className="rounded-2xl object-cover"
        style={{ width: size, height: size }}
        unoptimized
      />
    );
  }
  const letter = (name || "A").charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-xl font-bold text-[var(--accent)]"
      style={{ width: size, height: size }}
    >
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
        width={24}
        height={24}
        className="h-6 w-6 rounded-full object-cover"
        unoptimized
      />
    );
  }
  const letter = (name || "A").charAt(0).toUpperCase();
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--border)] text-xs font-medium text-[var(--muted)]">
      {letter}
    </div>
  );
}

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
      <>
        <Header showPublish={false} />
        <main className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
        </main>
        <Footer />
      </>
    );
  }

  if (error || !app) {
    return (
      <>
        <Header showPublish={false} />
        <main className="flex flex-1 flex-col items-center justify-center px-4">
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
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header showPublish={false} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
        <div className="mb-8">
          <Link
            href="/"
            className="mb-4 inline-block text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            ← All apps
          </Link>

          <div className="flex items-start gap-4">
            <AppIcon src={app.icon_url} name={app.name} size={64} />
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {app.name}
              </h1>
              <div className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
                <PublisherAvatar src={app.publisher_avatar} name={app.publisher} />
                <span>Published by {app.publisher || "Anonymous"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Problem it solves
            </h2>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed">
              {app.problem}
            </p>
          </section>

          {app.significance && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Why it matters
              </h2>
              <p className="mt-3 whitespace-pre-wrap leading-relaxed">
                {app.significance}
              </p>
            </section>
          )}

          {app.how_to_use && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                How to use it
              </h2>
              <p className="mt-3 whitespace-pre-wrap leading-relaxed">
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
      <Footer />
    </>
  );
}
