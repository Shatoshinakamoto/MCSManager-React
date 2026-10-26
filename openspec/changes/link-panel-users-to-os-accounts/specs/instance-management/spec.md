# Spec Delta

## ADDED Requirements

### Requirement: OS Account Binding

The daemon SHALL keep an instance's OS account binding (`osAccount`, empty when unbound) in its persisted configuration. The binding SHALL be changed only through the dedicated `instance/os_account/check` and `instance/os_account/apply` routes, which take an instance uuid and the list of OS account names that hold it. Instance creation, configuration updates and market templates SHALL never set it.

`check` SHALL validate without changing anything. `apply` SHALL run the same validation, reconcile the workspace, and store the binding only when reconciliation reported no failures. An empty list SHALL clear the binding without changing file ownership (POSIX) and SHALL remove the grant the daemon added (Windows).

On POSIX hosts, validation SHALL require all of the following:
- every name is a POSIX account name (not numeric) that resolves on this host;
- all names resolve to the same uid and gid;
- the uid is not 0;
- every name is permitted by `johnnykins.runAs.allowedUsers` when that list is set;
- the daemon is root, unless the uid is the daemon's own;
- the instance is stopped when the bound identity changes;
- the workspace is not the global instance and is not shared, nested or containing, with another instance bound to a different identity;
- the workspace is strictly below the instance data folder or a `johnnykins.runAs.handOverPaths` entry, or its top folder is already owned by that uid;
- every ancestor folder of the workspace grants search permission to that uid and primary gid. Otherwise validation fails and names the first blocking folder.

On Windows hosts, validation SHALL require all of the following:
- every name is a valid Windows account name;
- every name resolves to the same SID;
- that SID is a non-group account SID with RID 1000 or above;
- the workspace location rule above holds.

#### Scenario: Shell syntax and numeric ids never reach the host
- **WHEN** `check` is called with `1000`, `-u`, `a b`, or `$(id)`
- **THEN** it fails validation without running any lookup

#### Scenario: Root is refused
- **WHEN** `check` is called with an account that resolves to uid 0
- **THEN** it fails, even if `johnnykins.runAs.allowRoot` is on

#### Scenario: Different identities cannot share an instance
- **WHEN** `check` is called with `alice` and `bob` that resolve to different uids
- **THEN** it fails and names both accounts

#### Scenario: A running instance cannot change identity
- **WHEN** `apply` would bind a running instance to a different uid/gid
- **THEN** it fails and asks for the instance to be stopped, and nothing changes

#### Scenario: A blocking parent folder is reported, not changed
- **WHEN** a folder above the workspace has no search permission for the account
- **THEN** validation fails with that folder's path and its permissions are left unchanged

#### Scenario: The binding is stored only after a clean reconciliation
- **WHEN** reconciliation of the workspace reports one or more failed entries
- **THEN** `apply` fails with the counts and the binding is not stored; a later retry continues idempotently

#### Scenario: Configuration updates cannot set the binding
- **WHEN** `instance/new` or `instance/update` carries an `osAccount` key
- **THEN** the key is ignored

### Requirement: Workspace Ownership Reconciliation

Reconciling a bound POSIX instance SHALL walk its workspace without following symbolic links or entering other mounted filesystems. It SHALL open each regular file and folder with no-follow semantics, verify it is the entry that was listed (device and inode), and change it through the open descriptor.

The owner SHALL get read and write on files and full access on folders. A file that had any execute bit, or that begins with a script or executable signature (`#!`, ELF, Mach-O), SHALL become executable by the owner. setuid and setgid bits SHALL be removed. The workspace's top folder SHALL lose all access for "other".

Symbolic links, special files and files with more than one hard link SHALL be skipped and counted. Reconciliation SHALL be idempotent and SHALL report changed, skipped and failed counts.

The daemon SHALL reconcile a bound instance in three cases:
- on `apply`;
- after an install or update task finishes, while the instance is still busy;
- before a start, when the workspace's top folder is not owned by the bound account and the workspace is within the allowed roots.

It SHALL never reconcile at daemon boot.

#### Scenario: Executables stay runnable
- **WHEN** a workspace created by root contains `start.sh` (mode 0644, starting with `#!`) and `bedrock_server` (mode 0755)
- **THEN** after reconciliation both are owned by the account and executable by it

#### Scenario: Links are not followed
- **WHEN** the workspace contains a symbolic link to `/etc` and a hard link to a file outside the workspace
- **THEN** neither the link targets nor the hard-linked file change owner, and both are counted as skipped

#### Scenario: Install output is handed over
- **WHEN** a reinstall or update task finishes for an instance bound to `alice`
- **THEN** the files the task wrote are owned by `alice` before the instance leaves the busy state

### Requirement: Java Runtime Account Scope

When the Java Manager downloads a runtime for a bound instance, the daemon SHALL install it under `JavaData/accounts/<scope>/<runtime>`, where the scope is `<uid>-<gid>` on POSIX and the account SID on Windows.

On POSIX:
- the scope folder SHALL be root-owned with mode 0711;
- the runtime SHALL be downloaded and extracted in a root-only staging folder, reconciled to the account, and then moved into place;
- removing a scoped runtime SHALL delete its contents through a process running as the owning account.

On Windows, the runtime SHALL be granted read and execute for the account.

Listing and selecting runtimes SHALL be resolved for the requesting instance: legacy shared runtimes plus the instance's own scope. Downloads for unbound instances and runtimes registered from an existing path SHALL use the legacy shared location. Existing shared runtimes SHALL never be moved or deleted by this feature.

Starting an instance SHALL fail when its selected runtime belongs to another scope, or when the bound account cannot reach the runtime.

#### Scenario: Each account gets its own download
- **WHEN** instances bound to `alice` and to `bob` both download Zulu 21
- **THEN** two runtimes exist, one owned by each account, and neither appears in the other instance's list

#### Scenario: Another account's runtime cannot be selected
- **WHEN** an instance bound to `bob` asks to use the runtime id from `alice`'s scope
- **THEN** the request is refused

#### Scenario: Legacy runtimes keep working
- **WHEN** an instance selected a shared runtime before this feature and is later bound to `alice`
- **THEN** the shared runtime stays in place and remains selectable, and a start fails with the blocking folder only if `alice` cannot reach it

## MODIFIED Requirements

### Requirement: Run-As User Enforcement
The daemon SHALL run instance processes under an effective identity, chosen in this order:
1. the instance's OS account binding;
2. its run-as user;
3. `johnnykins.runAs.defaultUser`;
4. the daemon's own account.

On Unix-like hosts the process SHALL spawn with that identity's uid and gid. Docker containers SHALL run with the mapped `uid:gid`. Environment variables (`USER`, `HOME`, `LOGNAME`) and the `{mcsm_run_as}` placeholder SHALL reflect the effective identity. Run-as user names SHALL be restricted to safe characters and rejected otherwise.

A bound instance whose account cannot be resolved, resolves to uid 0, or is no longer allowed SHALL fail to start instead of falling back. On Windows, process identity SHALL be unchanged (the run-as setting is ignored as before), and a binding SHALL only grant folder access.

#### Scenario: Process spawns under the resolved uid and gid
- **WHEN** a run-as user is configured on a Unix-like host
- **THEN** the child process runs with that user's uid and gid

#### Scenario: Unsafe user names are rejected
- **WHEN** a run-as user name contains characters outside letters, digits, underscore, and hyphen
- **THEN** the start is rejected

#### Scenario: Docker containers run as the mapped user
- **WHEN** a Docker-backed instance has a run-as user or a binding
- **THEN** the container is created with the effective identity's uid:gid

#### Scenario: The binding wins over run-as
- **WHEN** an instance has `runAs` set to `minecraft` and is bound to `alice`
- **THEN** the process runs as `alice` and `{mcsm_run_as}` expands to `alice`

#### Scenario: A vanished account blocks the start
- **WHEN** the bound account was deleted from the host
- **THEN** the start fails with a message naming the account and nothing runs as root

#### Scenario: Windows keeps the daemon's account
- **WHEN** an instance on a Windows daemon is bound to `DESKTOP\alice`
- **THEN** the process runs as the daemon's account and `alice` has full control of the workspace
