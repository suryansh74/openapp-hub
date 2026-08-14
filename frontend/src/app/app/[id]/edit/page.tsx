"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import Header from "@/components/Header";
import { useToast } from "@/components/Toast";
import Footer from "@/components/Footer";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const MAX_SHOTS = 6;
const MAX_SIZE = 1 * 1024 * 1024; // 1MB

type App = {
  id: string;
  name: string;
  problem: string;
  significance: string;
  how_to_use: string;
  download_url: string;
  icon_url: string;
  youtube_url?: string;
  screenshots?: string[] | string;
  publisher: string;
  publisher_avatar: string;
  user_id: string;
};

async function uploadFile(file: File): Promise<string> {
  if (file.size > MAX_SIZE) {
    throw new Error(`"${file.name}" is larger than 1MB`);
  }
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

export default function EditAppPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { data: session, status } = useSession();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  const iconInputRef = useRef<HTMLInputElement>(null);
  const shotsInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (!id) return;

    fetch(`${API_URL}/api/apps/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("App not found");
        return res.json();
      })
      .then((data: App) => {
        let list: string[] = [];
        try {
          if (Array.isArray(data.screenshots)) list = data.screenshots;
          else if (typeof data.screenshots === "string") list = JSON.parse(data.screenshots || "[]");
        } catch {}
        setForm({
          name: data.name || "",
          problem: data.problem || "",
          significance: data.significance || "",
          how_to_use: data.how_to_use || "",
          download_url: data.download_url || "",
          icon_url: data.icon_url || "",
          youtube_url: data.youtube_url || "",
          publisher: data.publisher || "",
        });
        setShots(list);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id, status, router]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
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
    const toUpload = files.slice(0, remaining);
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of toUpload) {
        const url = await uploadFile(f);
        urls.push(url);
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

  const removeShot = (idx: number) => {
    setShots((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const payload = {
        ...form,
        screenshots: shots,
        publisher_avatar: session?.user?.image || "",
      };

      const res = await fetch(`${API_URL}/api/apps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update");
      }

      toast("App updated successfully!", "success");
      router.push(`/app/${id}`);
    } catch (err: any) {
      const msg = err.message || "Something went wrong";
      setError(msg);
      toast(msg, "error");
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

  if (error && !form.name) {
    return (
      <>
        <Header showPublish={false} />
        <main className="flex flex-1 flex-col items-center justify-center px-4">
          <p className="text-lg text-[var(--muted)]">{error}</p>
          <Link href="/" className="mt-4 text-sm text-[var(--accent)] hover:underline">
            ← Back to home
          </Link>
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
            href={`/app/${id}`}
            className="mb-4 inline-block text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            ← Back to app
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Edit app</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Update details, upload icon & screenshots (max 1MB each).
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
            />
          </div>

          {/* Icon upload */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">App icon</label>
            <div className="flex items-center gap-4">
              {form.icon_url ? (
                <Image
                  src={form.icon_url}
                  alt="Icon"
                  width={56}
                  height={56}
                  className="h-14 w-14 rounded-xl object-cover border border-[var(--border)]"
                  unoptimized
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-lg font-bold text-[var(--accent)]">
                  {(form.name || "A").charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <input
                  ref={iconInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleIconUpload}
                  className="hidden"
                  id="icon-upload"
                />
                <label
                  htmlFor="icon-upload"
                  className="cursor-pointer rounded-lg border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-[var(--card)]"
                >
                  {uploading ? "Uploading..." : "Upload icon"}
                </label>
                {form.icon_url && (
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, icon_url: "" }))}
                    className="ml-2 text-xs text-red-500 hover:underline"
                  >
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
            <textarea
              name="problem"
              required
              rows={3}
              value={form.problem}
              onChange={handleChange}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Why it matters</label>
            <textarea
              name="significance"
              rows={3}
              value={form.significance}
              onChange={handleChange}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">How to use it</label>
            <textarea
              name="how_to_use"
              rows={4}
              value={form.how_to_use}
              onChange={handleChange}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Download / Link</label>
            <input
              name="download_url"
              type="url"
              value={form.download_url}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">YouTube video URL</label>
            <input
              name="youtube_url"
              type="url"
              value={form.youtube_url}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder="https://youtube.com/watch?v=... or youtu.be/..."
            />
          </div>

          {/* Screenshots upload */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Screenshots ({shots.length}/{MAX_SHOTS})
            </label>
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {shots.map((url, i) => (
                <div key={i} className="group relative aspect-video overflow-hidden rounded-lg border border-[var(--border)]">
                  <Image src={url} alt={`Shot ${i + 1}`} fill className="object-cover" unoptimized />
                  <button
                    type="button"
                    onClick={() => removeShot(i)}
                    className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white opacity-0 transition group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {shots.length < MAX_SHOTS && (
                <label
                  htmlFor="shots-upload"
                  className="flex aspect-video cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  {uploading ? "..." : "+ Add"}
                </label>
              )}
            </div>
            <input
              ref={shotsInputRef}
              id="shots-upload"
              type="file"
              accept="image/*"
              multiple
              onChange={handleShotsUpload}
              className="hidden"
            />
            <p className="text-xs text-[var(--muted)]">
              Upload up to {MAX_SHOTS} images · Max 1MB each · Select multiple at once
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Publisher name</label>
            <input
              name="publisher"
              value={form.publisher}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || uploading}
              className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-3.5 font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
            <Link
              href={`/app/${id}`}
              className="rounded-xl border border-[var(--border)] px-4 py-3.5 text-sm font-medium transition hover:bg-[var(--card)]"
            >
              Cancel
            </Link>
          </div>
        </form>
      </main>
      <Footer />
    </>
  );
}
