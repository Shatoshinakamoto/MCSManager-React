# Install guide: admin and non-admin setups

How to install the panel (web) and the daemon so that each runs with no more privilege than it needs. Pick the
method that matches who you are on the machine and whether you need instances to run as different OS accounts.

> SECURITY: whatever OS account the daemon runs as, every instance without a "Run As" user runs as that
> account, and anyone who can edit an instance's start command can run anything as that account. A daemon
> running as root, Administrator or SYSTEM therefore hands root to every panel Admin unless you follow method A
> exactly (CWE-250, NIST AC-6).

## 1. Choose a method

| Method | Who installs | Daemon runs as | "Run As" per instance | Use it when |
|---|---|---|---|---|
| **B. Service account** (recommended) | An administrator, once | `mcsm`, an ordinary account | No | Most servers. Instances all run as `mcsm`. |
| **A. Root daemon with Run As** | An administrator | root | Yes, Web Admin only | Different instances must run as different OS accounts. |
| **C. Your own account** | You, no admin rights needed | Your account | No | Shared hosts, or you are not an administrator. |
| **D. Windows** | Admin or standard user | A standard account | No (not supported on Windows) | Windows hosts. |
| Docker | An administrator | Container user | Container user only | See [Docker](#6-docker). |

The panel (web) never needs admin rights in any method. Its default port 23333 and the daemon's 24444 are above
1024, so no special privilege is needed to bind them.

## 2. Get the files

1. Build from this repository with `./build.sh` (Linux/macOS) or `build.bat` (Windows), see
   [build-production.md](build-production.md). The output is in `production-code/`:
   `web/` (panel) and `daemon/`.
2. Download the daemon's helper binaries: `wget --input-file=lib-urls.txt --directory-prefix=production-code/daemon/lib/`
   then `chmod a+x production-code/daemon/lib/*`.
3. Install Node.js 22 LTS from your distribution or nodejs.org.

Keep `app.js`, `app.js.map`, `app-hash.txt` and `app_map-hash.txt` together: the tamper check refuses to start
when they do not match.

## 3. Method B: service account (recommended)

Run as an administrator once; after that nothing runs as root.

```sh
# 1. An ordinary system account with no login shell and no sudo rights.
sudo useradd --system --create-home --home-dir /opt/mcsmanager --shell /usr/sbin/nologin mcsm

# 2. Install the files and hand them to that account.
sudo cp -r production-code/web production-code/daemon /opt/mcsmanager/
sudo chown -R mcsm:mcsm /opt/mcsmanager
sudo chmod 750 /opt/mcsmanager

# 3. Services (templates in prod-scripts/linux/systemd/).
sudo cp prod-scripts/linux/systemd/mcsm-daemon.service prod-scripts/linux/systemd/mcsm-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mcsm-daemon mcsm-web
```

Open `http://<host>:23333`, create the first account (it becomes the Web Admin/Owner) and the panel connects to
the local daemon by itself.

Do **not**:
- add `mcsm` to `sudo`, `wheel`, `admin` or `docker` (the `docker` group is root-equivalent, see section 6);
- run `sudo node app.js` "just once" to fix a problem: files it creates become root-owned and the service can
  no longer read them. Fix ownership with `sudo chown -R mcsm:mcsm /opt/mcsmanager` instead.

"Run As" is locked in the instance settings in this method, because the daemon cannot switch accounts.

## 4. Method A: root daemon with "Run As"

Only for hosts where instances must run as different OS accounts. The panel still runs as `mcsm` (method B,
steps 1 and 2, plus `mcsm-web.service`).

```sh
# 1. One ordinary account per group of instances, with no login shell.
sudo useradd --system --create-home --shell /usr/sbin/nologin mcsm-games

# 2. A folder for instances that those accounts can reach (parents need o+x).
sudo mkdir -p /srv/mcsmanager/instances
sudo chmod 755 /srv/mcsmanager /srv/mcsmanager/instances

# 3. Daemon files owned by root, data private to root.
sudo cp -r production-code/daemon /opt/mcsmanager/daemon
sudo chown -R root:root /opt/mcsmanager/daemon
```

Start the daemon once so it writes `/opt/mcsmanager/daemon/data/Config/global.json`, stop it, and set:

```json
{
  "defaultInstancePath": "/srv/mcsmanager/instances",
  "johnnykins": {
    "runAs": {
      "defaultUser": "mcsm-games",
      "allowedUsers": ["mcsm-games"],
      "allowRoot": false
    }
  }
}
```

(Edit only those keys; keep the rest of the file.) Then install the service:

```sh
sudo cp prod-scripts/linux/systemd/mcsm-daemon-root.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now mcsm-daemon-root
```

The panel cannot read a root daemon's key file, so add the daemon by hand: **Daemons > Add**, address
`localhost`, port `24444`, key from `global.json` (`key`).

What each setting does (details in [features/run-as-user.md](features/run-as-user.md)):
- `defaultUser`: instances with an empty "Run As" run as this account, never as root. The daemon logs a warning
  at startup while it runs as root and this is empty.
- `allowedUsers`: the only accounts "Run As" may name. The instance settings show them as a list.
- `allowRoot: false`: an instance can never be set to run as root.
- Only a panel **Web Admin/Owner** can set or change "Run As". Admins and users cannot, and market templates
  cannot carry one.
- Each instance folder must belong to its account. After creating an instance:
  `sudo chown -R mcsm-games: /srv/mcsmanager/instances/<instance-id>`. The console prints this command if the
  account cannot open the folder.

Instead of `chown` by hand, a Web Admin can **link panel users to OS accounts** (**Users > Configuration > OS
account**). Assigning an instance to a linked user then hands its folder over to that account, recursively and
with execute permissions kept, runs the instance as that account, and gives the account its own Java runtimes.
Keep the instance folder's parents passable (`chmod 755`, as in step 2), and if `/opt/mcsmanager/daemon` is closed
to other accounts set `"defaultJavaDataPath": "/srv/mcsmanager/java"` (mode 755) so they can reach their runtimes.
Details: [features/os-user-accounts.md](features/os-user-accounts.md).

> SECURITY-WARNING: on a root daemon, a Web Admin can still reach root through the global terminal and the
> global file manager. Give the Web Admin/Owner role only to people who already have root on this host.

## 5. Method C: your own account, no admin rights

```sh
mkdir -p ~/mcsmanager && cp -r production-code/web production-code/daemon ~/mcsmanager/
chmod 700 ~/mcsmanager

# Run in the foreground to try it:
(cd ~/mcsmanager/daemon && node app.js) &
(cd ~/mcsmanager/web && node app.js)
```

To start it as a service of your own account:

```sh
mkdir -p ~/.config/systemd/user
cp prod-scripts/linux/systemd/mcsm-user-daemon.service prod-scripts/linux/systemd/mcsm-user-web.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now mcsm-user-daemon mcsm-user-web
```

User services stop when you log out unless an administrator runs `sudo loginctl enable-linger <you>` once. On a
host without systemd, use `crontab -e` with `@reboot cd ~/mcsmanager/daemon && node app.js` (and the same for
`web`).

Everything runs as you: instances can read and change anything your account can, so do not use an account that
holds other important data, SSH keys for other systems, or sudo rights.

## 6. Docker

- Docker instances (`processType: docker`) need access to the Docker socket. Membership of the `docker` group, or
  mounting `/var/run/docker.sock`, gives root on the host. For a non-root daemon (methods B and C) use
  **rootless Docker** and set `DOCKER_HOST=unix:///run/user/<uid>/docker.sock` for the daemon, or turn Docker off
  on that daemon with `johnnykins.instanceMasterConfig.docker: false`.
- For Docker instances, "Run As" sets the container user (`--user`), not a host account. It does not need a root
  daemon and is still limited to Web Admins.
- Running the panel and daemon themselves in containers: see `example.docker-compose.yml`. The daemon container
  mounts the Docker socket, which is root-equivalent; treat that host as administered by the panel's Web Admins.

## 7. Method D: Windows

- Create a **standard** local account (not an Administrator) for MCSManager, for example `mcsm`.
- Copy `production-code` to a folder that account owns, such as `C:\MCSManager`, and remove other users' write
  access to it (Properties > Security).
- Start it with `prod-scripts\windows\start.bat`, or with Task Scheduler: action `node app.js` in the `daemon`
  and `web` folders, "Run whether user is logged on or not", **without** "Run with highest privileges".
- Do not install it as a service running as `LocalSystem`; that account is more powerful than an Administrator.
- An administrator may need to allow ports 23333 and 24444 in Windows Defender Firewall once.
- "Run As" is not available on Windows; the field is locked in the instance settings.
- Panel users can still be linked to Windows accounts: the account gets full control of its instance folders and
  read/execute on its Java runtimes through ACLs, while instances keep running as the daemon's account
  ([features/os-user-accounts.md](features/os-user-accounts.md)).

## 8. Panel roles and OS accounts

| Panel role | What it can do with OS accounts |
|---|---|
| User | Runs instances assigned to them, as whatever account the instance is set to. Cannot change start commands unless `allowChangeCmd` is on. |
| Admin | Creates and edits instances, so can run commands as the daemon's account or `defaultUser`. Cannot set "Run As". |
| Web Admin/Owner | Everything above, plus "Run As", linking users to OS accounts, daemon settings, the global terminal and file manager. |

Turn on **Settings > Additional Security > Enforce Web Admin role** after giving yourself the Web Admin role, so
that plain Admins cannot reach the panel-wide pages ([configuration/panel-additional-security.md](configuration/panel-additional-security.md)).

## 9. Check your setup

- `ps -o user,cmd -C node` shows `mcsm` (methods B, C) or `root` only for the daemon in method A.
- The daemon log has no `[RunAs] This daemon runs as root and johnnykins.runAs.defaultUser is empty` warning.
- In the instance settings, "Run As" is locked unless you use method A and are logged in as a Web Admin.
- `ls -ld /opt/mcsmanager/daemon/data/Config/global.json` is readable by the daemon's account only.
