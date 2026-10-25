/** Centered spinner (port of components/Loading.vue). */
import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";

export default function Loading({ fontSize = 48 }: { fontSize?: number }) {
  return (
    <div className="flex align-center justify-center h-100 w-100">
      <Spin indicator={<LoadingOutlined style={{ fontSize, fontWeight: "bold" }} spin />} />
    </div>
  );
}
