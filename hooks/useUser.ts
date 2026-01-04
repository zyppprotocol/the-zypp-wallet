import { getUser } from "@/lib/auth";
import type { ZyppUser } from "@/lib/storage/types";
import { useCallback, useEffect, useState } from "react";

/**
 * useUser - simple hook to load the current ZyppUser and refresh it on demand
 */
export default function useUser() {
  const [user, setUser] = useState<ZyppUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const u = await getUser();
      setUser(u);
      return u;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // load on mount
    refresh();
  }, [refresh]);

  return { user, loading, refresh } as const;
}
