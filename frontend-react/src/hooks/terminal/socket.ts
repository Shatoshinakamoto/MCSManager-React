/** socket.io client for a daemon (port of upstream hooks/useSocketIo.ts makeSocketIo). */
import { io, type Socket } from "socket.io-client";
import { parseForwardAddress, removeTrail } from "@/tools/protocol";

/**
 * SECURITY: upstream passed `rejectUnauthorized: false`. That option does
 * nothing in a browser (the browser always verifies TLS), and the project
 * rule is never to disable verification, so it is left out.
 */
export function makeSocketIo(addr: string, prefix?: string): Socket {
  const p = removeTrail((prefix ?? "").trim(), "/");
  return io(parseForwardAddress(addr, "ws"), {
    path: p + "/socket.io",
    multiplex: false,
    reconnectionDelayMax: 1000 * 10,
    timeout: 1000 * 30,
    reconnection: true,
    reconnectionAttempts: 3,
    autoConnect: false
  });
}
