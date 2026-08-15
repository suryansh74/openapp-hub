"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import Header from "@/components/Header";
import { useToast } from "@/components/Toast";
import Footer from "@/components/Footer";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const MAX_SHOTS = 6;
const MAX_SIZE = 1 * 1024 * 1024;

type AppLink = { label: string; url: string; note: string };

async function uploadFile(file: File): Promise<string> {
  if (file.size > MAX_SIZE) throw new Error(`"${file.name}" is larger than 1MB`);
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_URL}/api/upload`, { method: "POST", body: fd });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Upload failed");
  }
  const data = await res.json();
  return data.url as string;
}

export default function PublishPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  useEffect(() => {
    document.title = "Publish an app · OpenApp Hub";
    return () => { document.title = "OpenApp Hub"; };
  }, []);

  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    problem: "",
    significance: "",
    how_to_use: "",
    download_url: "",
    icon_url: "",
    youtube_url: "",
    publisher: "",
  });
  const [shots, setShots] = useState<string[]>([]);
  const [links, setLinks] = useState<AppLink[]>([]);

  const iconInputRef = useRef<HTMLInputElement>(null);
  const shotsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (session?.user) {
      setForm((prev) => ({ ...prev, publisher: session.user?.name || prev.publisher }));
      // Require username before publishing
      fetch(`${API_URL}/api/user?email=${encodeURIComponent(session.user.email || "")}`)
        .then(async (r) => {
          if (r.status === 404) {
            router.push("/profile");
            return null;
          }
          return r.ok ? r.json() : null;
        })
        .then((data) => {
          if (data && !data.username) {
            router.push("/profile");
          }
        })
        .catch(() => {});
    }
  }, [status, session, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setForm((prev) => ({ ...prev, icon_url: url }));
      toast("Icon uploaded", "success");
    } catch (err: any) {
      toast(err.message || "Upload failed", "error");
    } finally {
      setUploading(false);
      if (iconInputRef.current) iconInputRef.current.value = "";
    }
  };

  const handleShotsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = MAX_SHOTS - shots.length;
    if (remaining <= 0) {
      toast(`Maximum ${MAX_SHOTS} screenshots allowed`, "error");
      return;
    }
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of files.slice(0, remaining)) {
        urls.push(await uploadFile(f));
      }
      setShots((prev) => [...prev, ...urls]);
      toast(`${urls.length} image(s) uploaded`, "success");
    } catch (err: any) {
      toast(err.message || "Upload failed", "error");
    } finally {
      setUploading(false);
      if (shotsInputRef.current) shotsInputRef.current.value = "";
    }
  };

  const addLink = () => setLinks((prev) => [...prev, { label: "", url: "", note: "" }]);
  const updateLink = (i: number, field: keyof AppLink, value: string) => {
    setLinks((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  };
  const removeLink = (i: number) => setLinks((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (session?.user?.email) {
        await fetch(`${API_URL}/api/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: session.user.email,
            name: session.user.name || "",
            avatar_url: session.user.image || "",
            provider: "oauth",
          }),
        });
      }

      const cleanLinks = links.filter((l) => l.url.trim());

      const res = await fetch(`${API_URL}/api/apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          screenshots: shots,
          links: cleanLinks,
          user_email: session?.user?.email || "",
          user_name: session?.user?.name || "",
          user_avatar: session?.user?.image || "",
          publisher_avatar: session?.user?.image || "",
          provider: "oauth",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to publish");
      }

      const data = await res.json();
      toast("App published successfully!", "success");
      router.push(`/app/${data.id}`);
    } catch (err: any) {
      const msg = err.message || "Something went wrong";
      setError(msg);
      toast(msg, "error");
      setLoading(false);
    }
  };

  if (status === "loading" || status === "unauthenticated") {
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

  return (
    <>
      <Header showPublish={false} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12">
        <div className="mb-8">
          <Link href="/" className="mb-4 inline-block text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
            ← Back
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Publish an app</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Help others discover your open-source project with a clear human-friendly description.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              App name <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              required
              value={form.name}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder="e.g. Hour Tracker"
            />
          </div>

          {/* Icon upload */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">App icon</label>
            <div className="flex items-center gap-4">
              {form.icon_url ? (
                <Image src={form.icon_url} alt="Icon" width={56} height={56} className="h-14 w-14 rounded-xl object-cover border border-[var(--border)]" unoptimized />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-lg font-bold text-[var(--accent)]">
                  {(form.name || "A").charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <input ref={iconInputRef} type="file" accept="image/*" onChange={handleIconUpload} className="hidden" id="pub-icon-upload" />
                <label htmlFor="pub-icon-upload" className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-[var(--card)]">
                  {uploading ? "Uploading..." : "Upload icon"}
                </label>
                {form.icon_url && (
                  <button type="button" onClick={() => setForm((p) => ({ ...p, icon_url: "" }))} className="ml-2 text-xs text-red-500 hover:underline">
                    Remove
                  </button>
                )}
                <p className="mt-1 text-xs text-[var(--muted)]">Max 1MB · PNG/JPG/WebP</p>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Problem it solves <span className="text-red-500">*</span>
            </label>
            <textarea name="problem" required rows={3} value={form.problem} onChange={handleChange}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder="What problem does this app solve in simple words?" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Why it matters</label>
            <textarea name="significance" rows={3} value={form.significance} onChange={handleChange}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder="Who is it for and why is it useful?" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">How to use it</label>
            <textarea name="how_to_use" rows={4} value={form.how_to_use} onChange={handleChange}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder="Simple steps so a non-technical person can start using it..." />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Download / primary link</label>
            <input name="download_url" type="url" value={form.download_url} onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder="https://github.com/... or direct download" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">YouTube video URL</label>
            <input name="youtube_url" type="url" value={form.youtube_url} onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder="https://youtube.com/watch?v=... or youtu.be/..." />
          </div>

          {/* Screenshots */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Screenshots ({shots.length}/{MAX_SHOTS})</label>
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {shots.map((url, i) => (
                <div key={i} className="group relative aspect-video overflow-hidden rounded-lg border border-[var(--border)]">
                  <Image src={url} alt={`Shot ${i + 1}`} fill className="object-cover" unoptimized />
                  <button type="button" onClick={() => setShots((p) => p.filter((_, idx) => idx !== i))}
                    className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white opacity-0 transition group-hover:opacity-100">✕</button>
                </div>
              ))}
              {shots.length < MAX_SHOTS && (
                <label htmlFor="pub-shots-upload"
                  className="flex aspect-video cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]">
                  {uploading ? "..." : "+ Add"}
                </label>
              )}
            </div>
            <input ref={shotsInputRef} id="pub-shots-upload" type="file" accept="image/*" multiple onChange={handleShotsUpload} className="hidden" />
            <p className="text-xs text-[var(--muted)]">Upload up to {MAX_SHOTS} images · Max 1MB each</p>
          </div>

          {/* Extra links */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium">More links</label>
              <button type="button" onClick={addLink}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs transition hover:bg-[var(--card)]">
                + Add link
              </button>
            </div>
            <p className="mb-3 text-xs text-[var(--muted)]">
              GitHub, portfolio, LinkedIn, docs, demo — any related source with a short note.
            </p>
            <div className="space-y-3">
              {links.map((link, i) => (
                <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={link.label}
                      onChange={(e) => updateLink(i, "label", e.target.value)}
                      placeholder="Label (e.g. GitHub, Portfolio)"
                      className="w-1/3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                    <input
                      value={link.url}
                      onChange={(e) => updateLink(i, "url", e.target.value)}
                      placeholder="https://..."
                      type="url"
                      className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                    <button type="button" onClick={() => removeLink(i)} className="px-2 text-red-500 text-sm hover:underline">✕</button>
                  </div>
                  <input
                    value={link.note}
                    onChange={(e) => updateLink(i, "note", e.target.value)}
                    placeholder="Short note (optional)"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </div>
              ))}
              {links.length === 0 && (
                <p className="text-xs text-[var(--muted)]">No extra links yet. Click “+ Add link”.</p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Your name (Publisher)</label>
            <input name="publisher" value={form.publisher} onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder="Optional" />
          </div>

          {error && <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}

          <button type="submit" disabled={loading || uploading}
            className="w-full rounded-xl bg-[var(--accent)] px-4 py-3.5 font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50">
            {loading ? "Publishing..." : "Publish App"}
          </button>
        </form>
      </main>
      <Footer />
    </>
  );
}
