/** Shapes of GET /api/overview (mirrors IPanelOverviewResponse in common/global.d.ts). */
export interface OverviewRemote {
  version: string;
  process?: { cpu: number; memory: number; cwd: string };
  instance?: { running: number; total: number };
  system?: {
    type: string; hostname: string; platform: string; release: string; uptime: number; cwd: string;
    loadavg: number[]; freemem: number; cpuUsage: number; memUsage: number; totalmem: number;
    processCpu: number; processMem: number;
  };
  cpuMemChart?: { cpu: number; mem: number }[];
  uuid: string;
  ip: string;
  port: number;
  prefix: string;
  available: boolean;
  remarks: string;
  remoteMappings?: RemoteMapping[];
  config?: {
    language: string; uploadSpeedRate: number; downloadSpeedRate: number; maxDownloadFromUrlFileCount: number;
    portRangeStart: number; portRangeEnd: number; portAssignInterval: number; port: number; outputBufferSize: number;
    enableSoftShutdown: boolean; softShutdownSkipDocker: boolean; softShutdownWaitSeconds: number;
  };
  dockerPlatforms?: string[];
  /** "Run as" capability (daemon tools/system_user.ts). Missing on daemons older than this port. */
  runAs?: NodeRunAsInfo;
}

export interface NodeRunAsInfo {
  supported: boolean;
  platform: string;
  defaultUser: string;
  allowedUsers: string[];
  allowRoot: boolean;
}

export interface RemoteMapping {
  from: { ip: string; port: number; prefix: string };
  to: { ip: string; port: number; prefix: string };
}

export interface OverviewResponse {
  version: string;
  specifiedDaemonVersion: string;
  process: { cpu: number; memory: number; cwd: string };
  record: { logined: number; illegalAccess: number; banips: number; loginFailed: number };
  system: {
    user: { username?: string } | null; time: number; totalmem: number; freemem: number; type: string;
    version: string; node: string; hostname: string; loadavg: number[]; platform: string; release: string;
    uptime: number; cpu: number;
  };
  chart: {
    system: { cpu: number; mem: number }[];
    request: { value: number; totalInstance: number; runningInstance: number }[];
  };
  remoteCount: { available: number; total: number };
  remote: OverviewRemote[];
}

export interface ComputedNode extends OverviewRemote {
  platformText?: string;
  cpuInfo?: string;
  instanceStatus?: string;
  memText?: string;
  cpuChartData?: number[];
  memChartData?: number[];
}

export interface ComputedOverview extends Omit<OverviewResponse, "remote"> {
  totalInstance: number;
  runningInstance: number;
  /** Panel host CPU percent (0-100). */
  cpu: number;
  /** Panel host FREE memory percent (0-100), as upstream. */
  mem: number;
  remote: ComputedNode[];
}
