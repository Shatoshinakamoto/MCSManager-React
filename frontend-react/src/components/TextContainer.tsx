/**
 * Text cut to `maxLength` characters with the full text in a tooltip (port of
 * components/TextContainer.vue). Upstream ships it but no page uses it yet.
 */
import { Tooltip } from "antd";

/** The shortened text: unchanged when it fits, otherwise cut with an ellipsis. */
export function shortenText(text: string, maxLength?: number): string {
  if (!maxLength || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

export default function TextContainer({ text, maxLength }: { text: string; maxLength?: number }) {
  return (
    <Tooltip title={text}>
      <span>{shortenText(text, maxLength)}</span>
    </Tooltip>
  );
}
