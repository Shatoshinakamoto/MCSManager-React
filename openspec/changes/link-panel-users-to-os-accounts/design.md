# Design

## Context

See proposal.md for motivation. The panel already persists user records and per-daemon instance assignments. The daemon already supports POSIX per-instance run-as and has a safe single-path ownership helper. However, file ownership resolution is tied to daemon and instance configuration, and the Java Manager stores every runtime in a shared `JavaData` directory. The React Java Manager dialog already sends the current instance id, so the panel can authorize the request and the daemon can resolve the correct instance identity.

## Goals / Non-Goals

**Goals:**
- Keep one trusted identity source for panel account mapping, instance process execution, daemon file writes, and Java runtime installation.
- Preserve current behavior for unmapped accounts, unmapped instances, and existing shared Java installations.
- Fail closed when the daemon cannot resolve or safely apply a requested identity.

**Non-Goals:**
- Creating, deleting, or changing host operating-system accounts from the panel.
- Granting regular users host-shell or arbitrary daemon access.
- Rewriting ownership outside an instance workspace or silently changing permissions on its parent directories.
- Running Windows instance processes as another account (see decision 7).

## Decisions

1. **Store an OS account name on the panel user; resolve it at each target daemon.**
   - The name is an administrator-managed label, not a uid/gid supplied by a browser.
   - Each daemon resolves it locally to numeric ids using the existing safe account lookup (`id -u -- name` through execFile). It rejects uid 0 and applies the daemon's configured allowed-user policy.
   - This supports distributed nodes whose local uid/gid assignments differ.
   - Numeric identities and shell syntax are not accepted.
   - POSIX identity changes require a root daemon, unless the target is already the daemon's own uid.
   - **Alternative considered:** Store a numeric uid/gid in the panel. Rejected because ids can differ across daemons, and user-controlled ids would be an unsafe authority boundary.

2. **Use one effective uid/gid per instance, shared by every assigned regular user.**
   - Before an assignment or mapping change is committed, the panel and the target daemon validate all users sharing each affected instance.
   - A panel binding takes precedence over per-instance `runAs`. When no binding exists, the current `runAs` and daemon default behavior remain.
   - Docker receives the same effective uid/gid for its process and bind-mounted workspace.
   - Instances cannot be shared by users that resolve to different ids.
   - **Alternative considered:** Select a different host identity for each request. Rejected because one running process and one shared workspace cannot safely have multiple filesystem owners.

3. **Make assignment and binding edits a coordinated daemon operation.**
   - The panel derives affected `(daemonId, instanceUuid)` pairs from trusted stored records. It asks each daemon to validate (`check`) and then reconcile (`apply`) the target identity.
   - It persists the new panel state only after all pre-commit daemon operations succeed.
   - The daemon stores only trusted effective identity state and never accepts owner ids from frontend payloads.
   - If reconciliation fails on a large tree, already changed paths may remain changed. The operation stays inactive, reports the failure, and is safe to retry; the daemon does not attempt a potentially unsafe best-effort rollback.
   - Edits are serialised in the panel so two concurrent edits cannot interleave their checks and applies.
   - **Unbinding is best effort.** An unbinding is an affected pair whose new account list is empty, for example after a user deletion or an assignment removal. If its daemon is unreachable, the pair is skipped with a warning, because revoking panel access must never be blocked by an offline node. The next edit touching that pair converges the daemon.
   - **Alternative considered:** Persist the panel change first and reconcile asynchronously. Rejected because users could be granted access before the workspace was usable, or before the daemon was able to run it as the requested account.

4. **Reconcile existing workspaces with a no-follow recursive walk.**
   - Resolve and validate the configured workspace root.
   - Inspect entries without following symlinks, and apply ownership only to regular files and directories within that root. Each entry is opened with `O_NOFOLLOW`, re-checked by device and inode, and changed through its descriptor (`fchown`, `fchmod`).
   - Other mounted filesystems are not entered.
   - Files with more than one hard link are skipped and reported, because a hard link may name a file outside the workspace.
   - **Execute permissions are kept.** The owner always gets read and write, and folders also get search. A file that already had any execute bit, or that starts like a program (`#!`, ELF, Mach-O), becomes executable by the owner. setuid and setgid bits are dropped.
   - The workspace's top folder loses "other" access, so linked accounts cannot read each other's instances.
   - **Workspace location.** Only workspaces strictly below the instance data folder or a `johnnykins.runAs.handOverPaths` entry are walked. A workspace elsewhere is accepted only when its top folder is already owned by the account. This stops an instance whose working directory is `/` or `/etc` from giving that tree away.
   - **Ancestors.** Check that every ancestor grants search permission to the target uid and primary gid. If an ancestor outside the workspace blocks access, fail with the blocking path rather than modifying it or weakening its permissions. Supplementary groups are not considered, because Node (libuv) clears them when it spawns a process with a uid/gid.
   - **When it runs.** Reconciliation also runs after install and update tasks of a bound instance, and before a start when the top folder's owner differs from the bound account. There is no boot-time pass.
   - **Alternative considered:** Recursively invoke `chown -R` on a path. Rejected because path races and symlinks can redirect privileged ownership changes outside the workspace.

5. **Partition new Java downloads by effective identity and keep legacy paths.**
   - A Java Manager request is bound to its authorized instance. The daemon derives that instance's trusted identity and installs the runtime in `JavaData/accounts/<scope>/<runtime>`.
   - **POSIX.** The scope is `<uid>-<gid>`, and the scope folder is root-owned with mode 0711. The archive is downloaded and extracted into a root-only staging folder, handed to the account with the same walk as decision 4, and then renamed into place. The account can never redirect the extraction.
   - **Windows.** The scope is the account SID, and the runtime gets an inheritable read-and-execute grant.
   - **Listing and selection.** These resolve runtimes in the context of that instance: legacy shared runtimes plus the instance's own scope. A start fails clearly when the selected runtime belongs to another scope.
   - **Removal.** A scoped runtime's contents are removed by a process running as the owning account (`rm -rf` spawned with its uid/gid), never by root walking an account-owned tree. Root then removes the empty top folder.
   - Existing shared `JavaData/<runtime>` installations are left in place for compatibility, and no destructive migration is performed.
   - Unbound instances keep using the shared location.
   - **Alternative considered:** Keep one global runtime directory and transfer its owner after every download. Rejected because users mapped to different OS accounts would overwrite one another's ownership.

6. **Apply ownership consistently at daemon write boundaries.**
   - Extend the existing ownership helpers and file write paths, so that daemon-mediated workspace mutations apply the trusted effective uid/gid before reporting success. This covers upload, editor save, file and directory creation, copy, compression, extraction, URL download and mod install. Copied and newly created folder trees are walked with the decision 4 walker, which changes the owner only.
   - Process-generated files naturally inherit the process identity.
   - For bound instances, ownership errors are surfaced to callers. Unbound instances keep today's lenient behavior.

7. **Windows: folder access only (decided with the requester).**
   - On a Windows daemon the binding does not change the process account: instances keep running as the daemon's account, as before.
   - The binding grants the account full control of the workspace with an inheritable ACE (`icacls <dir> /grant:r *<SID>:(OI)(CI)F`). It also grants read-and-execute on that account's Java runtimes.
   - When the binding moves to another account or is cleared, the previous account's explicit grant is removed (`/remove:g`). Removing what the daemon itself added is a revocation, not an ownership rollback.
   - **Account resolution.** Accounts are resolved to a SID by a fixed PowerShell script. The script is passed with `-EncodedCommand`, and the name travels in an environment variable, never in the command line.
   - **Accepted SIDs.** The SID must be an account SID (`S-1-5-21-…-RID` with RID ≥ 1000) and must not be a local group, which excludes Everyone, SYSTEM, built-in groups and the built-in Administrator.
   - The stopped-instance and ancestor checks do not apply, because nothing about the process changes and traverse checking is bypassed for all accounts by default.
   - **Alternative considered:** Run Windows instances as the account through `CreateProcessAsUser`. Rejected because it needs the account's password or a service with `SeAssignPrimaryTokenPrivilege`, which the daemon does not have.

## Risks / Trade-offs

- **Large workspaces can make assignment or mapping edits slow, and partially reconcile before an error.** Perform a bounded, observable traversal (32 entries at a time, counts reported). Keep the assignment inactive until success, make retries idempotent, and report failures.
- **A workspace under an inaccessible parent cannot be entered by the mapped account.** Detect this before activation and report the blocking ancestor. Do not change permissions outside the workspace.
- **Docker user namespaces or container images may not support the host uid/gid.** Validate the configured process identity at startup, and return a clear failure rather than silently running as another user. The daemon cannot detect user-namespace remapping, so that remains documented as a TODO(security).
- **Existing Java paths may be stored in instance configuration.** Preserve the legacy shared location, and resolve existing configured ids without moving or deleting installations.
- **A binding change can affect instances on multiple daemons.** Validate all affected pairs before committing panel state. Make daemon reconciliation retryable, and never claim a failed multi-daemon operation succeeded.
- **Root deleting files inside an account-owned workspace remains exposed to symlink races.** This applies to the file manager's delete and to reinstall. It is pre-existing upstream behavior for any instance that runs as another account, and is recorded as a TODO(security). Scoped Java removal avoids it, as described in decision 5.
- **The Windows path cannot be exercised on this project's Linux CI.** The script and argument building are unit-tested with a mocked process runner. Real-host verification is a documented follow-up.

## Migration Plan

1. Add an optional user field with an empty default, so existing persisted user records remain valid.
2. Preserve existing Java runtime directories and per-instance run-as settings for unmapped users and instances.
3. Enable mappings only after the account resolves and each affected workspace passes reconciliation. Do not perform a boot-time mass ownership change.
4. Roll back by clearing a user's mapping through the Web Admin UI.
   - **POSIX.** Existing ownership changes are not automatically reversed. Assign the intended account again, or restore ownership administratively.
   - **Windows.** The grant the daemon added is removed.

## Open Questions

None. Platform support (Windows: folder access only), shared-instance identity rules, ownership boundaries, and Java runtime isolation are decided above.
