import { ILifeCycleTask } from "../../instance/life_cycle";
import Instance from "../../instance/instance";
import { MCServerStatus } from "mcsmanager-common";
import { globalConfiguration } from "../../config";

// When the instance is running, continue to check the expiration time
export default class PingMinecraftServerTask implements ILifeCycleTask {
  public status: number = 0;
  public name: string = "TimeCheck";

  private task?: NodeJS.Timeout;

  async start(instance: Instance) {
    // Johnnykins daemon-side gate (instanceMasterConfig.mcStatus).
    if (globalConfiguration.config.johnnykins.instanceMasterConfig.mcStatus === false) return;
    this.task = setInterval(() => {
      instance.execPreset("refreshPlayers");
    }, 1000 * 60);
  }

  async stop(instance: Instance) {
    instance.resetPingInfo();
    clearInterval(this.task);
    this.task = undefined;
  }
}
