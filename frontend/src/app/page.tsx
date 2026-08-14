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
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/apps`)
      .then((res) => res.json())
      .then((data) => {
        setApps(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setApps([]);
        setLoading(false);
      });
  }, []);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
        <section className="mb-12">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Discover open-source apps
          </h1>
          <p className="mt-3 max-w-xl text-[var(--muted)]">
            Clear explanations of what each app does, why it matters, and how
            to use it — built for humans, not just developers.
          </p>
        </section>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
          </div>
        ) : apps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-16 text-center">
            <p className="text-lg text-[var(--muted)]">No apps published yet.</p>
            <Link
              href="/publish"
              className="mt-4 inline-block text-sm font-medium text-[var(--accent)] hover:underline"
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
                className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-zinc-500/40 hover:bg-[var(--card-hover)]"
              >
                <div className="flex items-start gap-3.5">
                  <AppIcon src={app.icon_url} name={app.name} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold leading-tight">{app.name}</h2>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[var(--muted)]">
                      {app.problem}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted)]">
                  <div className="flex items-center gap-2">
                    <PublisherAvatar src={app.publisher_avatar} name={app.publisher} />
                    <span>by {app.publisher || "Anonymous"}</span>
                  </div>
                  <span className="opacity-0 transition group-hover:opacity-100">
                    View →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
