/**
 * Context menu at the mouse position (port of components/fc/RightMenu.vue and
 * hooks/useRightClickMenu.ts). Closes on the next click, right-click or scroll.
 */
import { Menu, type MenuProps } from "antd";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { openDialog } from "@/stores/dialogHost";
import "./RightMenu.scss";

/** A menu entry with its own click handler (antd items only carry keys). */
export interface MenuAction {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
  children?: MenuAction[];
}

/** Convert MenuAction trees to antd items plus a key -> handler lookup. */
export function toMenuProps(actions: MenuAction[]): Pick<MenuProps, "items" | "onClick"> {
  const handlers = new Map<string, () => void>();
  const walk = (list: MenuAction[]): MenuProps["items"] =>
    list.map((a) => {
      if (a.onClick) handlers.set(a.key, a.onClick);
      return { key: a.key, label: a.label, icon: a.icon, style: a.style, children: a.children ? walk(a.children) : undefined };
    });
  return { items: walk(actions), onClick: ({ key }) => handlers.get(key)?.() };
}

let closeCurrent: (() => void) | undefined;

function RightMenu({ x, y, actions, done }: { x: number; y: number; actions: MenuAction[]; done: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y, visible: false });
  const [open, setOpen] = useState(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Keep the menu inside the viewport, as upstream does.
    let nx = x;
    let ny = y;
    if (nx > window.innerWidth - el.offsetWidth) nx -= el.offsetWidth;
    if (ny > window.innerHeight - el.offsetHeight) ny -= el.offsetHeight;
    setPos({ x: nx, y: ny, visible: true });
  }, [x, y]);

  useLayoutEffect(() => {
    const close = () => {
      setOpen(false);
      done();
    };
    closeCurrent = close;
    // Attach after the opening event has finished bubbling.
    const timer = setTimeout(() => {
      document.body.addEventListener("click", close);
      document.body.addEventListener("contextmenu", close);
      window.addEventListener("scroll", close, true);
    });
    return () => {
      clearTimeout(timer);
      document.body.removeEventListener("click", close);
      document.body.removeEventListener("contextmenu", close);
      window.removeEventListener("scroll", close, true);
      if (closeCurrent === close) closeCurrent = undefined;
    };
  }, [done]);

  if (!open) return null;
  return (
    <div ref={ref} className="right-menu" style={{ position: "fixed", top: pos.y, left: pos.x, visibility: pos.visible ? "unset" : "hidden" }}>
      <Menu mode="vertical" style={{ width: 160 }} selectable={false} {...toMenuProps(actions)} />
    </div>
  );
}

/** Open a context menu; any menu already open is closed first. */
export function openRightClickMenu(x: number, y: number, actions: MenuAction[]): void {
  closeCurrent?.();
  void openDialog<void>((done) => <RightMenu x={x} y={y} actions={actions} done={() => done()} />);
}
