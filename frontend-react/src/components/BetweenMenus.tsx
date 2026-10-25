/** Port of BetweenMenus.vue: left / center / right toolbar row. */
import type { ReactNode } from "react";
import "./BetweenMenus.scss";

export default function BetweenMenus({ left, center, right }: { left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ height: "100%" }} className="between-menus-container">
      {left && <div className="menus-item-left">{left}</div>}
      {center && <div className="menus-item-center">{center}</div>}
      {right && <div className={["menus-item-right", center ? "phone-menus-item-right" : ""].filter(Boolean).join(" ")}>{right}</div>}
    </div>
  );
}
