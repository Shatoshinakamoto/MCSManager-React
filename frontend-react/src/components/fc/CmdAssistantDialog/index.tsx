/**
 * Command assistant (port of components/fc/CmdAssistantDialog/index.vue):
 * pick Minecraft, a Steam game server or any program, fill in a short form,
 * and get a start command back. Upstream 10.x still ships the dialog but no
 * longer opens it; the Johnnykins fork (and upstream 10.2.1) open it from the
 * start command field of Instance Settings and of the new-instance form, and
 * so does this port.
 *
 * Resolves with the command, or undefined when cancelled.
 *
 * SECURITY: the command only fills the start command field; the admin sees
 * and saves it, and the panel's own checks for the start command apply.
 */
import { BuildFilled, DropboxSquareFilled, SwitcherFilled } from "@ant-design/icons";
import { Form, Modal, Row, Tabs, Typography } from "antd";
import { useMemo, useState } from "react";
import ActionButton from "@/components/ActionButton";
import FadeUp from "@/components/FadeUp";
import { QUICKSTART_ACTION_TYPE } from "@/hooks/quickStartFlow";
import {
  buildStartCmd,
  defaultAppTypeFor,
  newAnyAppForm,
  newMinecraftJavaForm,
  type AnyAppCmdForm,
  type MinecraftJavaCmdForm
} from "@/hooks/startCmdBuilder";
import { TYPE_MINECRAFT_BEDROCK, TYPE_MINECRAFT_JAVA, TYPE_STEAM_SERVER_UNIVERSAL, TYPE_UNIVERSAL } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";
import AnyAppForm from "./AnyAppForm";
import MinecraftJavaForm from "./MinecraftJavaForm";

/** Tabs shown for each category, as upstream. */
function tabsFor(gameType: QUICKSTART_ACTION_TYPE) {
  if (gameType === QUICKSTART_ACTION_TYPE.Minecraft)
    return [
      { key: TYPE_MINECRAFT_JAVA, label: t("TXT_CODE_95583336") },
      { key: TYPE_MINECRAFT_BEDROCK, label: t("TXT_CODE_28116f29") }
    ];
  if (gameType === QUICKSTART_ACTION_TYPE.SteamGameServer) return [{ key: TYPE_STEAM_SERVER_UNIVERSAL, label: t("TXT_CODE_dd8d27ce") }];
  return [{ key: TYPE_UNIVERSAL, label: t("TXT_CODE_feab659d") }];
}

function CmdAssistantDialog({ done }: { done: (cmd?: string) => void }) {
  const [open, setOpen] = useState(true);
  const [gameType, setGameType] = useState<QUICKSTART_ACTION_TYPE>();
  const [appType, setAppType] = useState<string>();
  const [mcForm] = Form.useForm<MinecraftJavaCmdForm>();
  const [anyForm] = Form.useForm<AnyAppCmdForm>();
  const mcInitial = useMemo(() => newMinecraftJavaForm(), []);
  const anyInitial = useMemo(() => newAnyAppForm(), []);
  const isJavaForm = gameType === QUICKSTART_ACTION_TYPE.Minecraft && appType === TYPE_MINECRAFT_JAVA;

  const close = (cmd?: string) => {
    setOpen(false);
    done(cmd);
  };

  const choose = (type: QUICKSTART_ACTION_TYPE) => {
    setGameType(type);
    setAppType(defaultAppTypeFor(type));
  };

  const submit = async () => {
    try {
      await (isJavaForm ? mcForm : anyForm).validateFields();
    } catch {
      return reportErrorMsg(t("TXT_CODE_d6c5a7f8"));
    }
    const mc = { ...mcInitial, ...mcForm.getFieldsValue(true) };
    const any = { ...anyInitial, ...anyForm.getFieldsValue(true) };
    close(buildStartCmd(gameType, appType, mc, any));
  };

  const actions = [
    { icon: BuildFilled, title: t("TXT_CODE_f2deb1d0"), type: QUICKSTART_ACTION_TYPE.Minecraft },
    { icon: SwitcherFilled, title: t("TXT_CODE_dd8d27ce"), type: QUICKSTART_ACTION_TYPE.SteamGameServer },
    { icon: DropboxSquareFilled, title: t("TXT_CODE_4600deb7"), type: QUICKSTART_ACTION_TYPE.AnyApp }
  ];

  return (
    <Modal
      open={open}
      centered
      width={800}
      mask={{ closable: false }}
      title={t("TXT_CODE_2728d0d4")}
      okText={t("TXT_CODE_d507abff")}
      cancelText={t("TXT_CODE_a0451c97")}
      okButtonProps={{ disabled: gameType === undefined }}
      onOk={submit}
      onCancel={() => close()}
    >
      {gameType === undefined ? (
        <Row gutter={[0, 12]}>
          <Typography.Text>{t("TXT_CODE_18df7f10")}</Typography.Text>
          <FadeUp>
            {actions.map((a) => (
              <ActionButton key={a.type} icon={a.icon} title={a.title} click={() => choose(a.type)} />
            ))}
          </FadeUp>
        </Row>
      ) : (
        <>
          <Tabs activeKey={appType} onChange={setAppType} items={tabsFor(gameType)} />
          {/* Both forms stay mounted so switching tabs keeps what was typed. */}
          <div hidden={!isJavaForm}>
            <MinecraftJavaForm form={mcForm} initial={mcInitial} />
          </div>
          <div hidden={isJavaForm}>
            <AnyAppForm form={anyForm} initial={anyInitial} />
          </div>
        </>
      )}
    </Modal>
  );
}

/** Opens the command assistant; resolves with the built command, or undefined when cancelled. */
export function openCmdAssistantDialog(): Promise<string | undefined> {
  return openDialog<string | undefined>((done) => <CmdAssistantDialog done={done} />);
}
