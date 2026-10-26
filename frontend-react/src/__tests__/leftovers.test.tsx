/**
 * Tests for the Vue components upstream ships but no longer opens, ported so
 * nothing from the Vue UI is lost: the command assistant and its builder, the
 * Docker version choice, the older ping dialog, the no-preview card, and the
 * framed-page box with its message bridge. Includes hostile-message cases for
 * the bridge (CWE-346, CWE-940).
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { App } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lang/i18n", () => ({ t: (k: string) => k, getCurrentLang: () => "en_US" }));
vi.mock("@/tools/validator", () => ({ reportErrorMsg: vi.fn() }));
const updateInstanceConfig = vi.fn();
vi.mock("@/services/apis/instance", () => ({ updateInstanceConfig: (cfg: unknown) => updateInstanceConfig(cfg) }));
const echo = vi.fn(async (data: unknown) => ({ echoed: data }));
vi.mock("@/components/IframeBox/handler", () => ({ iframeRouters: { Echo: (d: unknown) => echo(d) } }));

import DialogHost from "@/components/DialogHost";
import { openCmdAssistantDialog } from "@/components/fc/CmdAssistantDialog";
import { DOCKER_VERSION_CHOICE, openDockerVersionSelectDialog } from "@/components/fc/DockerVersionSelectDialog";
import IframeBox, { iframeAddress } from "@/components/IframeBox";
import { bridgeOriginFor, iframeEventDispatch } from "@/components/IframeBox/config";
import NoPreviewCard from "@/components/NoPreviewCard";
import TerminalTags from "@/components/TerminalTags";
import { shortenText } from "@/components/TextContainer";
import { QUICKSTART_ACTION_TYPE } from "@/hooks/quickStartFlow";
import { buildAnyAppCmd, buildMinecraftJavaCmd, buildStartCmd, defaultJvmFlags, newAnyAppForm, newMinecraftJavaForm } from "@/hooks/startCmdBuilder";
import { TYPE_MINECRAFT_BEDROCK, TYPE_MINECRAFT_JAVA } from "@/hooks/useInstance";
import type { InstanceDetail } from "@/types/instance";
import { openPingConfigDialog } from "@/widgets/instance/dialogs/PingConfig";
import { useDialogHost } from "@/stores/dialogHost";

// antd Tabs measure themselves; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

beforeEach(() => {
  useDialogHost.setState({ dialogs: [] });
  updateInstanceConfig.mockReset();
  echo.mockClear();
});
afterEach(cleanup);

describe("start command builder", () => {
  it("adds UTF-8 plus a well-formed language and region", () => {
    expect(defaultJvmFlags("de-DE")).toBe("-Dfile.encoding=UTF-8 -Duser.language=de -Duser.country=DE");
    expect(defaultJvmFlags("zh-Hans-CN")).toBe("-Dfile.encoding=UTF-8 -Duser.language=zh -Duser.country=CN");
    expect(defaultJvmFlags("")).toBe("-Dfile.encoding=UTF-8");
    expect(defaultJvmFlags("x; rm -rf /")).toBe("-Dfile.encoding=UTF-8");
  });

  it("builds a Minecraft Java command with the edited JVM flags", () => {
    const f = { ...newMinecraftJavaForm("en-US"), jarName: "paper 1.21.jar", maxMemory: "4G", minMemory: "1G", javaPath: "/opt/java 21/bin/java", additional: "-XX:+UseG1GC" };
    expect(buildMinecraftJavaCmd(f)).toBe('"/opt/java 21/bin/java" -Xms1G -Xmx4G -XX:+UseG1GC -jar "paper 1.21.jar" nogui');
    expect(buildMinecraftJavaCmd({ ...newMinecraftJavaForm(""), jarName: "server.jar" })).toBe("java -Dfile.encoding=UTF-8 -jar server.jar nogui");
  });

  it("builds a program command without a trailing space", () => {
    expect(buildAnyAppCmd({ softwarePath: "./bedrock_server", params: "" })).toBe("./bedrock_server");
    expect(buildAnyAppCmd({ softwarePath: "C:\\My Apps\\srv.exe", params: "-port 1" })).toBe('"C:\\My Apps\\srv.exe" -port 1');
  });

  it("uses the program form for every type but Minecraft Java", () => {
    const mc = { ...newMinecraftJavaForm(""), jarName: "a.jar" };
    const any = { ...newAnyAppForm(), softwarePath: "bedrock_server" };
    expect(buildStartCmd(QUICKSTART_ACTION_TYPE.Minecraft, TYPE_MINECRAFT_JAVA, mc, any)).toContain("-jar a.jar");
    expect(buildStartCmd(QUICKSTART_ACTION_TYPE.Minecraft, TYPE_MINECRAFT_BEDROCK, mc, any)).toBe("bedrock_server");
  });
});

describe("command assistant dialog", () => {
  it("returns the command built from the Minecraft form", async () => {
    render(<DialogHost />);
    let result: Promise<string | undefined> = Promise.resolve(undefined);
    act(() => {
      result = openCmdAssistantDialog();
    });
    await act(async () => fireEvent.click(await screen.findByText("TXT_CODE_f2deb1d0")));
    fireEvent.change(screen.getByPlaceholderText("TXT_CODE_84f760fa"), { target: { value: "server.jar" } });
    await act(async () => fireEvent.click(screen.getByText("TXT_CODE_d507abff")));
    expect(await result).toMatch(/^java .*-jar server\.jar nogui$/);
  });

  it("resolves with nothing when cancelled", async () => {
    render(<DialogHost />);
    let result: Promise<string | undefined> = Promise.resolve("x");
    act(() => {
      result = openCmdAssistantDialog();
    });
    await act(async () => fireEvent.click(await screen.findByText("TXT_CODE_a0451c97")));
    expect(await result).toBeUndefined();
  });
});

describe("Docker version choice", () => {
  it("resolves 2 for Docker and 1 for the normal version", async () => {
    render(<DialogHost />);
    let result: Promise<number> = Promise.resolve(0);
    act(() => {
      result = openDockerVersionSelectDialog();
    });
    await act(async () => fireEvent.click(await screen.findByText("TXT_CODE_docker_version_select_docker_btn")));
    expect(await result).toBe(DOCKER_VERSION_CHOICE.DOCKER);
    act(() => {
      result = openDockerVersionSelectDialog();
    });
    await act(async () => fireEvent.click((await screen.findAllByText("TXT_CODE_docker_version_select_normal_btn")).at(-1)!));
    expect(await result).toBe(DOCKER_VERSION_CHOICE.NORMAL);
  });
});

describe("older ping dialog", () => {
  it("saves address and port and keeps the ping type", async () => {
    updateInstanceConfig.mockResolvedValue({});
    // The dialog reports success through antd's App context, as in the panel.
    render(
      <App>
        <DialogHost />
      </App>
    );
    const info = { config: { pingConfig: { ip: "", port: 25565, type: 1 } } } as unknown as InstanceDetail;
    let result: Promise<boolean> = Promise.resolve(false);
    act(() => {
      result = openPingConfigDialog(info, "i1", "d1");
    });
    await screen.findByText("TXT_CODE_8e632796");
    const [ip, port] = Array.from(document.querySelectorAll<HTMLInputElement>(".ant-modal input"));
    fireEvent.change(ip, { target: { value: "play.example.org" } });
    fireEvent.change(port, { target: { value: "25570" } });
    await act(async () => fireEvent.click(screen.getByText("TXT_CODE_abfe9512")));
    expect(updateInstanceConfig).toHaveBeenCalledWith({ params: { uuid: "i1", daemonId: "d1" }, data: { pingConfig: { ip: "play.example.org", port: 25570, type: 1 } } });
    expect(await result).toBe(true);
  });
});

describe("no-preview card", () => {
  it("shows the card title and the notice", () => {
    render(<NoPreviewCard card={{ title: "Players", i: "c1" } as never} />);
    expect(screen.getByText("Players")).toBeTruthy();
    expect(screen.getByText(/TXT_CODE_5ec10cc8/)).toBeTruthy();
  });
});

describe("small components", () => {
  it("shortens text only when it is longer than the limit", () => {
    expect(shortenText("abcdef", 3)).toBe("abc…");
    expect(shortenText("abc", 3)).toBe("abc");
    expect(shortenText("abc")).toBe("abc");
  });

  it("renders tags as text and runs their click handlers", () => {
    const onClick = vi.fn();
    render(<TerminalTags tags={[{ label: "CPU", value: "<b>9%</b>", onClick }]} />);
    fireEvent.click(screen.getByText("<b>9%</b>"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".TerminalTags b")).toBeNull();
  });
});

describe("framed page box", () => {
  it("adds theme and cache-busting parameters, keeping query and hash", () => {
    expect(iframeAddress("https://a.example/p", true, 5)).toBe("https://a.example/p?theme=dark&t=5");
    expect(iframeAddress("https://a.example/p?x=1#/home", false, 5)).toBe("https://a.example/p?x=1&theme=light&t=5#/home");
  });

  it("bridges only http(s) pages on the panel origin or the allow-list", () => {
    const here = "https://panel.example";
    expect(bridgeOriginFor("/plugin/page.html", [], here)).toBe(here);
    expect(bridgeOriginFor("https://evil.example/x", [], here)).toBeNull();
    expect(bridgeOriginFor("https://pro.example/x", ["https://pro.example/"], here)).toBe("https://pro.example");
    expect(bridgeOriginFor("javascript:alert(1)", ["javascript:"], here)).toBeNull();
    expect(bridgeOriginFor("data:text/html,hi", [], here)).toBeNull();
  });

  it("answers known handlers once, only to the frame's origin", async () => {
    const postMessage = vi.fn();
    const frame = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement;
    await iframeEventDispatch({ id: "r1", source: "Echo", data: 1 }, frame, "https://pro.example", []);
    await iframeEventDispatch({ id: "r1", source: "Echo", data: 1 }, frame, "https://pro.example", []);
    expect(echo).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ id: "r1", source: "Echo", data: { echoed: 1 } }, "https://pro.example");
  });

  it("ignores unknown and inherited handler names", async () => {
    const postMessage = vi.fn();
    const frame = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement;
    for (const source of ["Nope", "constructor", "__proto__", "toString"]) await iframeEventDispatch({ id: `x-${source}`, source }, frame, "https://pro.example", []);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("does not listen for messages unless the bridge is on and the page is allowed", async () => {
    const { container, rerender } = render(<IframeBox src="https://evil.example/x" bridge />);
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("sandbox")).not.toContain("allow-top-navigation");
    const send = (origin: string) =>
      act(async () => {
        window.dispatchEvent(new MessageEvent("message", { data: { app: "MCSManager", id: `m-${origin}-${Math.random()}`, source: "Echo" }, origin, source: frame.contentWindow }));
      });
    await send("https://evil.example");
    expect(echo).not.toHaveBeenCalled();

    rerender(<IframeBox src={`${window.location.origin}/page.html`} />);
    await send(window.location.origin);
    expect(echo).not.toHaveBeenCalled();
  });
});
