"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useToast } from "@/components/Toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type App = {
  id: string;
  name: string;
  problem: string;
  significance: string;
  how_to_use: string;
  download_url: string;
  icon_url: string;
  screenshots: string[] | string;
  youtube_url: string;
  publisher: string;
  publisher_avatar: string;
  likes_count: number;
  dislikes_count: number;
  created_at: string;
};

type Comment = {
  id: string;
  app_id: string;
  parent_id: string | null;
  content: string;
  author_name: string;
  author_avatar: string;
  likes_count: number;
  dislikes_count: number;
  created_at: string;
};

function parseScreenshots(raw: string[] | string | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function getYoutubeEmbed(url: string): string | null {
  if (!url) return null;
  const m =
    url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/) ||
    url.match(/^([a-zA-Z0-9_-]{11})$/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

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

function Avatar({ src, name, size = 28 }: { src?: string; name?: string; size?: number }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={name || "User"}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        unoptimized
      />
    );
  }
  const letter = (name || "A").charAt(0).toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-full bg-[var(--border)] text-xs font-medium text-[var(--muted)]"
      style={{ width: size, height: size }}
    >
      {letter}
    </div>
  );
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}


function ScreenshotSlider({
  images,
  index,
  onClose,
  onChange,
}: {
  images: string[];
  index: number;
  onClose: () => void;
  onChange: (i: number) => void;
}) {
  const total = images.length;
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  const goPrev = useCallback(() => {
    onChange((index - 1 + total) % total);
  }, [index, total, onChange]);

  const goNext = useCallback(() => {
    onChange((index + 1) % total);
  }, [index, total, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    // lock body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [goPrev, goNext, onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  };
  const onTouchEnd = () => {
    if (Math.abs(touchDeltaX.current) > 50) {
      if (touchDeltaX.current > 0) goPrev();
      else goNext();
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/90"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar: counter + close */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white/90 sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-medium tabular-nums tracking-wide">
          {index + 1} / {total}
        </span>
        <button
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm transition hover:bg-white/10"
          aria-label="Close"
        >
          ✕ Close
        </button>
      </div>

      {/* Image area */}
      <div className="relative flex flex-1 items-center justify-center px-10 sm:px-12">
        {/* Prev button */}
        {total > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-1 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/30 sm:left-2"
            aria-label="Previous"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}

        <img
          src={images[index]}
          alt={`Screenshot ${index + 1} of ${total}`}
          className="max-h-[calc(100vh-8rem)] max-w-full select-none rounded-lg object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />

        {/* Next button */}
        {total > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="absolute right-1 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/30 sm:right-2"
            aria-label="Next"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Dot indicators */}
      {total > 1 && (
        <div
          className="flex items-center justify-center gap-1.5 pb-5 pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => onChange(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"
              }`}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}



function CommentNode({
  comment: c,
  depth,
  allComments,
  myVotes,
  session,
  voting,
  editingId,
  editText,
  replyTo,
  replyText,
  submitting,
  onVote,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onReplyToggle,
  onReplyText,
  onSubmitReply,
  setEditText,
}: {
  comment: Comment;
  depth: number;
  allComments: Comment[];
  myVotes: Record<string, number>;
  session: any;
  voting: boolean;
  editingId: string | null;
  editText: string;
  replyTo: string | null;
  replyText: string;
  submitting: boolean;
  onVote: (t: "app" | "comment", id: string, v: 1 | -1) => void;
  onStartEdit: (c: Comment) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onReplyToggle: (id: string) => void;
  onReplyText: (t: string) => void;
  onSubmitReply: (parentId: string) => void;
  setEditText: (t: string) => void;
}) {
  const children = allComments.filter((x) => x.parent_id === c.id);
  const myLike = myVotes[`comment:${c.id}`] === 1;
  const myDislike = myVotes[`comment:${c.id}`] === -1;
  const isOwner = session?.user?.name === c.author_name;
  const maxDepthPad = Math.min(depth, 6);

  return (
    <div className={depth > 0 ? "mt-4 border-l-2 border-[var(--border)] pl-3 sm:pl-4" : ""}>
      <div className="flex gap-3">
        <Avatar src={c.author_avatar} name={c.author_name} size={depth > 0 ? 24 : 28} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{c.author_name || "Anonymous"}</span>
            <span className="text-xs text-[var(--muted)]">{timeAgo(c.created_at)}</span>
          </div>
          {editingId === c.id ? (
            <div className="mt-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              <div className="mt-2 flex gap-2">
                <button onClick={() => onSaveEdit(c.id)} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs text-white">Save</button>
                <button onClick={onCancelEdit} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs">Cancel</button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">{c.content}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
            <button
              onClick={() => onVote("comment", c.id, 1)}
              disabled={voting}
              className={`inline-flex items-center gap-1 disabled:opacity-50 ${myLike ? "font-semibold text-emerald-400" : "hover:text-emerald-500"}`}
            >
              ▲ {c.likes_count || 0}
            </button>
            <button
              onClick={() => onVote("comment", c.id, -1)}
              disabled={voting}
              className={`inline-flex items-center gap-1 disabled:opacity-50 ${myDislike ? "font-semibold text-red-400" : "hover:text-red-500"}`}
            >
              ▼ {c.dislikes_count || 0}
            </button>
            {session && (
              <button onClick={() => onReplyToggle(c.id)} className="hover:text-[var(--foreground)]">
                Reply
              </button>
            )}
            {isOwner && editingId !== c.id && (
              <>
                <button onClick={() => onStartEdit(c)} className="hover:text-[var(--foreground)]">Edit</button>
                <button onClick={() => onDelete(c.id)} className="hover:text-red-500">Delete</button>
              </>
            )}
          </div>

          {replyTo === c.id && (
            <div className="mt-3 flex gap-2">
              <textarea
                value={replyText}
                onChange={(e) => onReplyText(e.target.value)}
                rows={2}
                placeholder="Write a reply..."
                className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                onClick={() => onSubmitReply(c.id)}
                disabled={submitting || !replyText.trim()}
                className="self-end rounded-lg bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                Reply
              </button>
            </div>
          )}

          {children.map((child) => (
            <CommentNode
              key={child.id}
              comment={child}
              depth={depth + 1}
              allComments={allComments}
              myVotes={myVotes}
              session={session}
              voting={voting}
              editingId={editingId}
              editText={editText}
              replyTo={replyTo}
              replyText={replyText}
              submitting={submitting}
              onVote={onVote}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onDelete={onDelete}
              onReplyToggle={onReplyToggle}
              onReplyText={onReplyText}
              onSubmitReply={onSubmitReply}
              setEditText={setEditText}
            />
          ))}
        </div>
      </div>
    </div>
  );
}


export default function AppDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: session } = useSession();
  const { toast } = useToast();

  const [app, setApp] = useState<App | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [voting, setVoting] = useState(false);
  // map "app:id" | "comment:id" -> 1 | -1
  const [myVotes, setMyVotes] = useState<Record<string, number>>({});

  const loadComments = useCallback(() => {
    if (!id) return;
    fetch(`${API_URL}/api/comments?app_id=${id}`)
      .then((r) => r.json())
      .then((data) => setComments(Array.isArray(data) ? data : []))
      .catch(() => setComments([]));
  }, [id]);

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
    loadComments();
  }, [id, loadComments]);

  // Load this user's existing votes for app + comments
  useEffect(() => {
    if (!id || !session?.user?.email) {
      setMyVotes({});
      return;
    }
    fetch(`${API_URL}/api/vote?user_email=${encodeURIComponent(session.user.email)}&app_id=${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object") setMyVotes(data);
      })
      .catch(() => setMyVotes({}));
  }, [id, session?.user?.email]);

  const handleVote = async (targetType: "app" | "comment", targetId: string, value: 1 | -1) => {
    if (!session?.user?.email) {
      toast("Please sign in to vote", "error");
      return;
    }
    if (voting) return;
    setVoting(true);
    try {
      const res = await fetch(`${API_URL}/api/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: session.user.email,
          target_type: targetType,
          target_id: targetId,
          value,
        }),
      });
      if (!res.ok) throw new Error("vote failed");
      const data = await res.json();
      const key = `${targetType}:${targetId}`;
      setMyVotes((prev) => {
        const next = { ...prev };
        if (data.my_vote === 1 || data.my_vote === -1) next[key] = data.my_vote;
        else delete next[key];
        return next;
      });
      if (targetType === "app" && app) {
        setApp({ ...app, likes_count: data.likes_count ?? 0, dislikes_count: data.dislikes_count ?? 0 });
      } else {
        loadComments();
      }
    } catch {
      toast("Failed to vote", "error");
    } finally {
      setVoting(false);
    }
  };

  const startEdit = (c: Comment) => {
    setEditingId(c.id);
    setEditText(c.content);
  };

  const saveEdit = async (commentId: string) => {
    if (!session?.user?.email || !editText.trim()) return;
    try {
      const res = await fetch(`${API_URL}/api/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editText.trim(), user_email: session.user.email }),
      });
      if (!res.ok) throw new Error("Failed");
      setEditingId(null);
      loadComments();
      toast("Comment updated", "success");
    } catch {
      toast("Failed to update comment", "error");
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!session?.user?.email) return;
    if (!confirm("Delete this comment?")) return;
    try {
      const res = await fetch(`${API_URL}/api/comments/${commentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      loadComments();
      toast("Comment deleted", "success");
    } catch {
      toast("Failed to delete comment", "error");
    }
  };

  const submitComment = async (parentId: string | null, text: string) => {
    if (!session?.user) {
      toast("Please sign in to comment", "error");
      return;
    }
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: id,
          parent_id: parentId,
          content: text.trim(),
          user_email: session.user.email,
          author_name: session.user.name || "",
          author_avatar: session.user.image || "",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setCommentText("");
      setReplyText("");
      setReplyTo(null);
      loadComments();
      toast("Comment posted", "success");
    } catch {
      toast("Failed to post comment", "error");
    } finally {
      setSubmitting(false);
    }
  };

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
          <p className="text-lg text-[var(--muted)]">{error || "App not found"}</p>
          <Link href="/" className="mt-4 text-sm text-[var(--accent)] hover:underline">
            ← Back to home
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const screenshots = parseScreenshots(app.screenshots);
  const embedUrl = getYoutubeEmbed(app.youtube_url || "");
  const topComments = comments.filter((c) => !c.parent_id);

  return (
    <>
      <Header showPublish={false} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {/* Breadcrumb + Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="mb-5 inline-block text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            ← All apps
          </Link>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <AppIcon src={app.icon_url} name={app.name} size={72} />
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{app.name}</h1>
                <div className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
                  <Avatar src={app.publisher_avatar} name={app.publisher} size={22} />
                  <span>Published by {app.publisher || "Anonymous"}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Like / Dislike */}
              <button
                onClick={() => handleVote("app", app.id, 1)}
                disabled={voting}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
                  myVotes[`app:${app.id}`] === 1
                    ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400"
                    : "border-[var(--border)] bg-[var(--card)] hover:border-emerald-500/40 hover:bg-emerald-500/10"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={myVotes[`app:${app.id}`] === 1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                </svg>
                {app.likes_count || 0}
              </button>
              <button
                onClick={() => handleVote("app", app.id, -1)}
                disabled={voting}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50 ${
                  myVotes[`app:${app.id}`] === -1
                    ? "border-red-500/50 bg-red-500/20 text-red-400"
                    : "border-[var(--border)] bg-[var(--card)] hover:border-red-500/40 hover:bg-red-500/10"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={myVotes[`app:${app.id}`] === -1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10zM17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                </svg>
                {app.dislikes_count || 0}
              </button>

              {session && (
                <Link
                  href={`/app/${app.id}/edit`}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--card)]"
                >
                  Edit
                </Link>
              )}
              {app.download_url && (
                <a
                  href={app.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)]"
                >
                  Get the app →
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Main column */}
          <div className="space-y-6">
            {/* A) Description */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                About this app
              </h2>
              <div className="space-y-5">
                <div>
                  <h3 className="mb-1.5 text-sm font-medium text-[var(--muted)]">Problem it solves</h3>
                  <p className="leading-relaxed whitespace-pre-wrap">{app.problem}</p>
                </div>
                {app.significance && (
                  <div>
                    <h3 className="mb-1.5 text-sm font-medium text-[var(--muted)]">Why it matters</h3>
                    <p className="leading-relaxed whitespace-pre-wrap">{app.significance}</p>
                  </div>
                )}
                {app.how_to_use && (
                  <div>
                    <h3 className="mb-1.5 text-sm font-medium text-[var(--muted)]">How to use it</h3>
                    <p className="leading-relaxed whitespace-pre-wrap">{app.how_to_use}</p>
                  </div>
                )}
              </div>
            </section>

            {/* B) Screenshots + Video */}
            {(screenshots.length > 0 || embedUrl) && (
              <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
                <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Media
                </h2>

                {embedUrl && (
                  <div className="mb-5 aspect-video w-full overflow-hidden rounded-xl bg-black">
                    <iframe
                      src={embedUrl}
                      title="Demo video"
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}

                {screenshots.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {screenshots.map((src, i) => (
                      <button
                        key={i}
                        onClick={() => setLightboxIndex(i)}
                        className="group relative aspect-video overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)]"
                      >
                        <Image
                          src={src}
                          alt={`Screenshot ${i + 1}`}
                          fill
                          className="object-cover transition group-hover:scale-105"
                          unoptimized
                        />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* C) Comments */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <h2 className="mb-5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Comments ({comments.length})
              </h2>

              {/* New comment */}
              {session ? (
                <div className="mb-6 flex gap-3">
                  <Avatar src={session.user?.image || undefined} name={session.user?.name || undefined} />
                  <div className="flex-1">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      rows={3}
                      placeholder="Share your thoughts..."
                      className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => submitComment(null, commentText)}
                        disabled={submitting || !commentText.trim()}
                        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                      >
                        {submitting ? "Posting..." : "Comment"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mb-6 text-sm text-[var(--muted)]">
                  <Link href="/login" className="text-[var(--accent)] hover:underline">
                    Sign in
                  </Link>{" "}
                  to leave a comment.
                </p>
              )}

              {/* Comment list — recursive nesting */}
              <div className="space-y-5">
                {topComments.length === 0 && (
                  <p className="text-sm text-[var(--muted)]">No comments yet. Be the first!</p>
                )}
                {topComments.map((c) => (
                  <CommentNode
                    key={c.id}
                    comment={c}
                    depth={0}
                    allComments={comments}
                    myVotes={myVotes}
                    session={session}
                    voting={voting}
                    editingId={editingId}
                    editText={editText}
                    replyTo={replyTo}
                    replyText={replyText}
                    submitting={submitting}
                    onVote={handleVote}
                    onStartEdit={startEdit}
                    onSaveEdit={saveEdit}
                    onCancelEdit={() => setEditingId(null)}
                    onDelete={deleteComment}
                    onReplyToggle={(id) => setReplyTo(replyTo === id ? null : id)}
                    onReplyText={setReplyText}
                    onSubmitReply={(parentId) => submitComment(parentId, replyText)}
                    setEditText={setEditText}
                  />
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Quick info
              </h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-[var(--muted)]">Publisher</dt>
                  <dd className="mt-0.5 flex items-center gap-2 font-medium">
                    <Avatar src={app.publisher_avatar} name={app.publisher} size={20} />
                    {app.publisher || "Anonymous"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Likes</dt>
                  <dd className="mt-0.5 font-medium">{app.likes_count || 0}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted)]">Dislikes</dt>
                  <dd className="mt-0.5 font-medium">{app.dislikes_count || 0}</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </main>

      {/* Screenshot slider lightbox */}
      {lightboxIndex !== null && screenshots.length > 0 && (
        <ScreenshotSlider
          images={screenshots}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onChange={setLightboxIndex}
        />
      )}

      <Footer />
    </>
  );
}
