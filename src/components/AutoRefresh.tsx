"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_MS = 60_000;

/** Re-fetches the server-rendered data once a minute while the tab is visible. */
export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  return null;
}
