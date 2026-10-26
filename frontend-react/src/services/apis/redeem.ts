/**
 * Business-mode redeem endpoint (port of upstream services/apis/redeem.ts).
 * Same URL, method and payload. The panel checks the code with the
 * MCSManager redeem service and does the purchase or renewal itself.
 *
 * SECURITY: the request carries only the code and ids; the panel holds the
 * panelId/registerCode and never returns them to the browser.
 */
import { defineApi } from "@/services/apiService";

export interface PortInfoProtocol {
  host: number;
  container: number;
  protocol: string;
}

export interface InstanceInfoProtocol {
  instance_id: string;
  name: string;
  expire: number;
  status: number;
  lines: Array<{ title: string; value: unknown }>;
  ports: PortInfoProtocol[];
}

export interface BuyInstanceResponse {
  instance_id: string;
  username: string;
  password: string;
  uuid: string;
  expire: number;
  instance_info?: InstanceInfoProtocol;
}

/** Buys a new instance, or renews `instanceId` when it is given. */
export const requestBuyInstance = defineApi<
  {
    data: {
      productId: number;
      daemonId: string;
      code: string;
      instanceId?: string;
      payload?: string;
      username?: string;
    };
  },
  BuyInstanceResponse
>({ url: "/api/exchange/request_buy_instance", method: "POST", timeout: 30_000 });
