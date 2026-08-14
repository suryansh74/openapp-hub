"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function PublishPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    problem: "",
    significance: "",
    how_to_use: "",
    download_url: "",
    publisher: "",
  });

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
      router.push(`/app/${data.id}`);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setLoading(false);
    }
  };

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
          <h1 className="text-3xl font-bold tracking-tight">Publish an App</h1>
          <p className="mt-2 text-[var(--muted)]">
            Keep it simple. Focus on the problem your software solves and how
            people can use it.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              App Name <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              required
              value={form.name}
              onChange={handleChange}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder="e.g. Simple Inventory"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              What problem does it solve? <span className="text-red-500">*</span>
            </label>
            <textarea
              name="problem"
              required
              rows={3}
              value={form.problem}
              onChange={handleChange}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              placeholder="Describe the real problem this app fixes..."
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Why does it matter?
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
