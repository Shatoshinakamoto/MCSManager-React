/** Gradient-bordered option tile on the market page (port of widgets/market/InstallOptionButton.vue). */
import type { ComponentType, KeyboardEvent, MouseEvent } from "react";
import "./InstallOptionButton.scss";

export interface InstallOption {
  label: string;
  icon: ComponentType;
  description: string;
  action: () => void;
}

export default function InstallOptionButton({ option }: { option: InstallOption }) {
  const Icon = option.icon;
  const run = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    option.action();
  };
  return (
    <div
      className="install-option-button"
      role="button"
      tabIndex={0}
      onClick={run}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && run(e)}
    >
      <div className="button-inner">
        <div className="button-icon">
          <Icon />
        </div>
        <div className="button-content">
          <span className="button-label">{option.label}</span>
          <span className="button-desc">{option.description}</span>
        </div>
      </div>
    </div>
  );
}
