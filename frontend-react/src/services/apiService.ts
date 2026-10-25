/**
 * HTTP client for the MCSManager panel API, ported from upstream
 * services/apiService.ts with the same behaviour:
 *  - identical in-flight requests are de-duplicated,
 *  - responses are cached for 2 s,
 *  - the panel's { status, data, time } envelope is unwrapped.
 *
 * Trust boundary: everything returned here is panel output and is rendered
 * through React (auto-escaped). Errors are reduced to a message string.
 *
 * Security:
 * - The session cookie authenticates; the per-session `token` is sent as a
 *   query parameter because that is where the unchanged panel reads its
 *   anti-CSRF token (panel middleware/permission.ts). SECURITY-WARNING: tokens
 *   in URLs can land in proxy logs (CWE-598). TODO(security): teach the panel
 *   to accept an X-MCSM-Token header, then move it out of the query string.
 * - `X-Requested-With` marks requests as XHR, which the panel uses as a CSRF
 *   signal (ASVS V4.2.2).
 * - Relative URLs only ("./api/...") so requests never leave the panel origin
 *   (CWE-918 style redirection of credentials).
 */
import axios, { type AxiosError, type AxiosRequestConfig } from "axios";
import EventEmitter from "eventemitter3";

export interface RequestConfig extends AxiosRequestConfig {
  forceRequest?: boolean;
  errorAlert?: boolean;
}

interface PacketProtocol<T> {
  data: T;
  status: number;
  time: number;
}

/** Supplies the current session token; set by the app-state store. */
let tokenProvider: () => string | undefined = () => undefined;
export function setTokenProvider(fn: () => string | undefined): void {
  tokenProvider = fn;
}

const http = axios.create();
http.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";
http.interceptors.request.use((config) => {
  const token = tokenProvider();
  config.params = { ...(config.params ?? {}) };
  // SECURITY: anti-CSRF token expected by the panel (see header comment).
  if (token) config.params.token = token;
  return config;
});

const RESPONSE_CACHE_TIME = 2000;
const REQUEST_CACHE_TIME = 100;

class ApiService {
  private readonly event = new EventEmitter();
  private readonly responseMap = new Map<string, { timestamp: number; data: unknown }>();

  /**
   * Send (or join) a request and resolve with the unwrapped `data` field.
   * @throws Error with the panel's message on non-200 responses.
   */
  async subscribe<T>(input: RequestConfig): Promise<T | undefined> {
    if (!input.url) throw new Error("ApiService: RequestConfig.url is empty");
    // Shallow copies so callers' objects are never mutated.
    const config: RequestConfig = { ...input, params: { ...(input.params ?? {}) } };
    for (const [key, value] of this.responseMap) {
      if (value.timestamp + RESPONSE_CACHE_TIME < Date.now()) this.responseMap.delete(key);
    }
    // SECURITY: force same-origin relative paths.
    if (config.url!.startsWith("/")) config.url = "." + config.url;

    if (config.forceRequest) {
      config.params = { ...(config.params ?? {}), _force: Date.now() };
      return this.send<T>(config);
    }

    const reqId = [config.method, config.url, JSON.stringify(config.data ?? {}), JSON.stringify(config.params ?? {})].join("|");
    return new Promise<T | undefined>((resolve, reject) => {
      this.event.once(reqId, (data: unknown) => {
        if (data instanceof Error) reject(data);
        else resolve(structuredClone(data) as T);
      });
      const cached = this.responseMap.get(reqId);
      if (cached && cached.timestamp + RESPONSE_CACHE_TIME > Date.now()) {
        this.event.emit(reqId, cached.data);
        return;
      }
      if (this.event.listenerCount(reqId) <= 1) void this.sendShared(config, reqId);
    });
  }

  private async send<T>(config: RequestConfig): Promise<T | undefined> {
    try {
      const { data } = await http.request<PacketProtocol<T>>(config);
      return data?.data;
    } catch (err) {
      throw toError(err);
    }
  }

  private async sendShared(config: RequestConfig, reqId: string): Promise<void> {
    try {
      const start = Date.now();
      config.timeout ??= 30_000;
      const { data } = await http.request<PacketProtocol<unknown>>(config);
      const elapsed = Date.now() - start;
      // Hold very fast responses briefly so bursts of identical calls share one result.
      if (elapsed < REQUEST_CACHE_TIME) await new Promise((r) => setTimeout(r, REQUEST_CACHE_TIME - elapsed));
      this.responseMap.set(reqId, { timestamp: Date.now(), data: data?.data });
      this.event.emit(reqId, data?.data);
    } catch (err) {
      this.event.emit(reqId, toError(err));
    }
  }
}

/**
 * Normalise axios/network errors to Error(message).
 * SECURITY: only the panel's message string is kept, no stack or config (CWE-209).
 */
export function toError(err: unknown): Error {
  const axiosErr = err as AxiosError<{ data?: unknown; status?: number }>;
  const body = axiosErr?.response?.data;
  if (body && body.data != null && body.status !== 200) return new Error(String(body.data));
  if (err instanceof Error) return new Error(err.message);
  return new Error(String(err));
}

export const apiService = new ApiService();

/**
 * Build a typed API caller, the React counterpart of upstream useDefineApi.
 * Usage: `const status = await panelStatus({ params: {...} })`.
 */
export function defineApi<P extends RequestConfig | undefined, T>(base: RequestConfig) {
  return (config?: P): Promise<T | undefined> =>
    apiService.subscribe<T>({
      ...base,
      ...(config ?? {}),
      headers: { ...(base.headers ?? {}), ...((config as RequestConfig | undefined)?.headers ?? {}) }
    } as RequestConfig);
}
