/**
 * Floating "transfer manager" button and popover listing the daemon's mod
 * download/upload tasks (port of mod-manager/ModFloatingTools.vue).
 * Rendered into document.body like upstream's <teleport>.
 */
import { CloudDownloadOutlined, CloudUploadOutlined, DeleteOutlined, LoadingOutlined, SwapOutlined } from "@ant-design/icons";
import { App, Button, FloatButton, Popover, Progress } from "antd";
import { createPortal } from "react-dom";
import { t } from "@/lang/i18n";
import { stopTransferApi } from "@/services/apis/modManager";
import type { ModListStatus, TransferTask } from "./types";
import "./ModFloatingTools.scss";

interface Props {
  instanceId: string;
  daemonId: string;
  fileStatus: ModListStatus;
  onRefresh: () => void;
}

const percent = (task: TransferTask) => (task.total > 0 ? Math.floor((task.current / task.total) * 100) : 0);

export default function ModFloatingTools({ instanceId, daemonId, fileStatus, onRefresh }: Props) {
  const { message } = App.useApp();
  const tasks = fileStatus?.downloadTasks ?? [];
  const activeTasksCount = tasks.filter((x) => x.status === 0).length;
  const urlTasks = fileStatus?.downloadFileFromURLTask ?? 0;

  const onStopTransfer = async (task: TransferTask) => {
    try {
      await stopTransferApi({ forceRequest: true, data: { daemonId, uuid: instanceId, fileName: task.path, type: task.type, uploadId: task.id } });
      message.success(t("TXT_CODE_7f0c746d"));
      onRefresh();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const content = (
    <div className="popover-content custom-scrollbar">
      <div className="popover-header">
        <div className="header-left">
          <div className="header-indicator"></div>
          <span className="header-title">{t("TXT_CODE_TRANSFER_MANAGER")}</span>
          <span className="header-badge">{tasks.length}</span>
        </div>
      </div>

      {!tasks.length && !urlTasks && (
        <div className="empty-state">
          <div className="empty-icon">
            <SwapOutlined style={{ fontSize: 28 }} className="empty-icon-inner" />
          </div>
          <div className="empty-text">{t("TXT_CODE_NO_TRANSFER_TASK")}</div>
        </div>
      )}

      {urlTasks > 0 && tasks.length === 0 && (
        <div className="url-task-indicator">
          <div className="url-task-icon">
            <LoadingOutlined className="url-task-icon-inner" />
          </div>
          <span className="url-task-text">{t("TXT_CODE_8b7fe641", { count: urlTasks })}</span>
        </div>
      )}

      <div className="task-list">
        {tasks.map((task) => {
          const pct = percent(task);
          const color = task.status === 2 ? "#ef4444" : task.status === 1 ? "#22c55e" : task.type === "upload" ? "#f97316" : "#3b82f6";
          const pctClass = task.status === 2 ? "task-percent-error" : task.status === 1 ? "task-percent-success" : task.type === "upload" ? "task-percent-upload" : "task-percent-download";
          return (
            <div key={task.path} className="task-item">
              <div className="task-header">
                <div className="task-info">
                  <div className={`task-icon ${task.type === "download" ? "task-icon-download" : "task-icon-upload"}`}>
                    {task.type === "download" ? <CloudDownloadOutlined style={{ fontSize: 22 }} /> : <CloudUploadOutlined style={{ fontSize: 22 }} />}
                  </div>
                  <div className="task-details">
                    <div className="task-filename" title={task.path}>
                      {task.path.split(/[\\/]/).pop() || task.path}
                    </div>
                    <div className="task-status-text">
                      {task.status === 2 ? (
                        <span className="task-status-error">{task.error || t("TXT_CODE_DOWNLOAD_FAILED")}</span>
                      ) : task.status === 1 ? (
                        <span className="task-status-success">{t("TXT_CODE_FINISHED")}</span>
                      ) : (
                        <>
                          <span className="task-status-progress">{(task.current / 1024 / 1024).toFixed(2)}MB</span>
                          {task.total > 0 && <span className="task-status-total">/ {(task.total / 1024 / 1024).toFixed(2)}MB</span>}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="task-actions">
                  <span className={`task-percent ${pctClass}`}>{pct}%</span>
                  {task.status === 0 && (
                    <Button size="large" type="text" danger className="task-stop-button" icon={<DeleteOutlined style={{ fontSize: 18 }} />} onClick={() => void onStopTransfer(task)} />
                  )}
                </div>
              </div>
              <div className="task-progress-wrapper">
                <Progress
                  percent={task.status === 1 ? 100 : pct}
                  showInfo={false}
                  status={task.status === 2 ? "exception" : task.status === 1 ? "success" : "active"}
                  size={{ height: 6 }}
                  strokeColor={color}
                  className="task-progress"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return createPortal(
    <Popover placement="leftBottom" trigger="click" classNames={{ root: "frosted-popover" }} arrow={false} content={content}>
      <FloatButton
        className="frosted-float-button"
        style={{ right: 24, bottom: 24, zIndex: 9999 }}
        tooltip={t("TXT_CODE_TRANSFER_MANAGER")}
        badge={{ count: activeTasksCount, overflowCount: 999, showZero: false }}
        icon={<SwapOutlined />}
      />
    </Popover>,
    document.body
  );
}
