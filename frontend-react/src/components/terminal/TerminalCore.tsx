/**
 * Console body (port of components/TerminalCore.vue): the xterm window, the
 * command input with history, and the connection error card.
 *
 * The parent owns the TerminalSession (useTerminal) so it can read the live
 * instance state; this component connects the session and opens the window
 * once, on mount, the same way upstream does.
 */
import { CodeOutlined, DeleteOutlined, LoadingOutlined } from "@ant-design/icons";
import { App, Input, Tag, Tooltip, Typography, type InputRef } from "antd";
import { useEffect, useRef, useState } from "react";
import connectErrorImage from "@/assets/daemon_connection_error.png";
import { useCommandHistory } from "@/hooks/terminal/commandHistory";
import { encodeConsoleColor } from "@/hooks/terminal/consoleColor";
import type { UseTerminalHook } from "@/hooks/terminal/useTerminal";
import { t } from "@/lang/i18n";
import { getInstanceOutputLog } from "@/services/apis/instance";
import { useLayoutContainer } from "@/stores/layoutContainer";
import { reportErrorMsg } from "@/tools/validator";
import "./TerminalCore.scss";

interface Props {
  instanceId: string;
  daemonId: string;
  height: string;
  terminal: UseTerminalHook;
}

/** Port of hooks/useXhrPollError.ts: explain the usual cause of "xhr poll error". */
function xhrPollHint(error?: Error) {
  const isXhrPollError = !!error?.message.toLowerCase().includes("xhr poll error");
  const reason = window.location.protocol.includes("https") ? t("TXT_CODE_46c48969") : t("TXT_CODE_2fb14927");
  return { isXhrPollError, reason };
}

export default function TerminalCore({ instanceId, daemonId, height, terminal }: Props) {
  const { message } = App.useApp();
  const isDesignMode = useLayoutContainer((s) => s.isDesignMode);
  const { session, isConnect, socketAddress } = terminal;
  const { focusHistoryList, selectLocation, history, commandInputValue, setCommandInputValue, handleHistorySelect, clickHistoryItem } =
    useCommandHistory();
  const [socketError, setSocketError] = useState<Error>();
  const termRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (!session) return;
    const onOpened = () => message.success(t("TXT_CODE_e13abbb1"));
    const onStopped = () => message.success(t("TXT_CODE_efb6d377"));
    const onError = (error: Error) => setSocketError(error);
    session.events.on("opened", onOpened);
    session.events.on("stopped", onStopped);
    session.events.on("error", onError);
    // Replay the stored output once, after the first status packet tells us
    // whether the instance wants colour codes translated.
    session.events.once("detail", async () => {
      try {
        const value = await getInstanceOutputLog({ params: { uuid: instanceId, daemonId } });
        if (value) await session.writeHistoryLog(session.state?.config?.terminalOption?.haveColor ? encodeConsoleColor(value) : value);
      } catch {
        /* no stored output yet */
      }
    });

    if (!isDesignMode) {
      if (termRef.current) session.initTerminalWindow(termRef.current);
      else reportErrorMsg(t("TXT_CODE_42bcfe0c"));
    }
    session.connect(daemonId, instanceId).catch((error: unknown) => {
      reportErrorMsg(error);
      setSocketError(error instanceof Error ? error : new Error(String(error)));
    });
    return () => {
      session.events.off("opened", onOpened);
      session.events.off("stopped", onStopped);
      session.events.off("error", onError);
    };
    // The session is created once per mount; ids come from the route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleSendCommand = () => {
    if (focusHistoryList || !session) return;
    try {
      session.sendCommand(commandInputValue || "");
    } catch (error) {
      reportErrorMsg(error);
    }
    setCommandInputValue("");
  };

  const { isXhrPollError, reason } = xhrPollHint(socketError);

  return (
    <div className="console-wrapper">
      {!isConnect && (
        <div className="terminal-loading">
          <LoadingOutlined style={{ fontSize: 72, color: "white" }} />
        </div>
      )}
      <div className="terminal-button-group position-absolute-right position-absolute-top">
        <ul>
          <li onClick={() => session?.clearTerminal()}>
            <Tooltip placement="top" title={t("TXT_CODE_b1e2e1b4")}>
              <DeleteOutlined />
            </Tooltip>
          </li>
        </ul>
      </div>
      <div className="terminal-wrapper global-card-container-shadow position-relative">
        <div className="terminal-container">
          {!isDesignMode ? (
            <div ref={termRef} style={{ height }} />
          ) : (
            <div style={{ height }}>
              <p className="terminal-design-tip">{t("TXT_CODE_7ac6f85c")}</p>
            </div>
          )}
        </div>
      </div>
      <div className="command-input">
        {focusHistoryList && (
          <ul className="history">
            {history.map((item, key) => (
              <li key={item}>
                <Tag
                  color={key !== selectLocation ? "blue" : "#108ee9"}
                  onClick={() => {
                    clickHistoryItem(item);
                    inputRef.current?.focus();
                  }}
                >
                  {item.length > 14 ? item.slice(0, 14) + "..." : item}
                </Tag>
              </li>
            ))}
          </ul>
        )}
        <Input
          ref={inputRef}
          value={commandInputValue}
          onChange={(e) => setCommandInputValue(e.target.value)}
          placeholder={t("TXT_CODE_555e2c1b")}
          autoFocus
          disabled={isDesignMode || !isConnect}
          onPressEnter={handleSendCommand}
          onKeyDown={handleHistorySelect}
          prefix={<CodeOutlined style={{ fontSize: 18 }} />}
        />
      </div>

      {socketError && (
        <div className="error-card">
          <div className="error-card-container">
            <Typography.Title level={5}>{t("TXT_CODE_6929b0b2")}</Typography.Title>
            <Typography.Paragraph>{t("TXT_CODE_812a629e") + socketAddress}</Typography.Paragraph>
            <div>
              <img src={connectErrorImage} style={{ width: "100%", height: 110 }} alt="" />
            </div>
            <Typography.Title level={5}>{t("TXT_CODE_9c95b60f")}</Typography.Title>
            <Typography.Paragraph>
              <pre style={{ fontSize: 12 }}>
                <code>{socketError.message || ""}</code>
              </pre>
              {isXhrPollError && (
                <div style={{ fontSize: 12 }}>
                  <span>{reason}</span>
                </div>
              )}
            </Typography.Paragraph>
            {isXhrPollError && (
              <Typography.Paragraph>
                <div className="flex" style={{ gap: 8, fontSize: 12 }}>
                  <strong>{t("TXT_CODE_d4c8fb3b")}</strong>
                  <a href="https://docs.mcsmanager.com/ops/proxy_https.html" target="_blank" rel="noopener noreferrer">
                    {t("TXT_CODE_9b3ce825")}
                  </a>
                  <span>|</span>
                  <a href="https://docs.mcsmanager.com/ops/mcsm_network.html" target="_blank" rel="noopener noreferrer">
                    {t("TXT_CODE_10cc2794")}
                  </a>
                </div>
              </Typography.Paragraph>
            )}
            <Typography.Title level={5}>{t("TXT_CODE_f1c96d8a")}</Typography.Title>
            <Typography.Paragraph>
              <ul>
                <li>{t("TXT_CODE_ceba9262")}</li>
                <li>{t("TXT_CODE_84099e5")}</li>
                <li>{t("TXT_CODE_86ff658a")}</li>
              </ul>
              <div className="flex flex-center">
                <Typography.Link onClick={() => window.location.reload()}>{t("TXT_CODE_f8b28901")}</Typography.Link>
              </div>
            </Typography.Paragraph>
          </div>
        </div>
      )}
    </div>
  );
}
