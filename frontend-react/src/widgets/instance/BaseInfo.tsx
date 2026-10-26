/** Instance summary card (port of widgets/instance/BaseInfo.vue). Polls every 3 s. */
import { CheckCircleOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { Tag, Typography } from "antd";
import CardPanel from "@/components/CardPanel";
import { GLOBAL_INSTANCE_NAME } from "@/config/const";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useInstanceInfo } from "@/hooks/useInstance";
import { t } from "@/lang/i18n";
import { parseTimestamp } from "@/tools/time";
import type { LayoutCard } from "@/types";
import { openDockerInfoDialog } from "./dialogs/DockerInfo";

const P = Typography.Paragraph;

export default function BaseInfo({ card }: { card: LayoutCard }) {
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const instanceId = getMetaOrRouteValue("instanceId");
  const daemonId = getMetaOrRouteValue("daemonId");
  const { statusText, isRunning, isStopped, instanceTypeText, instanceInfo } = useInstanceInfo({ instanceId, daemonId, autoRefresh: true });

  const config = instanceInfo?.config;
  const info = instanceInfo?.info;
  const instanceName = config?.nickname === GLOBAL_INSTANCE_NAME ? t("TXT_CODE_5bdaf23d") : config?.nickname;
  const gameServer = info?.mcPingOnline ? { players: `${info.currentPlayers} / ${info.maxPlayers}`, version: info.version } : null;
  const started = Number(instanceInfo?.started);
  const autoRestarted = Number(instanceInfo?.autoRestarted);

  return (
    <CardPanel className="containerWrapper" style={{ height: "100%" }} title={card.title}>
      <P>
        {t("TXT_CODE_7ec9c59c")}
        <span className="mr-10">{instanceName}</span>
        {isRunning ? (
          <Tag color="green" className="tag">
            <CheckCircleOutlined /> {statusText}
          </Tag>
        ) : isStopped ? (
          <Tag className="tag">
            <ExclamationCircleOutlined /> {statusText}
          </Tag>
        ) : (
          <Tag className="tag" color="pink">
            {statusText}
          </Tag>
        )}
      </P>
      <P>
        <span>{t("TXT_CODE_68831be6")}</span>
        <span>{instanceTypeText}</span>
      </P>
      <P>
        {t("TXT_CODE_ad30f3c5")}
        {started > 0 ? <Tag>{instanceInfo?.started}</Tag> : <span>{instanceInfo?.started}</span>}
      </P>
      <P>
        {t("TXT_CODE_6420023d")}
        {autoRestarted > 0 ? <Tag className="ml-6">{instanceInfo?.autoRestarted}</Tag> : <span className="ml-6">{instanceInfo?.autoRestarted}</span>}
      </P>
      {gameServer && (
        <>
          <P>
            <span>{t("TXT_CODE_855c4a1c")}</span>
            <span>{gameServer.players}</span>
          </P>
          <P>
            <span>{t("TXT_CODE_e260a220")}</span>
            <span>{gameServer.version}</span>
          </P>
        </>
      )}
      {config?.processType === "docker" && (
        <P>
          {t("TXT_CODE_4f917a65")}
          <a role="button" onClick={() => void openDockerInfoDialog(config.docker)}>
            {t("TXT_CODE_530f5951")}
          </a>
        </P>
      )}
      {Number(info?.allocatedPorts?.length) > 0 && (
        <P>
          {t("TXT_CODE_2e4469f6")}
          <div style={{ padding: "10px 0 0 16px" }}>
            {info?.allocatedPorts?.map((item, index) => (
              <div key={index} className="mb-4">
                <Tag color="green">{item.protocol.toUpperCase()}</Tag>
                <Tag>
                  <span>
                    {t("TXT_CODE_8dfc41ef")}: {item.host}
                  </span>
                  <span className="ml-4">
                    {" "}
                    {t("TXT_CODE_8f8103b7")}: {item.container}{" "}
                  </span>
                </Tag>
              </div>
            ))}
          </div>
        </P>
      )}
      <P>
        <span>{t("TXT_CODE_ae747cc0")}</span>
        <span>{parseTimestamp(config?.endTime) || t("TXT_CODE_e3a77a77")}</span>
      </P>
      {!gameServer && (
        <P>
          {t("TXT_CODE_8b8e08a6")}
          {parseTimestamp(config?.createDatetime)}
        </P>
      )}
      <P>
        {t("TXT_CODE_46f575ae")}
        {parseTimestamp(config?.lastDatetime)}
      </P>
      {!gameServer && (
        <P>
          <span>
            {t("TXT_CODE_cec321b4")}
            {config?.oe?.toUpperCase()}{" "}
          </span>
          <span className="ml-6">
            {t("TXT_CODE_400a4210")}
            {config?.ie?.toUpperCase()}
          </span>
        </P>
      )}
      <P>
        <Typography.Text title={instanceInfo?.instanceUuid}>{t("TXT_CODE_30051f9b")}</Typography.Text>
        <Typography.Text copyable={{ text: instanceInfo?.instanceUuid }} />
        <Typography.Text className="ml-20" title={daemonId}>
          {t("TXT_CODE_5f2d2e30")}
        </Typography.Text>
        <Typography.Text copyable={{ text: daemonId }} />
      </P>
      {!!config?.tag?.length && (
        <P>
          <details open>
            <summary>{t("TXT_CODE_eaabd222")}:</summary>
            {config.tag.map((tag) => (
              <Tag key={tag} className="m-4" style={{ display: "inline-block" }}>
                {tag}
              </Tag>
            ))}
          </details>
        </P>
      )}
    </CardPanel>
  );
}
