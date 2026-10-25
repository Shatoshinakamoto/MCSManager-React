/**
 * Applies the Johnnykins command sanitizer and the daemon-side
 * `instanceMasterConfig.canSendCommands` gate to console input arriving from
 * the panel ("instance/command", "stream/input", "stream/write").
 *
 * SECURITY: these are daemon-side controls the panel cannot override (NIST
 * AC-3, defense in depth). Rejected commands are logged by instance id and
 * matched rule only, never with the full command text, which may contain
 * player data or credentials (CWE-532).
 */
import { normalizeSanitizerOptions, profileFor, sanitizeCommand } from "mcsmanager-common";
import { globalConfiguration } from "../../entity/config";
import Instance from "../../entity/instance/instance";
import logger from "../log";

export class CommandRejectedError extends Error {}

/** Throw if this daemon does not accept console input at all. */
export function assertCommandsAllowed() {
  if (globalConfiguration.config.johnnykins.instanceMasterConfig.canSendCommands === false) {
    throw new CommandRejectedError("This daemon has disabled sending commands (instanceMasterConfig.canSendCommands).");
  }
}

/** @returns the command to send, after sanitizing. @throws CommandRejectedError */
export function guardCommand(instance: Instance, command: string): string {
  assertCommandsAllowed();
  const opts = normalizeSanitizerOptions(globalConfiguration.config.johnnykins.sanitizer);
  const res = sanitizeCommand(command, profileFor(instance.config.type, opts, instance.config.startCommand), opts);
  if (!res.ok) {
    logger.warn(`[Johnnykins] Command rejected for instance ${instance.instanceUuid}: ${res.reason}${res.matched ? ` (${res.matched})` : ""}`);
    throw new CommandRejectedError(`Command blocked by the daemon sanitizer: ${res.reason}${res.matched ? ` (${res.matched})` : ""}`);
  }
  return res.command;
}
