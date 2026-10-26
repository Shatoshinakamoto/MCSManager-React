# Proposal

## Why

A daemon usually runs as root, while the people using the panel are meant to run their servers as ordinary host accounts. Today the only link between the two is the per-instance "Run As" field. It sets the process account, but everything the daemon writes on the user's behalf stays owned by root:
- instance creation and reinstall;
- file manager uploads, edits, copies and new folders;
- URL downloads and mod installs;
- Java Manager downloads.

So a non-root account assigned to an instance created by root cannot write its own files. It also may not be able to run the Java runtime the Java Manager installed. The fix today is a manual `chown -R` on the host. Windows hosts have no equivalent at all.

Administrators need to link a panel account to a host OS account once. Then every instance that account is given should run as that OS account and be owned by it, recursively and with execute permissions intact. Java runtimes downloaded for those instances should belong to it too. Nothing should change for accounts and instances that are not linked.

## What Changes

- **New `osAccount` field on panel users.** It is optional and defaults to empty.
  - Only a Web Admin (permission 20) can set it.
  - It holds a host account name (POSIX or Windows form), never a numeric id.
- **Coordinated edits.** When an edit changes which OS accounts hold an instance, the panel first asks each affected daemon to check, then to apply, the new binding. This covers changes to a user's `osAccount`, their instance assignments, user deletion, and exchange purchases for a linked account. The panel stores the edit only after every required daemon step succeeded. Edits are serialised.
- **Two new daemon routes:** `instance/os_account/check` and `instance/os_account/apply`. They validate and reconcile one instance against the list of OS accounts that hold it.
  - **POSIX.** All accounts must resolve to one uid/gid that is not 0 and is allowed by `johnnykins.runAs.allowedUsers`.
    - The daemon must be root, unless the target is the daemon's own uid.
    - The instance must be stopped when its identity changes.
    - Every folder above the workspace must let the account through. Otherwise the request fails and names the blocking folder.
    - The workspace must sit inside the instance data folder or a configured `johnnykins.runAs.handOverPaths` entry.
    - Reconciliation walks the workspace without following links and changes the owner of regular files and folders. It keeps execute bits and makes recognisable programs and scripts runnable by the owner.
    - The binding is stored only after the walk finishes with no failures.
  - **Windows.** The daemon grants the account full control of the workspace through an inheritable ACL entry, and removes the grant from an account that loses the binding. Processes still run as the daemon's own account.
- **Effective identity for each instance:** the bound OS account, else `runAs`, else `johnnykins.runAs.defaultUser`, else the daemon itself. The bound account is used for:
  - host processes, PTY processes and Docker containers (`uid:gid`);
  - `{mcsm_run_as}` and the `USER`, `HOME` and `LOGNAME` variables;
  - ownership of every file the daemon writes into the workspace.

  On a bound instance, a failure to resolve the account blocks the start or the write instead of falling back to root.
- **Ownership at every daemon write:** new file, new folder, editor save, copy, compress, URL download, mod install, upload and extraction. For bound instances, workspaces are reconciled again after install and update tasks, and before a start when the workspace's top folder has a different owner.
- **Per-account Java.**
  - **Downloads.** Downloads for a bound instance go to `JavaData/accounts/<scope>/<runtime>`, where the scope is `<uid>-<gid>` on POSIX and the SID on Windows. The scope folder is root-owned and traversable but not listable. The runtime itself is owned by the account (POSIX) or granted read and run (Windows).
  - **Listing and selection.** These are resolved for the requesting instance: legacy shared runtimes plus that instance's own scope.
  - **Start and removal.** A start fails clearly when the selected runtime belongs to another scope or cannot be reached. Removing a scoped runtime deletes its contents as the owning account, never as root.
  - Existing shared runtimes stay where they are.
- **UI.**
  - The React user editor gets an "OS account" field (Web Admin only).
  - Instance settings show the linked account and lock "Run As" while a binding exists.
  - The Java Manager says which account's runtimes it shows.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `user-management`: the user model gains `osAccount`; administrative editing, deletion and exchange purchase coordinate OS-account bindings with daemons.
- `instance-management`: new binding routes, workspace reconciliation, effective identity precedence (including Docker and Windows), and per-account Java runtimes.
- `file-management`: file ownership synchronisation covers every daemon write and fails closed for bound instances.

## Impact

- **Panel:**
  - `entity/user.ts`
  - `service/user_service.ts`
  - new `service/os_account_service.ts`
  - `routers/user_overview_router.ts`, `routers/manage_user_router.ts`, `routers/java_manager_router.ts`
  - `service/exchange_service.ts`
- **Daemon:**
  - `entity/config.ts`: `johnnykins.runAs.handOverPaths`.
  - `entity/instance/Instance_config.ts` and `instance.ts`: new `osAccount` config field, env and placeholders.
  - New `tools/os_account.ts`, `tools/owner_tree.ts`, `tools/windows_acl.ts`, `service/os_account_binding.ts` and `routers/os_account_router.ts`.
  - Changed: `tools/system_user.ts`, `tools/file_ownership.ts`, `service/docker_process_service.ts`, `service/java_manager.ts`, `routers/java_manager_router.ts`, `routers/file_router.ts`, `service/mod_service.ts`, and the general install and update commands.
- **React:**
  - user editor
  - instance settings
  - Java Manager dialog and API types
  - 12 language files
- **Docs:**
  - new `docs/features/os-user-accounts.md`
  - `run-as-user.md`, `install-guide.md` and `configuration/daemon-johnnykins.md`
  - CHANGELOG and SECURITY-LOG
- **Behaviour change.** Bound instances refuse to start or write when their account cannot be resolved. Unbound accounts and instances behave as before. No ownership is changed at daemon boot. Clearing a mapping does not reverse ownership on POSIX.
