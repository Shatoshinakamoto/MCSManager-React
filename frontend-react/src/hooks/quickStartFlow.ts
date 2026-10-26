/**
 * Step machine behind the quick start card (port of upstream
 * hooks/widgets/quickStartFlow.ts).
 *
 * Steps: 1 app type, 2 node, 3 create method, 4 form, 5 done.
 * Navigation only; the panel checks permissions on every create call.
 */
import {
  AppstoreAddOutlined,
  AppstoreTwoTone,
  CalculatorTwoTone,
  CloudUploadOutlined,
  CodeOutlined,
  DatabaseTwoTone,
  FileExcelOutlined,
  FileZipOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  IdcardTwoTone,
  NodeIndexOutlined,
  ShoppingCartOutlined,
  SmileTwoTone,
  TransactionOutlined
} from "@ant-design/icons";
import { useCallback, useMemo, useState, type ComponentType } from "react";
import { useNavigate } from "react-router";
import { t } from "@/lang/i18n";
import { remoteNodeList } from "@/services/apis/instance";
import { arrayFilter } from "@/tools/array";
import { reportErrorMsg } from "@/tools/validator";

export enum QUICKSTART_ACTION_TYPE {
  Minecraft = "minecraft",
  Bedrock = "bedrock",
  Hytale = "hytale",
  Terraria = "terraria",
  SteamGameServer = "steam",
  Docker = "docker",
  AnyApp = "universal"
}

export enum QUICKSTART_METHOD {
  FAST = "FAST",
  FILE = "FILE",
  IMPORT = "IMPORT",
  SELECT = "SELECT",
  EXIST = "EXIST",
  DOCKER = "DOCKER"
}

export interface ActionButtons {
  title: string;
  key: string;
  icon: ComponentType;
  click?: () => void;
}

export interface QuickStartState {
  title: string;
  step: number;
  actions?: ActionButtons[];
  appType?: QUICKSTART_ACTION_TYPE;
  createMethod?: QUICKSTART_METHOD;
  daemonId?: string;
  emptyActionsText?: string;
  icon: ComponentType;
}

const step1 = (): ActionButtons[] => [
  { title: t("TXT_CODE_9e3f25e0"), key: QUICKSTART_ACTION_TYPE.Minecraft, icon: AppstoreAddOutlined },
  { title: t("TXT_CODE_c8261c85"), key: QUICKSTART_ACTION_TYPE.Bedrock, icon: AppstoreAddOutlined },
  { title: t("TXT_CODE_2025658e"), key: QUICKSTART_ACTION_TYPE.Hytale, icon: AppstoreAddOutlined },
  { title: t("TXT_CODE_dbefcc6c"), key: QUICKSTART_ACTION_TYPE.Terraria, icon: AppstoreAddOutlined },
  { title: t("TXT_CODE_dd8d27ce"), key: QUICKSTART_ACTION_TYPE.SteamGameServer, icon: ShoppingCartOutlined },
  { title: t("TXT_CODE_e08e63b5"), key: QUICKSTART_ACTION_TYPE.AnyApp, icon: TransactionOutlined }
];

export function useQuickStartFlow() {
  const navigate = useNavigate();
  const [isLoading, setLoading] = useState(false);
  const [state, setState] = useState<QuickStartState>(() => ({ title: t("TXT_CODE_724ce74d"), step: 1, actions: step1(), icon: AppstoreTwoTone }));
  const patch = useCallback((p: Partial<QuickStartState>) => setState((s) => ({ ...s, ...p })), []);

  const toStep2 = useCallback(
    async (appType: QUICKSTART_ACTION_TYPE) => {
      patch({ appType, step: 2, emptyActionsText: t("TXT_CODE_9337bed1"), icon: DatabaseTwoTone });
      setLoading(true);
      try {
        const nodes = await remoteNodeList();
        patch({
          title: t("TXT_CODE_d182c422"),
          actions: (nodes ?? [])
            .filter((v) => v.available)
            .map((v) => ({ title: `${v.ip}:${v.port} (${v.remarks})`, key: v.uuid, icon: NodeIndexOutlined }))
        });
      } catch (err) {
        reportErrorMsg(err);
      } finally {
        setLoading(false);
      }
    },
    [patch]
  );

  const toStep3 = useCallback(
    (daemonId: string) => {
      setState((s) => ({
        ...s,
        step: 3,
        title: t("TXT_CODE_49981cb9"),
        daemonId,
        icon: CalculatorTwoTone,
        actions: arrayFilter<ActionButtons>([
          {
            title: t("TXT_CODE_266b7246"),
            key: QUICKSTART_METHOD.FAST,
            icon: AppstoreAddOutlined,
            condition: () => s.appType === QUICKSTART_ACTION_TYPE.Minecraft || s.appType === QUICKSTART_ACTION_TYPE.Bedrock,
            click: () => navigate(`/quickstart/minecraft?${new URLSearchParams({ daemonId })}`)
          },
          { title: t("TXT_CODE_acd4abda"), key: QUICKSTART_METHOD.DOCKER, icon: CodeOutlined },
          { title: t("TXT_CODE_444db70f"), key: QUICKSTART_METHOD.FILE, icon: CloudUploadOutlined },
          { title: t("TXT_CODE_f2a58270"), key: QUICKSTART_METHOD.IMPORT, icon: FileZipOutlined },
          { title: t("TXT_CODE_1baf656e"), key: QUICKSTART_METHOD.SELECT, icon: FolderOpenOutlined },
          { title: t("TXT_CODE_c14caab"), key: QUICKSTART_METHOD.EXIST, icon: FileExcelOutlined }
        ])
      }));
    },
    [navigate]
  );

  const toStep4 = useCallback((createMethod: QUICKSTART_METHOD) => patch({ step: 4, createMethod, icon: IdcardTwoTone }), [patch]);

  const toStep5 = useCallback(
    (instanceId?: string) => {
      setState((s) => {
        const query = new URLSearchParams({ daemonId: s.daemonId ?? "", instanceId: instanceId ?? "" });
        return {
          ...s,
          step: 5,
          title: t("TXT_CODE_2958a0f8"),
          icon: SmileTwoTone,
          actions: [
            { title: t("TXT_CODE_36417656"), key: "console", icon: CodeOutlined, click: () => navigate(`/instances/terminal?${query}`) },
            { title: t("TXT_CODE_2864bfbc"), key: "files", icon: FolderOpenOutlined, click: () => navigate(`/instances/terminal/files?${query}`) },
            { title: t("TXT_CODE_d4146944"), key: "main", icon: HomeOutlined, click: () => navigate("/") }
          ]
        };
      });
    },
    [navigate]
  );

  return useMemo(
    () => ({ formData: state, toStep2, toStep3, toStep4, toStep5, isLoading, isFormStep: state.step === 4, isNormalStep: state.step !== 4 }),
    [state, toStep2, toStep3, toStep4, toStep5, isLoading]
  );
}
