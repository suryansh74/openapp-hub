"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "./ThemeProvider";

export default function Header({ showPublish = true }: { showPublish?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const { data: session, status } = useSession();

  return (
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

          {status === "loading" ? (
            <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--border)]" />
          ) : session?.user ? (
            <div className="flex items-center gap-2">
              {session.user.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              )}
              <span className="hidden text-sm sm:inline max-w-[120px] truncate">
                {session.user.name}
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:bg-[var(--card)]"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium transition hover:bg-[var(--card)]"
            >
              Sign in
            </Link>
          )}

          {showPublish && (
            <Link
              href={session ? "/publish" : "/login"}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] sm:px-4 sm:py-2"
            >
              Publish
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
