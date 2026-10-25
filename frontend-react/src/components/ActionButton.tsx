/** Large clickable row with an icon (port of components/ActionButton.vue). */
import { LinkOutlined } from "@ant-design/icons";
import { Col } from "antd";
import type { ComponentType } from "react";
import "./ActionButton.scss";

interface Props {
  icon?: ComponentType;
  title: string;
  click?: () => void;
}

export default function ActionButton({ icon: Icon = LinkOutlined, title, click }: Props) {
  return (
    <div className="ActionButton actions-button w-100">
      <Col span={24}>
        <div
          className="action-btn-item w-100 flex"
          role="button"
          tabIndex={0}
          onClick={click}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && click?.()}
        >
          <div>
            <Icon />
          </div>
          <div className="ml-8">{title}</div>
        </div>
      </Col>
    </div>
  );
}
