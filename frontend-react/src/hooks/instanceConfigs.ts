/**
 * Known server config files per instance type (port of INSTANCE_CONFIGS in
 * upstream hooks/useInstance.ts). Drives the "Server configuration" button
 * and the config file editor.
 */
import { t } from "@/lang/i18n";
import {
  TYPE_HYTALE,
  TYPE_MINECRAFT_BDS,
  TYPE_MINECRAFT_BEDROCK,
  TYPE_MINECRAFT_BUKKIT,
  TYPE_MINECRAFT_BUNGEECORD,
  TYPE_MINECRAFT_FABRIC,
  TYPE_MINECRAFT_FOLIA,
  TYPE_MINECRAFT_FORGE,
  TYPE_MINECRAFT_GEYSER,
  TYPE_MINECRAFT_JAVA,
  TYPE_MINECRAFT_LEAVES,
  TYPE_MINECRAFT_MCDR,
  TYPE_MINECRAFT_MOHIST,
  TYPE_MINECRAFT_NEOFORGE,
  TYPE_MINECRAFT_PAPER,
  TYPE_MINECRAFT_PUFFERFISH,
  TYPE_MINECRAFT_PURPUR,
  TYPE_MINECRAFT_SPIGOT,
  TYPE_MINECRAFT_SPONGE,
  TYPE_MINECRAFT_VELOCITY,
  TYPE_TERRARIA,
} from "./useInstance";

export interface InstanceConfigs {
  fileName: string;
  path: string;
  redirect: string;
  type: string;
  info: string;
  category: string[];
  conflict?: boolean;
  check?: boolean;
}

export function getInstanceConfigByType(type: string) {
  let result: InstanceConfigs[] = [];
  instanceConfigs().forEach((v) => {
    if (v.category.includes(type)) result.push(v);
  });
  return result;
}

/** Built at call time so labels follow the current language. */
export const instanceConfigs = (): InstanceConfigs[] => [
  {
    fileName: t("TXT_CODE_9b36d5a2"),
    path: "server.properties",
    redirect: "common/server.properties",
    type: "properties",
    info: t("TXT_CODE_12e3afa9"),
    category: [
      TYPE_MINECRAFT_SPIGOT,
      TYPE_MINECRAFT_PAPER,
      TYPE_MINECRAFT_FOLIA,
      TYPE_MINECRAFT_JAVA,
      TYPE_MINECRAFT_BUKKIT,
      TYPE_MINECRAFT_FORGE,
      TYPE_MINECRAFT_NEOFORGE,
      TYPE_MINECRAFT_FABRIC,
      TYPE_MINECRAFT_SPONGE,
      TYPE_MINECRAFT_PURPUR,
      TYPE_MINECRAFT_PUFFERFISH,
      TYPE_MINECRAFT_LEAVES,
      TYPE_MINECRAFT_MOHIST
    ]
  },
  {
    fileName: t("TXT_CODE_90f684dc"),
    type: "properties",
    info: t("TXT_CODE_ab4cc2dc"),
    path: "eula.txt",
    redirect: "common/eula.txt",
    category: [
      TYPE_MINECRAFT_SPIGOT,
      TYPE_MINECRAFT_PAPER,
      TYPE_MINECRAFT_FOLIA,
      TYPE_MINECRAFT_JAVA,
      TYPE_MINECRAFT_BUKKIT,
      TYPE_MINECRAFT_FABRIC,
      TYPE_MINECRAFT_FORGE,
      TYPE_MINECRAFT_NEOFORGE,
      TYPE_MINECRAFT_SPONGE,
      TYPE_MINECRAFT_PURPUR,
      TYPE_MINECRAFT_PUFFERFISH,
      TYPE_MINECRAFT_LEAVES,
      TYPE_MINECRAFT_MOHIST
    ]
  },
  {
    fileName: "[Spigot] spigot.yml",
    path: "spigot.yml",
    redirect: "bukkit/spigot.yml",
    type: "yml",
    info: t("TXT_CODE_509d7d9a"),
    category: [
      TYPE_MINECRAFT_SPIGOT,
      TYPE_MINECRAFT_PAPER,
      TYPE_MINECRAFT_FOLIA,
      TYPE_MINECRAFT_JAVA,
      TYPE_MINECRAFT_BUKKIT,
      TYPE_MINECRAFT_PURPUR,
      TYPE_MINECRAFT_PUFFERFISH,
      TYPE_MINECRAFT_LEAVES,
      TYPE_MINECRAFT_MOHIST
    ]
  },
  {
    fileName: "[Bukkit] bukkit.yml",
    path: "bukkit.yml",
    redirect: "bukkit/bukkit.yml",
    type: "yml",
    info: t("TXT_CODE_d03c3e0e"),
    category: [
      TYPE_MINECRAFT_SPIGOT,
      TYPE_MINECRAFT_PAPER,
      TYPE_MINECRAFT_FOLIA,
      TYPE_MINECRAFT_JAVA,
      TYPE_MINECRAFT_BUKKIT,
      TYPE_MINECRAFT_PURPUR,
      TYPE_MINECRAFT_PUFFERFISH,
      TYPE_MINECRAFT_LEAVES,
      TYPE_MINECRAFT_MOHIST
    ]
  },
  {
    fileName: "[Bungeecord] config.yml",
    type: "yml",
    info: t("TXT_CODE_e9dcbfe4"),
    path: "config.yml",
    redirect: "bungeecord/config.yml",
    category: [TYPE_MINECRAFT_JAVA, TYPE_MINECRAFT_BUNGEECORD]
  },
  {
    fileName: "[Velocity] velocity.toml",
    type: "toml",
    info: t("TXT_CODE_751f9bc1"),
    path: "velocity.toml",
    redirect: "velocity/velocity.toml",
    category: [TYPE_MINECRAFT_JAVA, TYPE_MINECRAFT_VELOCITY]
  },
  {
    fileName: "[Bedrock] server.properties",
    path: "server.properties",
    redirect: "bds/server.properties",
    type: "properties",
    info: t("TXT_CODE_3a3f9a57"),
    category: [TYPE_MINECRAFT_BDS, TYPE_MINECRAFT_BEDROCK]
  },
  {
    fileName: "[Mohist] mohist.yml",
    path: "mohist-config/mohist.yml",
    redirect: "mohist/mohist.yml",
    type: "yml",
    info: t("TXT_CODE_6eead111"),
    category: [TYPE_MINECRAFT_JAVA, TYPE_MINECRAFT_MOHIST]
  },
  {
    fileName: "[Paper] paper.yml",
    type: "yml",
    info: t("TXT_CODE_f3fc17f3"),
    path: "paper.yml",
    redirect: "paper/paper.yml",
    category: [TYPE_MINECRAFT_JAVA, TYPE_MINECRAFT_PAPER]
  },
  {
    fileName: "[Paper] paper-global.yml",
    type: "yml",
    info: t("TXT_CODE_2931127f"),
    path: "config/paper-global.yml",
    redirect: "paper/paper-global.yml",
    category: [
      TYPE_MINECRAFT_JAVA,
      TYPE_MINECRAFT_PAPER,
      TYPE_MINECRAFT_FOLIA,
      TYPE_MINECRAFT_PUFFERFISH,
      TYPE_MINECRAFT_PURPUR,
      TYPE_MINECRAFT_LEAVES
    ]
  },
  {
    fileName: "[Paper] paper-world-defaults.yml",
    type: "yml",
    info: t("TXT_CODE_4880ef77"),
    path: "config/paper-world-defaults.yml",
    redirect: "paper/paper-world-defaults.yml",
    category: [
      TYPE_MINECRAFT_JAVA,
      TYPE_MINECRAFT_PAPER,
      TYPE_MINECRAFT_FOLIA,
      TYPE_MINECRAFT_PUFFERFISH,
      TYPE_MINECRAFT_PURPUR,
      TYPE_MINECRAFT_LEAVES
    ]
  },
  {
    fileName: "[Purpur] pupur.yml",
    type: "yml",
    info: t("TXT_CODE_98e50717"),
    path: "purpur.yml",
    redirect: "purpur/purpur.yml",
    category: [TYPE_MINECRAFT_JAVA, TYPE_MINECRAFT_PAPER, TYPE_MINECRAFT_PURPUR]
  },
  {
    fileName: "[Pufferfish] pufferfish.yml",
    type: "yml",
    info: t("TXT_CODE_9213f8e3"),
    path: "pufferfish.yml",
    redirect: "pufferfish/pufferfish.yml",
    category: [TYPE_MINECRAFT_JAVA, TYPE_MINECRAFT_PUFFERFISH]
  },
  {
    fileName: "[Geyser] config.yml",
    type: "yml",
    info: t("TXT_CODE_1d39feca"),
    path: "config.yml",
    redirect: "geyser/config.yml",
    category: [TYPE_MINECRAFT_JAVA, TYPE_MINECRAFT_GEYSER]
  },
  {
    fileName: "[MCDR] config.yml",
    type: "yml",
    info: t("TXT_CODE_25699fea"),
    path: "config.yml",
    redirect: "mcdr/config.yml",
    category: [TYPE_MINECRAFT_JAVA, TYPE_MINECRAFT_MCDR]
  },
  {
    fileName: "[MCDR] permission.yml",
    type: "yml",
    info: t("TXT_CODE_5207688f"),
    path: "permission.yml",
    redirect: "mcdr/permission.yml",
    category: [TYPE_MINECRAFT_JAVA, TYPE_MINECRAFT_MCDR]
  },
  {
    fileName: "[Tshock] config.json",
    type: "json",
    info: t("TXT_CODE_1cd8f9d2"),
    path: "tshock/config.json",
    redirect: "tshock/config.json",
    category: [TYPE_TERRARIA]
  },
  {
    fileName: "[Forge] fml.toml",
    type: "toml",
    info: t("TXT_CODE_7e6a82d8"),
    path: "config/fml.toml",
    redirect: "forge/fml.toml",
    category: [TYPE_MINECRAFT_FORGE]
  },
  {
    fileName: "[NeoForge] neoforge-server.toml",
    type: "toml",
    info: t("TXT_CODE_5b6f3691"),
    path: "config/neoforge-server.toml",
    redirect: "neoforge/neoforge-server.toml",
    category: [TYPE_MINECRAFT_NEOFORGE]
  },
  {
    fileName: "[NeoForge] neoforge-common.toml",
    type: "toml",
    info: t("TXT_CODE_1efc7c5f"),
    path: "config/neoforge-common.toml",
    redirect: "neoforge/neoforge-common.toml",
    category: [TYPE_MINECRAFT_NEOFORGE]
  },
  {
    fileName: "[Leaves] leaves.yml",
    type: "yml",
    info: t("TXT_CODE_LEAVES_CONFIG_INFO"),
    path: "leaves.yml",
    redirect: "leaves/leaves.yml",
    category: [
      TYPE_MINECRAFT_JAVA,
      TYPE_MINECRAFT_PUFFERFISH,
      TYPE_MINECRAFT_PURPUR,
      TYPE_MINECRAFT_LEAVES
    ]
  },
  {
    fileName: "[Terraria] serverconfig.txt",
    path: "serverconfig.txt",
    redirect: "terraria/serverconfig.txt",
    type: "properties_not_unicode",
    info: t("TXT_CODE_TERRARIA_CONFIG_INFO"),
    category: [TYPE_TERRARIA]
  },
  {
    fileName: "[Hytale] config.json",
    path: "config.json",
    redirect: "hytale/config.json",
    type: "json",
    info: t("TXT_CODE_HYTALE_CONFIG_INFO"),
    category: [TYPE_HYTALE]
  }
];
