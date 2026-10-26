# Run instances as another OS account ("Run As")

## 1. What it does

Each instance can start its process as a chosen OS account instead of the daemon's own account, so one game
server cannot read or change another's files or the daemon's data. The field is **Run As** in Instance
Settings > Advanced Settings (config key `runAs`). The feature comes from upstream MCSManager; this port adds
who may use it and when.

| Rule | Where it is enforced |
|---|---|
| Only a **Web Admin/Owner** (permission 20) can set or change "Run As", whether or not Web Admin enforcement is on. For anyone else the key is dropped from create and update requests, so an update keeps the current value. | Panel, `panel/src/app/service/run_as_policy.ts` |
| Market and preset templates cannot set "Run As". | Daemon, `stripTemplateRunAs` in `daemon/src/routers/Instance_router.ts` |
| Switching to another account needs the daemon to run as **root** (Linux, macOS). A non-root daemon refuses to start such an instance with a clear message, instead of upstream's `EPERM`. Naming the daemon's own account is allowed and changes nothing. | Daemon, `daemon/src/tools/system_user.ts` |
| `johnnykins.runAs.allowedUsers` limits the accounts; `allowRoot` (default off) is needed to name root. | Daemon, same file |
| `johnnykins.runAs.defaultUser` runs instances with an empty "Run As" as that account instead of root. | Daemon, same file; also used for file manager ownership |
| Windows ignores "Run As", as upstream does. | Daemon |

For Docker instances "Run As" is the container user (`--user`). It needs no root daemon, is still limited to
Web Admins, and the daemon's account limits do not apply to it.

The instance settings dialog shows the field as editable only when the viewer is a Web Admin and the daemon
reports that it can switch accounts (`runAs` in the daemon's `info/overview`); otherwise it is locked with the
reason. With `allowedUsers` set it becomes a drop-down.

## 2. How to use it

1. Install the daemon as described in [install-guide.md](../install-guide.md), method A.
2. In `daemon/data/Config/global.json` set `johnnykins.runAs` ([settings](../configuration/daemon-johnnykins.md#johnnykinsrunas)), restart the daemon.
3. Log in as a Web Admin, open the instance, Instance Settings > Advanced Settings > Run As, pick the account, save.
4. Give that account its instance folder: `sudo chown -R <account>: <instance folder>`. If it cannot open the
   folder, the console prints this command when the instance starts.

## 3. How it is secure

- Least privilege (NIST AC-6, CWE-250): instances need not share the daemon's account; with `defaultUser` set,
  nothing runs as root by accident. A root daemon without `defaultUser` logs a warning at every start.
- Separation of duties (NIST AC-5, CWE-269): choosing an OS account is a host-level decision kept to Web Admins.
  Admins keep creating and editing instances.
- No command or option injection (CWE-78, CWE-88): account names must be portable POSIX names or numeric uids
  (`^[A-Za-z_][A-Za-z0-9_-]{0,31}$` or digits). They are looked up with `execFile("id", ["-u", "--", name])`, never
  a shell. Upstream used `exec` with a string and allowed a leading `-`.
- The panel log records ignored attempts: `[RunAs] Ignored a "Run As" value from <user>`.

## 4. Limitations and known risks

- SECURITY-WARNING: a root daemon is still root. A Web Admin reaches root through the global terminal and global
  file manager. Give the Web Admin role only to people who already administer the host.
- The access hint for the instance folder ignores supplementary groups, so it can warn about a folder the account
  can in fact open through a group.
- The daemon does not change folder ownership by itself (upstream's choice, to avoid surprises).

## 5. Tests

`daemon/src/tools/__test__/run_as_policy.test.ts`, `panel/src/__test__/run_as_policy.test.ts`,
`frontend-react/src/__tests__/runAs.test.ts`. Checked live on a root daemon: `root` was refused with
`allowRoot` off, and `nobody` started and ran.
