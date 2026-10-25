/**
 * Port of FadeUpAnimation.vue: children fade up one after another.
 * Uses the same global-fade-up-animation keyframes (declared below).
 */
import { Children, type ReactNode } from "react";
import "./FadeUp.scss";

export default function FadeUp({ children, delay = 100 }: { children: ReactNode; delay?: number }) {
  // Upstream multiplied by data-index, which its callers never set, so every
  // item effectively started at once; cap the stagger to keep that feel.
  return (
    <>
      {Children.map(children, (child, i) => (
        <div className="fade-up-item" style={{ animationDelay: `${Math.min(i * delay, 300)}ms`, display: "contents" }}>
          {child}
        </div>
      ))}
    </>
  );
}
