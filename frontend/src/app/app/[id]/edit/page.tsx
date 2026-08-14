"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Header from "@/components/Header";
import { useToast } from "@/components/Toast";
import Footer from "@/components/Footer";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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

export default function EditAppPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { data: session, status } = useSession();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    problem: "",
    significance: "",
    how_to_use: "",
    download_url: "",
    icon_url: "",
    youtube_url: "",
    screenshots: "" as string, // comma or newline separated URLs for simplicity
    publisher: "",
  });

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
        let shots: string[] = [];
        try {
          if (Array.isArray(data.screenshots)) shots = data.screenshots;
          else if (typeof data.screenshots === "string") shots = JSON.parse(data.screenshots || "[]");
        } catch {}
        setForm({
          name: data.name || "",
          problem: data.problem || "",
          significance: data.significance || "",
          how_to_use: data.how_to_use || "",
          download_url: data.download_url || "",
          icon_url: data.icon_url || "",
          youtube_url: data.youtube_url || "",
          screenshots: shots.join("\n"),
          publisher: data.publisher || "",
        });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      // Keep publisher avatar in sync with current session image
      const shots = form.screenshots
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        name: form.name,
        problem: form.problem,
        significance: form.significance,
        how_to_use: form.how_to_use,
        download_url: form.download_url,
        icon_url: form.icon_url,
        youtube_url: form.youtube_url,
        screenshots: shots,
        publisher: form.publisher,
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
            Update details, icon, or description.
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

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Icon URL
            </label>
            <input
              name="icon_url"
              type="url"
              value={form.icon_url}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder="https://... (square image recommended)"
            />
            {form.icon_url && (
              <div className="mt-3 flex items-center gap-3">
                <img
                  src={form.icon_url}
                  alt="Preview"
                  className="h-12 w-12 rounded-xl object-cover border border-[var(--border)]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <span className="text-xs text-[var(--muted)]">Preview</span>
              </div>
            )}
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
            <label className="mb-1.5 block text-sm font-medium">
              Why it matters
            </label>
            <textarea
              name="significance"
              rows={3}
              value={form.significance}
              onChange={handleChange}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              How to use it
            </label>
            <textarea
              name="how_to_use"
              rows={4}
              value={form.how_to_use}
              onChange={handleChange}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Download / Link
            </label>
            <input
              name="download_url"
              type="url"
              value={form.download_url}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              YouTube video URL
            </label>
            <input
              name="youtube_url"
              type="url"
              value={form.youtube_url}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder="https://youtube.com/watch?v=... or youtu.be/..."
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Screenshots (one URL per line)
            </label>
            <textarea
              name="screenshots"
              rows={3}
              value={form.screenshots}
              onChange={handleChange}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder={"https://res.cloudinary.com/.../shot1.png\nhttps://..."}
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Paste image URLs (Cloudinary or any public URL). Max 1MB per image when uploading.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Publisher name
            </label>
            <input
              name="publisher"
              value={form.publisher}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
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
