/**
 * Row-filling algorithm for the 12-column card grid, ported 1:1 from upstream
 * hooks/useCardLayoutComputed.ts so cards wrap and pad exactly the same way.
 * Pure function (no React) so it is unit-tested directly.
 */
import { getRandomId } from "@/tools/common";
import type { LayoutCard } from "@/types";

export const PLACE_HOLDER_CARD = "PLACEHOLDER";

function placeholder(width: number, followId: string): LayoutCard {
  return { id: getRandomId(), type: PLACE_HOLDER_CARD, title: "", width, height: "200px", followId, meta: {} };
}

/**
 * Insert PLACEHOLDER cards so each row sums to 12 columns.
 * @param cards the page's cards in order
 * @returns cards plus placeholders, in render order
 */
export function computeCardLayout(cards: LayoutCard[]): LayoutCard[] {
  const out: LayoutCard[] = [];
  let col = 0;
  const lastLineCheck = (lineWidth: number, i: number) => {
    if (lineWidth !== 12 && lineWidth !== 0 && i + 1 === cards.length) {
      out.push(placeholder(12 - lineWidth, cards[cards.length - 1].id));
    }
  };
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (col + card.width === 12 || col === 12) {
      out.push(card);
      col = col === 12 ? card.width : 12;
      lastLineCheck(col, i);
      continue;
    }
    if (col + card.width > 12) {
      out.push(placeholder(12 - col, cards[i - 1].id));
      out.push(card);
      col = card.width;
    } else {
      out.push(card);
      col += card.width;
    }
    lastLineCheck(col, i);
  }
  return out;
}
