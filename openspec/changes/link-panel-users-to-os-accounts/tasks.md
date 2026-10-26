# Tasks

## 1. Daemon: identity and validation

- [x] 1.1 Add `tools/os_account.ts`: POSIX and Windows name patterns (no numeric, no shell syntax), identity resolution (POSIX via `id`, Windows via `tools/windows_acl.ts`), the binding policy (uid 0 refused, `allowedUsers`, root needed unless own uid), allowed workspace roots (`johnnykins.runAs.handOverPaths`), and the ancestor search check (uid + primary gid); verify `cd daemon && npm test`
- [x] 1.2 Add `tools/owner_tree.ts`: the no-follow, same-device, hard-link-skipping walker with owner/mode hand-over (owner rw, folders rwx, programs u+x, no setuid/setgid, top folder without "other"), plus an owner-only variant for write boundaries; unit-test it on a real temp tree as root; verify `cd daemon && npm test`
- [x] 1.3 Add `tools/windows_acl.ts`: SID lookup through a fixed `-EncodedCommand` PowerShell script with the name in an environment variable, SID shape checks, and `icacls` grant/remove through execFile; unit-test with a mocked runner; verify `cd daemon && npm test`

## 2. Daemon: binding routes and effective identity

- [x] 2.1 Add `osAccount` to `InstanceConfig` (never set by `parameters()`), and `service/os_account_binding.ts` with `check`/`apply` (single identity, stopped-on-change, shared/nested workspace conflicts, reconcile, store only on zero failures, unbind, Windows grant/revoke); register `instance/os_account/check` and `instance/os_account/apply` in `routers/os_account_router.ts`; verify `cd daemon && npm test`
- [x] 2.2 Effective identity: `getRunAsUserParams`, Docker `User`, `{mcsm_run_as}`, `USER`/`HOME`/`LOGNAME` use the binding first and fail closed for bound instances; start-time reconcile when the top folder owner differs; reconcile after install and update tasks; verify `cd daemon && npm test`

## 3. Daemon: write boundaries and Java

- [x] 3.1 `resolveInstanceFileOwnership` uses the binding and throws for bound instances; resolve before writing and hand over after: touch, mkdir (created parents), edit, copy (tree), compress, download from URL, mod install, upload, unzip; verify `cd daemon && npm test`
- [x] 3.2 Java scope: `JavaData/accounts/<scope>/<runtime>` for bound instances (root-only staging, hand-over, rename; Windows RX grant), scoped ids, list/using/delete with instance context, start-time scope and reachability check, removal as the owning account; verify `cd daemon && npm test`

## 4. Panel

- [x] 4.1 `User.osAccount` (default ""), `user_service.setOsAccount`, the name validator, and `/auth/search` + `/auth/overview` fields; verify `cd panel && npm test`
- [x] 4.2 `service/os_account_service.ts`: affected-pair diff, serialised check → apply → persist, best-effort unbind, error aggregation; use it in `PUT /auth` (Web Admin-only `osAccount`), user deletion, and exchange purchase (delete the new instance on failure); forward `instanceId` on every Java Manager call; verify `cd panel && npm test`

## 5. React UI

- [x] 5.1 OS account field in the user editor (Web Admin only, server errors shown), linked account notice and locked "Run As" in instance settings, Java Manager scope line; language keys in all 12 files; verify `cd frontend-react && npm run type-check && npm test`

## 6. Verification and docs

- [x] 6.1 Live test on a root daemon with real accounts: bind, reconcile with executables/links/hard links, run as the account, file manager writes, install task, Java download per account, unbind; and the panel flow through the API
- [x] 6.2 Docs: new `docs/features/os-user-accounts.md`; update `run-as-user.md`, `install-guide.md`, `configuration/daemon-johnnykins.md`, CHANGELOG, SECURITY-LOG, docs index
- [x] 6.3 Run every module suite (`cd daemon && npm test`, `cd panel && npm test`, `cd frontend-react && npm test`), then a clean-archive build with the browser e2e

## Workflow follow-up

- After human review, archive the change with `/openspec-archive-change`, which syncs the `user-management`, `instance-management` and `file-management` deltas into `openspec/specs/`.
