/**
 * Pick a market template for an existing instance and optionally reinstall
 * it in place (port of widgets/instance/dialogs/MarketDialog.vue and
 * openMarketDialog in components/fc/index.ts).
 *
 * SECURITY: reinstall replaces the instance's files with the template's
 * download; it asks for confirmation first, and the panel checks the
 * caller's access to the instance and the allowUsePreset setting.
 */
import { App, Modal } from "antd";
import { useState } from "react";
import { useMarketPackages } from "@/hooks/useMarketPackages";
import { t } from "@/lang/i18n";
import { reinstallInstance } from "@/services/apis/instance";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";
import type { QuickStartPackages } from "@/types";
import AppPackages from "@/widgets/setupApp/AppPackages";

export interface OpenMarketDialogProps {
  daemonId?: string;
  instanceId?: string;
  autoInstall?: boolean;
  btnText?: string;
  dialogTitle?: string;
  showCustomBtn?: boolean;
  onlyDockerTemplate?: boolean;
}

function MarketDialog({ props, done }: { props: OpenMarketDialogProps; done: (item: QuickStartPackages | undefined) => void }) {
  const { modal } = App.useApp();
  const [open, setOpen] = useState(true);
  const market = useMarketPackages({ onlyDockerTemplate: props.onlyDockerTemplate });
  const close = (item: QuickStartPackages | undefined) => {
    setOpen(false);
    done(item);
  };

  const onSelectTemplate = (item: QuickStartPackages) => {
    if (!props.autoInstall || !props.instanceId || !props.daemonId) return close(item);
    modal.confirm({
      title: t("TXT_CODE_617ce69c"),
      content: t("TXT_CODE_94f1ba3"),
      okText: t("TXT_CODE_ed3fc23"),
      onOk: async () => {
        try {
          await reinstallInstance({
            params: { daemonId: props.daemonId ?? "", uuid: props.instanceId ?? "" },
            data: { targetUrl: item.targetLink, title: item.title, description: item.description },
            errorAlert: false
          });
          close(item);
        } catch (err) {
          console.error(err);
          reportErrorMsg(err);
        }
      }
    });
  };

  return (
    <Modal open={open} centered width={1600} cancelText={t("TXT_CODE_3b1cc020")} mask={{ closable: false }} footer={null} onCancel={() => close(undefined)}>
      <AppPackages
        market={market}
        btnText={props.btnText}
        showCustomBtn={props.showCustomBtn}
        onSelectCategory={(item) => market.handleSelectTopCategory(item)}
        onSelectTemplate={onSelectTemplate}
      />
    </Modal>
  );
}

export function openMarketDialog(daemonId?: string, instanceId?: string, options: OpenMarketDialogProps = {}) {
  return openDialog<QuickStartPackages | undefined>((done) => <MarketDialog props={{ daemonId, instanceId, ...options }} done={done} />);
}
