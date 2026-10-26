import { IUser } from "./entity_interface";

export enum UserPassWordType {
  md5 = 0,
  bcrypt = 1
}

export interface IUserApp {
  instanceUuid: string;
  daemonId: string;
  instanceInfo?: any;
}

export class User implements IUser {
  uuid: string = "";
  userName: string = "";
  passWord: string = "";
  passWordType: number = UserPassWordType.bcrypt;
  salt: string = "";
  permission: number = 0;
  registerTime: string = "";
  loginTime: string = "";
  instances: Array<IUserApp> = [];
  apiKey: string = "";
  isInit: boolean = false;
  secret = "";
  open2FA = false;
  ssoSub = "";
  ssoBound = false;
  /**
   * Host OS account this user is linked to ("" = none). Set only by a Web
   * Admin through service/os_account_service.ts, which first has every node
   * check and apply it to the user's instances.
   */
  osAccount = "";
}

export enum ROLE {
  // Web Admin (ported from the Johnnykins fork): the only role allowed to manage
  // daemons, the Docker environment, users and panel settings once
  // `webAdminEnforced` is on. See service/web_admin.ts.
  WEBADMIN = 20,
  ADMIN = 10,
  USER = 1,
  GUEST = 0,
  BAN = -1
}
