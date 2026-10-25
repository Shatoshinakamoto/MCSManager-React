/** Phone breakpoint (max-width 992px), same as upstream useScreen. */
import { useEffect, useState } from "react";

const QUERY = "(max-width: 992px)";

export function useScreen(): { isPhone: boolean } {
  const [isPhone, setIsPhone] = useState(() => window.matchMedia?.(QUERY).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const fn = (e: MediaQueryListEvent) => setIsPhone(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return { isPhone };
}

/** True when the viewport is at least `px` wide. */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const [ok, setOk] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = (e: MediaQueryListEvent) => setOk(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return ok;
}
