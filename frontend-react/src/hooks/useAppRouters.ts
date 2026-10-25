/** Port of upstream hooks/useAppRouters.ts: navigate while keeping the current query. */
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

export function useAppRouters() {
  const navigate = useNavigate();
  const location = useLocation();
  const toPage = useCallback(
    (to: { path: string; query?: Record<string, string | undefined> }) => {
      const q = new URLSearchParams(location.search);
      for (const [k, v] of Object.entries(to.query ?? {})) if (v !== undefined) q.set(k, v);
      const qs = q.toString();
      navigate(qs ? `${to.path}?${qs}` : to.path);
    },
    [navigate, location.search]
  );
  return { toPage };
}
