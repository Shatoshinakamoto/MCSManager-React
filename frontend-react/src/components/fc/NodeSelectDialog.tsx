/**
 * Pick a daemon for a new instance (port of components/fc/NodeSelectDialog.vue).
 * Only online daemons are listed; when the template's Docker platforms are
 * known, daemons that cannot run them are sorted last and flagged.
 */
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { Button, Modal, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useOverviewStore } from "@/hooks/useOverviewInfo";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";
import type { ComputedNode } from "@/types/overview";
import "./NodeSelectDialog.scss";

interface Props {
  targetPlatforms?: string[];
  toNodesPage?: () => void;
  done: (node: ComputedNode | undefined) => void;
}

function NodeSelectDialog({ targetPlatforms, toNodesPage, done }: Props) {
  const [open, setOpen] = useState(true);
  const [nodes, setNodes] = useState<ComputedNode[]>([]);
  const close = (node: ComputedNode | undefined) => {
    setOpen(false);
    done(node);
  };

  useEffect(() => {
    void useOverviewStore
      .getState()
      .refresh(true)
      .then((s) => setNodes(s?.remote?.filter((n) => n.available) ?? []));
  }, []);

  const filtering = !!targetPlatforms?.length;
  const supported = (n: ComputedNode) =>
    !filtering || (!!n.dockerPlatforms?.length && n.dockerPlatforms.some((p) => targetPlatforms!.includes(p)));
  const sorted = useMemo(
    () => [...nodes].sort((a, b) => (supported(a) === supported(b) ? 0 : supported(a) ? -1 : 1)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, targetPlatforms]
  );

  const select = (n: ComputedNode) => {
    if (!n.available) return reportErrorMsg(t("TXT_CODE_4ec4f7bb"));
    close(n);
  };

  return (
    <Modal open={open} title={t("TXT_CODE_7e267ba")} width={840} footer={null} destroyOnHidden onCancel={() => close(undefined)}>
      <div className="node-select-container">
        <Typography.Paragraph>{t("TXT_CODE_ad24269a")}</Typography.Paragraph>
        <div className="node-grid">
          {nodes.length === 0 ? (
            <div>
              <div className="justify-center">
                <div>
                  <div className="mb-2">
                    <p style={{ opacity: 0.8 }}>{t("TXT_CODE_f4110b65")}</p>
                  </div>
                  <Button
                    type="primary"
                    onClick={() => {
                      toNodesPage?.();
                      close(undefined);
                    }}
                  >
                    {t("TXT_CODE_4fe5dce5")}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            sorted.map((item) => {
              const bad = filtering && !supported(item);
              return (
                <div
                  key={item.uuid + item.remarks + item.ip}
                  className={`node-item${bad ? " node-unsupported" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => select(item)}
                  onKeyDown={(e) => e.key === "Enter" && select(item)}
                >
                  <div className="node-content">
                    <div className="node-header">
                      <span className="node-name">{item.remarks || `${item.ip}:${item.port}`}</span>
                      <div className="node-tags">
                        {item.available ? <Tag color="green">{t("TXT_CODE_b078a763")}</Tag> : <Tag color="red">{t("TXT_CODE_6cbb84a9")}</Tag>}
                        {bad && (
                          <Tag color="orange">
                            <ExclamationCircleOutlined /> {t("TXT_CODE_node_platform_unsupported")}
                          </Tag>
                        )}
                      </div>
                    </div>
                    <div className="node-details">
                      <span>ID: {item.uuid}</span>
                      <span>
                        {t("TXT_CODE_3d0885c0")}: {item.platformText}
                      </span>
                      <span className={bad ? "node-warning-text" : undefined}>
                        {bad && <ExclamationCircleOutlined />} Docker platforms: {item.dockerPlatforms?.join(",") || "--"}
                      </span>
                      <span>
                        {t("TXT_CODE_c7d0002e")}: {item.ip}:{item.port}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Upstream openNodeSelectDialog: resolves with the chosen daemon, or undefined. */
export function openNodeSelectDialog(targetPlatforms?: string[], toNodesPage?: () => void) {
  return openDialog<ComputedNode | undefined>((done) => <NodeSelectDialog targetPlatforms={targetPlatforms} toNodesPage={toNodesPage} done={done} />);
}
