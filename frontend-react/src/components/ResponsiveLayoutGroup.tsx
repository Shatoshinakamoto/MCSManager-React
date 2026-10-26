/**
 * Wrapping grid that switches to one item per row when its own width is at
 * most `fullWidth` px (port of components/ResponsiveLayoutGroup.vue).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props<T> {
  items: T[];
  fullWidth?: number;
  defaultWidth?: string;
  className?: string;
  children: (item: T) => ReactNode;
}

export default function ResponsiveLayoutGroup<T>({ items, fullWidth = 600, defaultWidth = "25%", className, children }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setFull(entry.contentRect.width <= fullWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullWidth]);

  return (
    <div
      ref={ref}
      className={["responsive-layout-group", className].filter(Boolean).join(" ")}
      style={{ display: "flex", flexWrap: "wrap", overflowY: "auto", alignContent: "flex-start", justifyContent: "flex-start", alignItems: "center" }}
    >
      {items.map((item, index) => (
        <div key={index} className="responsive-item" style={{ width: full ? "100%" : defaultWidth, padding: "4px 4px", overflow: "hidden" }}>
          {children(item)}
        </div>
      ))}
    </div>
  );
}
