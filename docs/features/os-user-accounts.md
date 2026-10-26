# Link panel users to OS accounts

OpenSpec change: [`openspec/changes/link-panel-users-to-os-accounts`](../../openspec/changes/link-panel-users-to-os-accounts/)
(proposal, design decisions 1 to 7, spec deltas, tasks).

## 1. What it does

A Web Admin/Owner can link a panel user to a host OS account, for example panel user `alice_web` to the Linux
account `alice`. From then on, on every node:

- the instances assigned to that user **run as** `alice` (Linux and macOS, including Docker's container user);
- their folders, with everything inside them, **belong to** `alice`, with execute permissions kept;
- files the daemon writes for those instances (file manager, uploads, unzip, copy, download from URL, mod
  installs, install and update tasks) are handed to `alice` as well;
- the **Java Manager** keeps `alice`'s downloaded runtimes in a folder of her own, owned by her, so she can run
  them, and other accounts cannot use them.

A root daemon can therefore create an instance and give it to a non-root user without file access problems:
assigning the instance hands the whole folder over, recursively.

On **Windows** a link gives the account access only: full control of the instance folders and read/execute on
its Java runtimes, through ACLs. Instances keep running as the daemon's account (decision 7).

## 2. Rules

| Rule | Where it is enforced |
|---|---|
| Only a **Web Admin/Owner** (permission 20) can set a user's OS account, whether or not Web Admin enforcement is on. Admins see it read-only; a change they send is ignored and logged. | Panel, `panel/src/app/service/os_account_service.ts`, `routers/user_overview_router.ts` |
| The panel stores only the account **name**, never a uid or gid. Each node looks the name up itself, so the same name may have different ids on different nodes. | Panel and daemon |
| Names must be POSIX login names (`^[A-Za-z_][A-Za-z0-9_-]{0,31}$`) or Windows names (`name` or `COMPUTER\name`). Numeric ids, shell and path characters are refused. | UI, panel, daemon (`daemon/src/tools/os_account.ts`) |
| **root** (uid 0) is always refused, even with `johnnykins.runAs.allowRoot`. `johnnykins.runAs.allowedUsers` applies when set. | Daemon |
| Changing who a process runs as needs a **root daemon**. A daemon that is not root can only link its own account. | Daemon |
| All users who share an instance must resolve to **one** OS identity. Otherwise nothing is changed and the error names the accounts. | Daemon `instance/os_account/check` |
| The instance must be **stopped** before its identity changes. | Daemon |
| Every parent folder of the instance folder must let the account pass (`x` for its uid or primary group). If one does not, the link is refused and the folder is named; the daemon never changes folders outside the instance folder. | Daemon |
| Only instance folders **below** the instance data folder (`defaultInstancePath`, default `daemon/data/InstanceData`) or a `johnnykins.runAs.handOverPaths` entry are handed over. An instance whose working directory is elsewhere is accepted only when its top folder already belongs to the account; it is then not walked. | Daemon |
| Two instances whose folders overlap (one inside the other) cannot be linked to different identities. | Daemon |
| The global instance can never be linked. | Daemon |
| A link outranks the instance's **Run As** setting. Without a link, Run As and `defaultUser` work as before ([run-as-user.md](run-as-user.md)). | Daemon `tools/system_user.ts` |

## 3. How to use it

### Linux or macOS

1. Run the daemon as root, as in [install-guide.md](../install-guide.md) method A. Use a `defaultInstancePath`
   whose parent folders other accounts can pass, for example `/srv/mcsmanager/instances` with mode 755.
   If the daemon folder is closed to other accounts, also set `defaultJavaDataPath` to a passable folder such as
   `/srv/mcsmanager/java`, so linked accounts can reach their Java runtimes.
2. Create the OS accounts: `sudo useradd --system --create-home --shell /usr/sbin/nologin alice`.
3. Optional: list the accounts that may be used in `johnnykins.runAs.allowedUsers`.
4. In the panel, as a Web Admin: **Users > Actions > Configuration > OS account**, type `alice`, save. If the user
   already has instances, each node checks them, hands the folders over, then the panel saves the link.
5. Assign instances as usual (**Users > Actions > Resource Assignment**). The page says that assigning hands the
   folder over to the linked account. Large servers can take a while; the request waits up to 15 minutes.
6. Start the instance. `ps -o user,cmd` shows `alice`.

### Windows

1. Create a standard local account (not an Administrator).
2. Link it to the panel user as above (`alice` or `COMPUTER\alice`).
3. The account gets full control of the assigned instance folders and read/execute on the Java runtimes that
   are downloaded for those instances. The instance processes still run as the daemon's account.

### Unlinking and deleting

- Clearing the OS account field, removing an instance from a user, or deleting the user removes the link from the
  instance once no linked user holds it any more.
- On Linux and macOS, file owners are **left as they are** (no automatic rollback). Link the instance to the
  intended account again, or change the owners by hand.
- On Windows, the grant the daemon added is removed.
- An offline node does not block unlinking or deletion: the panel saves the change, shows a warning, and the node
  is brought in step by the next edit that touches the instance. Linking needs every affected node online.

### Buying an instance with a code (exchange)

When a user with a linked OS account buys or renews an instance with a redeem code, the new instance is handed
over before the purchase is saved. If that fails, the new instance is deleted and the purchase fails with the
reason.

## 4. What the hand-over does

The daemon walks the instance folder itself, never `chown -R`:

- every entry is opened without following links (`O_NOFOLLOW`), checked by device and inode, and changed through
  its open descriptor (`fchown`, `fchmod`), so a link swapped in during the walk cannot redirect it;
- symbolic links are skipped (their targets are never touched), other file systems are not entered, and files
  with more than one hard link are skipped and listed, because a hard link may point outside the folder;
- owner permissions: files get read and write, folders read, write and search;
- **execute permissions are kept**: a file that already had any execute bit, or that starts like a program
  (`#!`, ELF, Mach-O), becomes executable by its owner;
- setuid and setgid bits are removed;
- the instance's top folder loses all access for "other" accounts, so linked accounts cannot read each other's
  instances;
- the result is logged: `[OsAccount] Instance <id> workspace handed to "alice" (30033-30033): 6 changed, 0 already right, 2 skipped, 0 failed`.
  If any entry fails, the link is **not** saved and the error lists the entries.

The walk runs when a link or assignment changes, after install and update tasks of a linked instance, and before
a start when the top folder's owner is not the linked account. There is no pass at daemon start-up.

File manager writes for a linked instance look the account up **before** writing. If the account cannot be used
(deleted on the host, now root, not allowed), the write is refused instead of leaving root-owned files behind.

## 5. Java runtimes per account

For an instance linked to an account, the Java Manager:

- lists the shared runtimes (`JavaData/<name>`, as upstream) plus that account's own
  (`JavaData/accounts/<uid>-<gid>/<name>`, or the SID on Windows), marked with the account's name;
- downloads new runtimes into a root-only staging folder (`JavaData/.staging`), unpacks them there, hands them to
  the account and only then moves them into place, so the account can never steer the unpacking;
- keeps the folders `JavaData/accounts` and `JavaData/accounts/<scope>` owned by root with mode 711, and each
  runtime's record (`<name>.json`) owned by root with mode 600;
- refuses to select or start another account's runtime;
- checks at start that the account can reach and run the selected `java`, and says which folder blocks it;
- deletes an account's runtime with `rm -rf` running **as that account**, then removes the empty folder as root,
  so root never walks a tree the account controls.

Existing shared runtimes stay where they are. Unlinked instances keep using the shared folder.

## 6. Settings

`daemon/data/Config/global.json`, section `johnnykins.runAs` ([all keys](../configuration/daemon-johnnykins.md#johnnykinsrunas)):

| Key | Default | Meaning for links |
|---|---|---|
| `allowedUsers` | `[]` | When set, the only accounts users may be linked to (case-insensitive on Windows). |
| `handOverPaths` | `[]` | Absolute folders, besides the instance data folder, whose sub-folders may be handed to a linked account. A drive or file system root is ignored. |
| `allowRoot` | `false` | Does **not** apply: links to root are always refused. |

## 7. API

| Call | Who | Body |
|---|---|---|
| `PUT /api/auth` | Web Admin for `osAccount`; Admin for the rest | `{ "uuid": "<user>", "config": { "osAccount": "alice", "instances": [...] } }`. Returns `true`, or `{ "warnings": [...] }` when an offline node was skipped while unlinking. |
| `GET /api/auth/search`, `GET /api/auth/overview`, `GET /api/auth/` | Admin (search, overview), the user (own info) | include `osAccount` |
| Daemon `instance/os_account/check` | Panel | `{ instanceUuid, accounts: ["alice"] }`: validates only. |
| Daemon `instance/os_account/apply` | Panel | Same body: hands over and stores; `accounts: []` clears the link. |

The instance's stored link is `config.osAccount`. Instance create and update requests cannot set it; only the
two daemon routes above do.

## 8. How it is secure

- Least privilege and separation of duties (NIST AC-5, AC-6; CWE-250, CWE-269): the panel decides which panel
  user maps to which account, only a Web Admin can decide it, and every node checks the decision again (refuses
  root, applies `allowedUsers`).
- No ids or paths from the browser (OWASP ASVS V4.2, CWE-639): the panel derives the affected instances from its
  stored records; nodes resolve names themselves.
- No injection (CWE-78, CWE-88): names are checked against fixed patterns; POSIX lookups use
  `execFile("id", [..., "--", name])`; Windows lookups run a fixed PowerShell script passed with
  `-EncodedCommand`, with the name in an environment variable; `icacls` is run with `execFile`.
- No link following and no time-of-check/time-of-use gaps in the walk (CWE-59, CWE-61, CWE-367): descriptor-based
  changes, device/inode checks, hard links skipped, no `chown -R`.
- No privilege escalation through files (CWE-732, CWE-276): setuid/setgid removed; top folder closed to other
  accounts; Java records and scope folders stay root's.
- Fail closed (NIST SI-11; CWE-636): a linked instance whose account cannot be used does not start and is not
  written to; a failed hand-over or a refused node stores nothing ("Nothing was changed" / "The change was not
  saved"), and a failed change is never reported as done.
- Audit (NIST AU-2, AU-3): the user change is in the panel audit log with skipped steps in
  `os_account_warnings`; nodes log every hand-over with counts.

## 9. Limitations and known risks

- SECURITY-WARNING: a root daemon is still root. A Web Admin reaches root through the global terminal and global
  file manager, so give that role only to people who already administer the host.
- SECURITY-WARNING: linked accounts own their instance folders and can change anything in them, including start
  scripts. That is the purpose, but do not link an account you would not trust with that server.
- TODO(security): the file manager's delete and reinstall still remove files as root inside folders an account
  owns, so a symbolic link swapped in at the right moment can redirect a delete (upstream behaviour for any
  instance that runs as another account). Java runtime removal avoids this by deleting as the account.
- TODO(security): macOS has no `/proc/self/fd`, so the walk cannot work through descriptors there. The daemon only
  checks the folder (read-only) and refuses a hand-over that would have to change files; give the folder to the
  account with `chown` and link again. File manager writes on macOS still use the fork's helper, which checks the
  path and then opens only the last part without following links, so a parent folder swapped for a link at the
  right moment could redirect the owner change.
- TODO(security): Windows support is tested with a mocked process runner on Linux; it has not been run on a real
  Windows host yet. Local groups and well-known accounts are refused, but a **domain** group name is not
  recognised as a group and would be granted access like an account; link only user accounts.
- TODO(security): Docker user-namespace remapping is not detected; with `userns-remap` the container user maps to
  a different host uid than the linked account.
- Supplementary groups are ignored when checking parent folders, because Node drops them when it starts a process
  as another account.
- Moving a link to another account, or unlinking, does not change file owners back (POSIX).

## 10. Tests

- Daemon (run as root on Linux; skipped otherwise): `src/tools/__test__/owner_tree.test.ts` (modes, links, hard
  links, a link swapped in mid-path, outside folders), `src/tools/__test__/os_account.test.ts` (names, policy,
  folders, Windows with a mocked runner), `src/service/__test__/os_account_binding.test.ts` (one identity, root
  refused, stopped rule, blocked parent, overlap, hand-over, fail-closed writes, after-install hand-over, routes,
  per-account Java).
- Panel: `src/__test__/os_account_service.test.ts` (names, Web Admin only, affected instances, check → apply →
  save order, refusal stores nothing, offline unlink, deletion).
- UI: `src/__tests__/osAccount.test.ts`, `src/__tests__/runAs.test.ts`.
- Live on a root daemon with real accounts `alice` and `bob` through the panel API (27 checks): link and assign,
  owners and modes, symlink and hard link untouched, start as `alice`, file manager writes, identity change
  refused while running, mixed identities refused, Admin cannot link, relink to `bob`, unlink, delete. In the
  browser: the OS account field and its validation, the root refusal message, the assignment notice, the locked
  Run As field, and the Java Manager with a shared and an account-owned runtime of the same name (the account's
  runtime started as `alice`).
