/**
 * antd Empty with an info-coloured description (port of components/Empty.vue).
 * Upstream ships it but no page uses it yet; kept so nothing from the Vue UI
 * is lost.
 */
import { Empty as AntEmpty } from "antd";

export default function Empty({ description }: { description?: string }) {
  return <AntEmpty description={<span className="color-info">{description}</span>} />;
}
