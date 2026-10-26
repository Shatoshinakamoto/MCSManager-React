/**
 * Default instance / Docker config objects and Dockerfile templates
 * (port of upstream types/const.ts). Used to fill in fields older instance
 * configs lack before an edit form is shown.
 */
import { TYPE_UNIVERSAL } from "@/hooks/useInstance";
import type { QuickStartPackages } from "./index";

export const TERMINAL_CODE = [
  "UTF-8",
  "GBK",
  "GB2312",
  "GB18030",
  "BIG5",
  "Big5-HKSCS",
  "Shift_JIS",
  "KS_C_5601",
  "UTF-16"
];

export const defaultDockerfile = `FROM ubuntu:latest\nRUN mkdir -p /workspace\nWORKDIR /workspace\n`;

export const jdk8Dockerfile = `FROM eclipse-temurin:8
RUN mkdir -p /workspace
WORKDIR /workspace
`;

export const ubuntu22Dockerfile = `FROM ubuntu:22.04
RUN apt update && apt -y install libcurl4 && DEBIAN_FRONTEND="noninteractive" apt -y install tzdata
RUN mkdir -p /workspace
WORKDIR /workspace
`;

export const jdk17Dockerfile = `FROM eclipse-temurin:17
RUN mkdir -p /workspace
WORKDIR /workspace
`;

export const jdk8DockerfileCN = `FROM eclipse-temurin:8
RUN echo "zh_CN.UTF-8 UTF-8">/etc/locale.gen && locale-gen
ENV LANG=zh_CN.UTF-8
ENV LANGUAGE=zh_CN.UTF-8
ENV LC_ALL=zh_CN.UTF-8
ENV TZ=Asia/Shanghai
RUN mkdir -p /workspace
WORKDIR /workspace
`;

export const ubuntu22DockerfileCN = `FROM ubuntu:22.04
ENV TZ=Asia/Shanghai
RUN sed -i -E 's/http:\\/\\/(archive|security).ubuntu.com/http:\\/\\/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list
RUN apt update && apt -y install libcurl4 && DEBIAN_FRONTEND="noninteractive" apt -y install tzdata
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
RUN mkdir -p /workspace
WORKDIR /workspace
`;

export const jdk17DockerfileCN = `FROM eclipse-temurin:17
RUN echo "zh_CN.UTF-8 UTF-8">/etc/locale.gen && locale-gen
ENV LANG=zh_CN.UTF-8
ENV LANGUAGE=zh_CN.UTF-8
ENV LC_ALL=zh_CN.UTF-8
ENV TZ=Asia/Shanghai
RUN mkdir -p /workspace
WORKDIR /workspace
`;



export const defaultDockerConfig: IGlobalInstanceDockerConfig = {
  updateCommandImage: "",
  containerName: "",
  image: "",
  memory: undefined,
  ports: [],
  extraVolumes: [],
  maxSpace: undefined,
  network: undefined,
  io: undefined,
  networkMode: "bridge",
  networkAliases: [],
  cpusetCpus: "",
  cpuUsage: undefined,
  workingDir: "/data",
  env: [],
  changeWorkdir: true,
  memorySwap: undefined,
  memorySwappiness: undefined,
  labels: [],
  gpuEnabled: false,
  gpuCount: -1,
  gpuDeviceIds: [],
  gpuDriver: "nvidia",
  deviceReadBps: [],
  deviceWriteBps: []
};

export const defaultInstanceJavaConfig: IInstanceJavaConfig = {
  id: ""
};

export const defaultInstanceInfo: IGlobalInstanceConfig = {
  nickname: "",
  startCommand: "",
  stopCommand: "^c",
  stopTimeout: 0,
  cwd: "",
  ie: "UTF-8",
  oe: "UTF-8",
  createDatetime: new Date().getTime(),
  lastDatetime: 0,
  type: TYPE_UNIVERSAL,
  tag: [],
  endTime: 0,
  fileCode: "UTF-8",
  processType: "general",
  updateCommand: "",
  runAs: "",
  actionCommandList: [],
  crlf: 1,
  category: 0,
  basePort: undefined as any,

  // Steam RCON
  enableRcon: false,
  rconPassword: "",
  rconPort: undefined,
  rconIp: "",

  // Java
  java: defaultInstanceJavaConfig,

  // Old fields
  terminalOption: {
    haveColor: true,
    pty: true,
    ptyWindowCol: 164,
    ptyWindowRow: 40
  },
  eventTask: {
    autoStart: false,
    autoRestart: false,
    autoRestartMaxTimes: 3,
    ignore: false
  },
  docker: defaultDockerConfig,
  pingConfig: {
    ip: "",
    port: undefined,
    type: 1
  },
  extraServiceConfig: {
    openFrpTunnelId: "",
    openFrpToken: ""
  }
};

export const defaultQuickStartPackages: QuickStartPackages = {
  language: "",
  description: "",
  title: "",
  category: "",
  runtime: "",
  size: "",
  hardware: "",
  remark: "",
  targetLink: "",
  author: "",
  setupInfo: defaultInstanceInfo,
  gameType: "",
  image: "",
  platform: "",
  tags: [],
  isSummary: false
};
