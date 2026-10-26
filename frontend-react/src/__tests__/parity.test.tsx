/**
 * Tests for the Phase 5 parity ports: the business-mode renewal dialog and
 * the clipboard fallback. Includes malicious-input cases (CWE-20, CWE-79).
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const buy = vi.fn();
vi.mock("@/services/apis/redeem", () => ({ requestBuyInstance: (cfg: unknown) => buy(cfg) }));
vi.mock("@/lang/i18n", () => ({ t: (k: string) => k }));
const warning = vi.fn();
vi.mock("@/tools/antdStatic", () => ({ message: { success: vi.fn(), error: vi.fn() }, modal: { warning: (o: unknown) => warning(o) } }));
vi.mock("@/tools/validator", () => ({ reportErrorMsg: vi.fn() }));

import { MAX_RENEWAL_CODE_LENGTH, RenewalDialog } from "@/components/fc/RenewalDialog";
import { toCopy } from "@/tools/copy";

beforeEach(() => {
  buy.mockReset();
  warning.mockReset();
});
afterEach(cleanup);

describe("RenewalDialog", () => {
  it("sends the trimmed code with the instance ids and skips the response cache", async () => {
    buy.mockResolvedValue({});
    const done = vi.fn();
    render(<RenewalDialog instanceId="i1" daemonId="d1" productId={7} done={done} />);
    fireEvent.change(screen.getByPlaceholderText("TXT_CODE_b3cc1379"), { target: { value: "  CODE-1  " } });
    await act(async () => fireEvent.click(screen.getByText("TXT_CODE_bc560b9")));
    expect(buy).toHaveBeenCalledWith({ data: { instanceId: "i1", daemonId: "d1", code: "CODE-1", productId: 7 }, forceRequest: true });
    expect(done).toHaveBeenCalledWith(true);
  });

  it("does not send a blank code and caps the field length", () => {
    render(<RenewalDialog instanceId="i1" daemonId="d1" productId={7} done={vi.fn()} />);
    const input = screen.getByPlaceholderText("TXT_CODE_b3cc1379") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", keyCode: 13 });
    expect(buy).not.toHaveBeenCalled();
    expect(input.maxLength).toBe(MAX_RENEWAL_CODE_LENGTH);
  });

  it("keeps the dialog open when the panel refuses the code", async () => {
    buy.mockRejectedValue(new Error("invalid"));
    const done = vi.fn();
    render(<RenewalDialog instanceId="i1" daemonId="d1" productId={7} done={done} />);
    fireEvent.change(screen.getByPlaceholderText("TXT_CODE_b3cc1379"), { target: { value: "BAD" } });
    await act(async () => fireEvent.click(screen.getByText("TXT_CODE_bc560b9")));
    expect(done).not.toHaveBeenCalled();
  });
});

describe("toCopy fallback", () => {
  it("shows the text as plain text when copying fails", async () => {
    Object.defineProperty(document, "execCommand", { value: () => false, configurable: true });
    const payload = `<img src=x onerror="alert(1)">`;
    await toCopy(payload);
    expect(warning).toHaveBeenCalledTimes(1);
    const { container } = render(<>{(warning.mock.calls[0][0] as { content: React.ReactNode }).content}</>);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain(payload);
  });
});
