"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useHubUser } from "@/components/UserProvider";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type PublicUser = {
  id: string;
  username: string;
  name: string;
  avatar_url: string;
  bio: string;
  links?: { label?: string; url: string; note?: string }[];
  created_at: string;
};

type AppItem = {
  id: string;
  name: string;
  problem: string;
  icon_url: string;
  likes_count: number;
  publisher: string;
  publisher_avatar: string;
};

function Avatar({ src, name, size = 96 }: { src?: string; name?: string; size?: number }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={name || "User"}
        width={size}
        height={size}
        className="rounded-2xl object-cover border border-[var(--border)]"
        style={{ width: size, height: size }}
        unoptimized
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-3xl font-bold text-[var(--accent)] border border-[var(--border)]"
      style={{ width: size, height: size }}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

export default function PublicPublisherPage() {
  const params = useParams();
  const username = (params.username as string) || "";
  const { hubUser } = useHubUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [appCount, setAppCount] = useState(0);
  const [likesSum, setLikesSum] = useState(0);
  const [commentCount, setCommentCount] = useState(0);

  const isOwner = !!(hubUser?.username && user?.username && hubUser.username === user.username);

  useEffect(() => {
    if (!username) return;
    document.title = `@${username} · OpenApp Hub`;
    setLoading(true);
    fetch(`${API_URL}/api/users/by-username/${encodeURIComponent(username)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Publisher not found");
        return r.json();
      })
      .then((data) => {
        setUser(data.user);
        setApps(Array.isArray(data.apps) ? data.apps : []);
        setAppCount(data.app_count || 0);
        setLikesSum(data.likes_sum || 0);
        setCommentCount(data.comment_count || 0);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
    return () => {
      document.title = "OpenApp Hub";
    };
  }, [username]);

  if (loading) {
    return (
      <>
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
        </main>
        <Footer />
      </>
    );
  }

  if (error || !user) {
    return (
      <>
        <Header />
        <main className="flex flex-1 flex-col items-center justify-center px-4">
          <p className="text-lg text-[var(--muted)]">{error || "Not found"}</p>
          <Link href="/" className="mt-4 text-sm text-[var(--accent)] hover:underline">
            ← Home
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const links = Array.isArray(user.links) ? user.links.filter((l) => l?.url) : [];

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <Avatar src={user.avatar_url} name={user.name || user.username} size={96} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {user.name || user.username}
                </h1>
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">@{user.username}</p>
              {user.bio && (
                <p className="mt-3 max-w-xl text-sm leading-relaxed whitespace-pre-wrap">{user.bio}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-[var(--muted)]">
                <span>
                  <strong className="text-[var(--foreground)]">{appCount}</strong> apps
                </span>
                <span>
                  <strong className="text-[var(--foreground)]">{likesSum}</strong> likes
                </span>
                <span>
                  <strong className="text-[var(--foreground)]">{commentCount}</strong> comments
                </span>
                {user.created_at && (
                  <span>
                    Joined{" "}
                    {new Date(user.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
              {links.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-3">
                  {links.map((l, i) => (
                    <li key={i}>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[var(--accent)] hover:underline"
                      >
                        {l.label || l.url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {isOwner && (
            <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
              <Link
                href="/profile"
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-center text-sm font-medium transition hover:bg-[var(--card)]"
              >
                Edit profile
              </Link>
              <Link
                href="/publish"
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-[var(--accent-hover)]"
              >
                Publish app
              </Link>
            </div>
          )}
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            {isOwner ? "Your apps" : `Apps by ${user.name || user.username}`}
          </h2>
        </div>

        {apps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] px-6 py-12 text-center">
            <p className="text-sm text-[var(--muted)]">No apps published yet.</p>
            {isOwner && (
              <Link
                href="/publish"
                className="mt-4 inline-block text-sm font-medium text-[var(--accent)] hover:underline"
              >
                Publish your first app →
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((app) => (
              <div
                key={app.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--accent)]/40"
              >
                <Link href={`/app/${app.id}`} className="block">
                  <div className="flex items-start gap-3">
                    {app.icon_url ? (
                      <Image
                        src={app.icon_url}
                        alt=""
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-xl object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15 font-bold text-[var(--accent)]">
                        {app.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">{app.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{app.problem}</p>
                      <p className="mt-2 text-xs text-[var(--muted)]">♥ {app.likes_count || 0}</p>
                    </div>
                  </div>
                </Link>
                {isOwner && (
                  <div className="mt-3 flex gap-2 border-t border-[var(--border)] pt-3">
                    <Link
                      href={`/app/${app.id}`}
                      className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      View
                    </Link>
                    <Link
                      href={`/app/${app.id}/edit`}
                      className="text-xs font-medium text-[var(--accent)] hover:underline"
                    >
                      Edit
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
