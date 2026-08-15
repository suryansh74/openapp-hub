"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSession } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export type HubUser = {
  id: string;
  email: string;
  username: string;
  name: string;
  avatar_url: string;
  bio: string;
  provider?: string;
};

type UserContextValue = {
  hubUser: HubUser | null;
  loading: boolean;
  /** Force re-fetch from API (e.g. after profile save) */
  refresh: () => Promise<void>;
  /** True once first sync attempt finished for this session */
  synced: boolean;
};

const UserContext = createContext<UserContextValue>({
  hubUser: null,
  loading: true,
  refresh: async () => {},
  synced: false,
});

export function useHubUser() {
  return useContext(UserContext);
}

export default function UserProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [hubUser, setHubUser] = useState<HubUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);

  const syncUser = useCallback(async () => {
    if (!session?.user?.email) {
      setHubUser(null);
      setLoading(false);
      setSynced(false);
      return;
    }

    setLoading(true);
    const email = session.user.email;
    const provider = session.user.provider || "oauth";
    const oauthName = session.user.name || "";
    const oauthImage = session.user.image || "";
    const suggested =
      session.user.provider === "github" && session.user.githubLogin
        ? session.user.githubLogin.toLowerCase().replace(/[^a-z0-9_]/g, "")
        : "";

    try {
      // 1) Try load existing
      let res = await fetch(
        `${API_URL}/api/user?email=${encodeURIComponent(email)}`
      );

      if (res.status === 404) {
        // 2) First login — create row in DB (do not assign username yet unless free)
        res = await fetch(`${API_URL}/api/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            name: oauthName,
            avatar_url: oauthImage,
            provider,
            suggested_username: suggested,
          }),
        });
      }

      if (!res.ok) {
        setHubUser(null);
        setLoading(false);
        setSynced(true);
        return;
      }

      const data = await res.json();
      setHubUser({
        id: data.id || "",
        email: data.email || email,
        username: data.username || "",
        name: data.name || oauthName,
        avatar_url: data.avatar_url || "",
        bio: data.bio || "",
        provider: data.provider || provider,
      });
    } catch {
      setHubUser(null);
    } finally {
      setLoading(false);
      setSynced(true);
    }
  }, [session?.user?.email, session?.user?.name, session?.user?.image, session?.user?.provider, session?.user?.githubLogin]);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      setHubUser(null);
      setLoading(false);
      setSynced(false);
      return;
    }
    syncUser();
  }, [status, syncUser]);

  const value = useMemo(
    () => ({
      hubUser,
      loading: status === "loading" || loading,
      refresh: syncUser,
      synced,
    }),
    [hubUser, loading, status, syncUser, synced]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
