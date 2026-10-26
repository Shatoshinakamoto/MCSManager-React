/**
 * One-click install from the app market (port of widgets/setupApp/McPreset.vue).
 *
 * Flow: pick a category (asks for a node when none is preset), pick a
 * template, name the instance, then the daemon's quick_install task downloads
 * it and we open the new instance's terminal.
 *
 * SECURITY: the template (including setupInfo.startCommand) comes from the
 * market source an admin configured in Settings. The panel's
 * instance_admin permission check still applies to the install call.
 */
import { useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { openNodeSelectDialog } from "@/components/fc/NodeSelectDialog";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { useMarketPackages } from "@/hooks/useMarketPackages";
import { t } from "@/lang/i18n";
import { getDockerHubImagePlatforms } from "@/services/apis/envImage";
import { createAsyncTask } from "@/services/apis/instance";
import { message } from "@/tools/antdStatic";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard, QuickStartPackages } from "@/types";
import AppPackages from "./AppPackages";
import type { InstallType } from "./PackageDetailTable";
import { openTemplateNameDialog } from "./TemplateNameDialog";

/** Platforms a Docker Hub image supports, via the panel proxy (empty on failure = no filtering). */
async function imagePlatforms(imageName: string): Promise<string[]> {
  try {
    const list = await getDockerHubImagePlatforms({ data: { imageName }, errorAlert: false });
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn("Failed to get image platforms from Docker Hub:", err);
    return [];
  }
}

export default function McPreset({ card }: { card: LayoutCard }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { getMetaOrRouteValue } = useLayoutCardTools(card);
  const presetDaemonId = location.pathname.includes("/market") ? "" : getMetaOrRouteValue("daemonId", false) ?? "";
  const daemonIdRef = useRef(presetDaemonId);
  const market = useMarketPackages();
  const { handleSelectTopCategory } = market;

  const onSelectCategory = useCallback(
    async (item: QuickStartPackages) => {
      let node;
      if (!daemonIdRef.current) {
        node = await openNodeSelectDialog();
        if (!node) return reportErrorMsg(t("TXT_CODE_2de92a5d"));
        daemonIdRef.current = node.uuid;
      }
      handleSelectTopCategory(item, node);
    },
    [handleSelectTopCategory]
  );

  const onSelectTemplate = useCallback(
    async (template: QuickStartPackages, type: InstallType) => {
      const instanceName = await openTemplateNameDialog(template);
      if (!instanceName) return;
      try {
        // Copy, never mutate, the template from the shared list.
        const setupInfo: IGlobalInstanceConfig = { ...template.setupInfo, docker: { ...template.setupInfo?.docker } };
        if (type === "docker") {
          setupInfo.docker = { ...setupInfo.docker, ...template.dockerOptional };
          setupInfo.processType = "docker";
        }
        if (!daemonIdRef.current) {
          let platforms: string[] | undefined;
          if (setupInfo.docker?.image) {
            platforms = await imagePlatforms(setupInfo.docker.image);
            if (!platforms.length) platforms = undefined;
          }
          const node = await openNodeSelectDialog(platforms);
          if (!node) return reportErrorMsg(t("TXT_CODE_2de92a5d"));
          daemonIdRef.current = node.uuid;
        }
        const daemonId = daemonIdRef.current;
        const task = await createAsyncTask({
          params: { daemonId, uuid: "-", task_name: "quick_install" },
          data: { time: Date.now(), newInstanceName: instanceName, targetLink: template.targetLink || "", setupInfo },
          errorAlert: false
        });
        message.info(t("TXT_CODE_e718a226"));
        setTimeout(() => {
          navigate(`/instances/terminal?${new URLSearchParams({ daemonId, instanceId: task?.instanceUuid ?? "" })}`);
        }, 1000);
      } catch (err) {
        reportErrorMsg(err);
      }
    },
    [navigate]
  );

  return (
    <div style={{ height: "100%" }}>
      <AppPackages
        market={market}
        onSelectCategory={onSelectCategory}
        onSelectTemplate={onSelectTemplate}
        onBackToCategory={() => {
          daemonIdRef.current = "";
        }}
      />
    </div>
  );
}
