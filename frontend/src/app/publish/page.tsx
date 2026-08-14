"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Header from "@/components/Header";
import { useToast } from "@/components/Toast";
import Footer from "@/components/Footer";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function PublishPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    problem: "",
    significance: "",
    how_to_use: "",
    download_url: "",
    icon_url: "",
    publisher: "",
    publisher_avatar: "",
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    if (session?.user) {
      setForm((prev) => ({
        ...prev,
        publisher: session.user?.name || prev.publisher,
        publisher_avatar: session.user?.image || prev.publisher_avatar,
      }));
    }
  }, [status, session, router]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
          <Link
            href="/"
            className="mb-4 inline-block text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
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
              placeholder="https://... (optional – square image works best)"
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Leave empty to use a letter avatar. Prefer 128×128 or larger PNG/JPG/SVG.
            </p>
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
              placeholder="What problem does this app solve in simple words?"
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
              placeholder="Who is it for and why is it useful?"
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
              placeholder="Simple steps so a non-technical person can start using it..."
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
              placeholder="https://github.com/... or direct download"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Your name (Publisher)
            </label>
            <input
              name="publisher"
              value={form.publisher}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder="Optional"
            />
          </div>

          {/* Hidden field – auto-filled from session */}
          <input type="hidden" name="publisher_avatar" value={form.publisher_avatar} />

          {error && (
            <p className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[var(--accent)] px-4 py-3.5 font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {loading ? "Publishing..." : "Publish App"}
          </button>
        </form>
      </main>
      <Footer />
    </>
  );
}
