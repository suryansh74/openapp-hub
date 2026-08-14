"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "./ThemeProvider";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";

export default function Header({ showPublish = true }: { showPublish?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const { data: session, status } = useSession();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSignOut = () => {
    setConfirmOpen(false);
    setMenuOpen(false);
    signOut({ callbackUrl: "/" });
    toast("Signed out successfully", "success");
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/icon.svg"
              alt="OpenApp Hub"
              width={32}
              height={32}
              className="rounded-lg"
              priority
            />
            <span className="text-lg font-semibold tracking-tight">
              OpenApp Hub
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              {theme === "dark" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Auth area */}
            {status === "loading" ? (
              <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--border)]" />
            ) : session?.user ? (
              <div className="relative" ref={menuRef}>
                {/* Avatar button */}
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] p-0.5 pr-2 transition hover:bg-[var(--card-hover)] sm:pr-2.5"
                >
                  {session.user.image ? (
                    <Image
                      src={session.user.image}
                      alt={session.user.name || "User"}
                      width={32}
                      height={32}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-medium text-white">
                      {(session.user.name || "U")[0].toUpperCase()}
                    </div>
                  )}
                  <span className="hidden max-w-[100px] truncate text-sm sm:inline">
                    {session.user.name?.split(" ")[0]}
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`text-[var(--muted)] transition ${menuOpen ? "rotate-180" : ""}`}
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {/* Dropdown */}
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
                    <div className="border-b border-[var(--border)] px-4 py-3">
                      <p className="truncate text-sm font-medium">
                        {session.user.name}
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {session.user.email}
                      </p>
                    </div>
                    <div className="p-1.5">
                      <Link
                        href="/publish"
                        onClick={() => setMenuOpen(false)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-[var(--card-hover)]"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        Publish an App
                      </Link>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          setConfirmOpen(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-500 transition hover:bg-red-500/10"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                        </svg>
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--card)]"
              >
                Sign in
              </Link>
            )}

            {showPublish && !session && (
              <Link
                href="/login"
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] sm:px-4 sm:py-2"
              >
                Publish
              </Link>
            )}
            {showPublish && session && (
              <Link
                href="/publish"
                className="hidden rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] sm:inline-flex"
              >
                Publish
              </Link>
            )}
          </div>
        </div>
      </header>

      <ConfirmModal
        open={confirmOpen}
        title="Sign out?"
        message="Are you sure you want to sign out of OpenApp Hub?"
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        danger
        onConfirm={handleSignOut}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
