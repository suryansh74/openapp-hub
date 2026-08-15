"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

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
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [apps, setApps] = useState<AppItem[]>([]);
  const [appCount, setAppCount] = useState(0);
  const [likesSum, setLikesSum] = useState(0);

  useEffect(() => {
    if (!username) return;
    document.title = `@${username} · OpenApp Hub`;
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

  const isOwner =
    session?.user &&
    user &&
    // owner if emails match via comparing after fetch of me — we only have public user; compare via session name is weak
    // We'll treat owner if they visit /profile instead; here show Edit only if session exists and username matches a fetch
    false;

  // Check ownership via me endpoint
  const [ownUsername, setOwnUsername] = useState<string | null>(null);
  useEffect(() => {
    if (!session?.user?.email) return;
    fetch(`${API_URL}/api/user?email=${encodeURIComponent(session.user.email)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setOwnUsername(d.username || ""))
      .catch(() => {});
  }, [session?.user?.email]);

  const showEdit = ownUsername && user && ownUsername === user.username;

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
        <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-start">
          <Avatar src={user.avatar_url} name={user.name || user.username} size={96} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {user.name || user.username}
              </h1>
              {showEdit && (
                <Link
                  href="/profile"
                  className="rounded-lg border border-[var(--border)] px-3 py-1 text-sm transition hover:bg-[var(--card)]"
                >
                  Edit profile
                </Link>
              )}
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

        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Apps by {user.name || user.username}
        </h2>
        {apps.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No apps published yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((app) => (
              <Link
                key={app.id}
                href={`/app/${app.id}`}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--accent)]/40"
              >
                <div className="flex items-start gap-3">
                  {app.icon_url ? (
                    <Image src={app.icon_url} alt="" width={40} height={40} className="h-10 w-10 rounded-xl object-cover" unoptimized />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/15 font-bold text-[var(--accent)]">
                      {app.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{app.name}</h3>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{app.problem}</p>
                    <p className="mt-2 text-xs text-[var(--muted)]">♥ {app.likes_count || 0}</p>
                  </div>
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
