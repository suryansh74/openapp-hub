"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useToast } from "@/components/Toast";
import { useHubUser } from "@/components/UserProvider";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const MAX_SIZE = 1 * 1024 * 1024;

type AppLink = { label: string; url: string; note: string };

async function uploadFile(file: File): Promise<string> {
  if (file.size > MAX_SIZE) throw new Error("Image must be under 1MB");
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_URL}/api/upload`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text() || "Upload failed");
  const data = await res.json();
  return data.url as string;
}


function slugifyBase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^_+/, "")
    .slice(0, 30);
}

/** Prefer GitHub login; otherwise name/email local-part; append 0,1,2… if taken */
async function suggestAvailableUsername(session: {
  user?: {
    name?: string | null;
    email?: string | null;
    provider?: string;
    githubLogin?: string;
  } | null;
}): Promise<string> {
  const u = session?.user;
  if (!u) return "";

  let base = "";
  if (u.provider === "github" && u.githubLogin) {
    base = slugifyBase(u.githubLogin);
  } else if (u.name) {
    base = slugifyBase(u.name.split(/\s+/)[0] || u.name);
  }
  if (!base || base.length < 3) {
    const local = (u.email || "").split("@")[0] || "user";
    base = slugifyBase(local);
  }
  if (base.length < 3) base = (base + "user").slice(0, 30);

  for (let i = 0; i < 30; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 28)}${i}`;
    try {
      const r = await fetch(
        `${API_URL}/api/username/check?u=${encodeURIComponent(candidate)}`
      );
      const data = await r.json();
      if (data.available) return candidate;
    } catch {
      return candidate;
    }
  }
  return `${base}${Date.now().toString().slice(-4)}`;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const { refresh: refreshHubUser } = useHubUser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [originalUsername, setOriginalUsername] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [bio, setBio] = useState("");
  const [links, setLinks] = useState<AppLink[]>([]);

  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "ok" | "bad">("idle");
  const [usernameReason, setUsernameReason] = useState("");
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Profile · OpenApp Hub";
    return () => {
      document.title = "OpenApp Hub";
    };
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (!session?.user?.email) return;

    fetch(`${API_URL}/api/user?email=${encodeURIComponent(session.user.email)}`)
      .then(async (r) => {
        if (r.status === 404) {
          // create skeleton
          const res = await fetch(`${API_URL}/api/users`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: session.user!.email,
              name: session.user!.name || "",
              avatar_url: session.user!.image || "",
              provider: "oauth",
            }),
          });
          return res.json();
        }
        if (!r.ok) throw new Error("Failed to load profile");
        return r.json();
      })
      .then(async (data) => {
        setUserId(data.id || "");
        setEmail(data.email || session.user!.email || "");
        const existing = (data.username || "").toLowerCase();
        setOriginalUsername(existing);
        setName(data.name || session.user!.name || "");
        // Prefer OpenApp Hub avatar; OAuth image only as fallback
        setAvatar(data.avatar_url || session.user!.image || "");
        setBio(data.bio || "");
        let lk: AppLink[] = [];
        try {
          if (Array.isArray(data.links)) lk = data.links;
        } catch {}
        setLinks(lk.map((l: any) => ({ label: l.label || "", url: l.url || "", note: l.note || "" })));

        if (existing) {
          setUsername(existing);
          setUsernameStatus("ok");
          setUsernameReason("This is your current username");
        } else {
          // Suggest unique username from GitHub login or display name
          const suggested = await suggestAvailableUsername(session);
          setUsername(suggested);
          if (suggested) {
            // trigger validation UI
            setUsernameStatus("checking");
            try {
              const q = new URLSearchParams({ u: suggested });
              if (data.id) q.set("except_user_id", data.id);
              const r = await fetch(`${API_URL}/api/username/check?${q}`);
              const chk = await r.json();
              if (chk.available) {
                setUsernameStatus("ok");
                setUsernameReason("Suggested — available");
              } else {
                setUsernameStatus("bad");
                setUsernameReason(chk.reason || "Not available");
              }
            } catch {
              setUsernameStatus("idle");
            }
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session, status, router]);

  const checkUsername = useCallback(
    (value: string) => {
      const v = value.trim().toLowerCase();
      if (checkTimer.current) clearTimeout(checkTimer.current);
      if (!v) {
        setUsernameStatus("idle");
        setUsernameReason("");
        return;
      }
      if (v === originalUsername) {
        setUsernameStatus("ok");
        setUsernameReason("This is your current username");
        return;
      }
      setUsernameStatus("checking");
      checkTimer.current = setTimeout(async () => {
        try {
          const q = new URLSearchParams({ u: v });
          if (userId) q.set("except_user_id", userId);
          const r = await fetch(`${API_URL}/api/username/check?${q}`);
          const data = await r.json();
          if (data.available) {
            setUsernameStatus("ok");
            setUsernameReason("Available");
          } else {
            setUsernameStatus("bad");
            setUsernameReason(data.reason || "Not available");
          }
        } catch {
          setUsernameStatus("bad");
          setUsernameReason("Could not check username");
        }
      }, 350);
    },
    [originalUsername, userId]
  );

  const onUsernameChange = (v: string) => {
    const cleaned = v.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setUsername(cleaned);
    checkUsername(cleaned);
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!session?.user?.email) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setAvatar(url);
      // Persist immediately so it reflects on public profile + apps
      const res = await fetch(`${API_URL}/api/users`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: session.user.email,
          avatar_url: url,
          username: originalUsername || username || undefined,
          name,
          bio,
          links: links.filter((l) => l.url.trim()),
        }),
      });
      if (!res.ok) throw new Error(await res.text() || "Failed to save avatar");
      await refreshHubUser();
      toast("Avatar updated", "success");
    } catch (err: any) {
      toast(err.message || "Upload failed", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    if (!session?.user?.email) return;
    if (!username) {
      toast("Username is required", "error");
      return;
    }
    if (usernameStatus === "bad") {
      toast(usernameReason || "Username not available", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/users`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: session.user.email,
          username,
          name,
          avatar_url: avatar,
          bio,
          links: links.filter((l) => l.url.trim()),
          provider: "oauth",
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed to save");
      }
      const data = await res.json();
      setOriginalUsername(data.username || username);
      setUsernameStatus("ok");
      await refreshHubUser();
      toast("Profile saved", "success");
    } catch (err: any) {
      toast(err.message || "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || loading) {
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

  const needsUsername = !originalUsername;

  return (
    <>
      <Header showPublish={false} />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            {needsUsername ? "Choose a username" : "Your profile"}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {needsUsername
              ? "Pick a unique handle so others can find you. You can change it later if it’s free."
              : "Manage how you appear as a publisher on OpenApp Hub."}
          </p>
        </div>

        <div className="space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            {avatar ? (
              <Image src={avatar} alt="" width={72} height={72} className="h-18 w-18 rounded-2xl object-cover border border-[var(--border)]" unoptimized />
            ) : (
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-2xl font-bold text-[var(--accent)]">
                {(name || username || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" id="avatar-up" onChange={handleAvatar} />
              <label htmlFor="avatar-up" className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--card)]">
                {uploading ? "Uploading..." : "Change avatar"}
              </label>
              <p className="mt-1 text-xs text-[var(--muted)]">Max 1MB</p>
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Username <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">@</span>
              <input
                value={username}
                onChange={(e) => onUsernameChange(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-3 pl-8 pr-4 text-sm outline-none focus:border-[var(--accent)]"
                placeholder="your_handle"
                autoComplete="off"
              />
            </div>
            <p
              className={`mt-1.5 text-xs ${
                usernameStatus === "ok"
                  ? "text-emerald-500"
                  : usernameStatus === "bad"
                    ? "text-red-500"
                    : "text-[var(--muted)]"
              }`}
            >
              {usernameStatus === "checking"
                ? "Checking..."
                : usernameReason || "3–30 characters · a-z, 0-9, underscore"}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="How your name appears"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Email</label>
            <input
              value={email}
              disabled
              className="w-full cursor-not-allowed rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--muted)]"
            />
            <p className="mt-1 text-xs text-[var(--muted)]">Only you can see this</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
              placeholder="Short intro (optional)"
            />
          </div>

          {/* Links */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">Profile links</label>
              <button
                type="button"
                onClick={() => setLinks((p) => [...p, { label: "", url: "", note: "" }])}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs hover:bg-[var(--card)]"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {links.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={l.label}
                    onChange={(e) =>
                      setLinks((p) => p.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))
                    }
                    placeholder="Label"
                    className="w-28 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                  <input
                    value={l.url}
                    onChange={(e) =>
                      setLinks((p) => p.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x)))
                    }
                    placeholder="https://"
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                  <button type="button" onClick={() => setLinks((p) => p.filter((_, idx) => idx !== i))} className="text-red-500 text-sm">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={save}
            disabled={saving || uploading || usernameStatus === "bad" || usernameStatus === "checking"}
            className="w-full rounded-xl bg-[var(--accent)] px-4 py-3.5 font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {saving ? "Saving..." : needsUsername ? "Save username" : "Save profile"}
          </button>

          {originalUsername && (
            <p className="text-center text-sm text-[var(--muted)]">
              Public profile:{" "}
              <Link href={`/u/${originalUsername}`} className="text-[var(--accent)] hover:underline">
                /u/{originalUsername}
              </Link>
            </p>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
