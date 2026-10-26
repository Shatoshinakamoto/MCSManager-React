#!/bin/sh
# Installs the npm dependencies of every package and downloads the daemon's
# helper programs into daemon/lib, the Linux and macOS counterpart of
# install-dependents.bat.
#
# Helpers (same release pages as lib-urls.txt and install-dependents.bat):
#   pty_<platform>_<arch>       terminal support (MCSManager/PTY)
#   file_zip_<platform>_<arch>  zip and unzip in the file manager (MCSManager/Zip-Tools)
#   7z_<platform>_<arch>        7z archives (MCSManager/Zip-Tools), with its licence files
# The names come from Node's process.platform and process.arch, which is how
# the daemon looks them up (daemon/src/const.ts).
#
# Environment:
#   MCSM_SKIP_LIBS=1  skip the downloads (offline machines; copy daemon/lib by hand)
#
# SECURITY: downloads use HTTPS only (TLS 1.2+), fail on HTTP errors so an
# error page is never saved as a program, and land in a temporary file that
# replaces the old one only when complete. Run this as your normal account,
# never with sudo: nothing here needs root (CWE-250).
# SECURITY-WARNING: the upstream releases publish no checksums or signatures,
# so the files are trusted on the strength of HTTPS and GitHub alone.
# TODO(security): verify SHA-256 sums once upstream publishes them.

set -e

npm install
npm run preview-build

cd daemon
npm install

download() {
  # download <url> <target file>; returns non-zero without touching <target> on failure
  tmp="$2.part"
  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --silent --show-error --proto '=https' --tlsv1.2 -o "$tmp" "$1" || { rm -f "$tmp"; return 1; }
  elif command -v wget >/dev/null 2>&1; then
    wget --quiet --https-only --secure-protocol=TLSv1_2 -O "$tmp" "$1" || { rm -f "$tmp"; return 1; }
  else
    echo "Neither curl nor wget is installed; cannot download $1" >&2
    return 1
  fi
  mv -f "$tmp" "$2"
}

# fetch <name to save as> <url> [<fallback url>]
fetch() {
  echo "Downloading $1..."
  if download "$2" "lib/$1" || { [ -n "$3" ] && download "$3" "lib/$1"; }; then
    case "$1" in *.txt) chmod 644 "lib/$1" ;; *) chmod 755 "lib/$1" ;; esac
  else
    echo "WARNING: could not download $1. The daemon runs without it, but the feature it provides will not work." >&2
    MISSING="$MISSING $1"
  fi
}

MISSING=""
if [ "${MCSM_SKIP_LIBS:-0}" = "1" ]; then
  echo "MCSM_SKIP_LIBS=1: skipping the daemon helper downloads."
else
  echo "Installing lib dependencies..."
  mkdir -p lib
  SYS=$(node -p 'process.platform + "_" + process.arch')
  ZIP_TOOLS=https://github.com/MCSManager/Zip-Tools/releases/latest/download
  PTY=https://github.com/MCSManager/PTY/releases/download/latest

  fetch "pty_$SYS" "$PTY/pty_$SYS"
  # Upstream publishes the Intel macOS zip tool as "darwin_amd64"; the daemon looks for "darwin_x64".
  if [ "$SYS" = "darwin_x64" ]; then
    fetch "file_zip_$SYS" "$ZIP_TOOLS/file_zip_$SYS" "$ZIP_TOOLS/file_zip_darwin_amd64"
  else
    fetch "file_zip_$SYS" "$ZIP_TOOLS/file_zip_$SYS"
  fi
  fetch "7z_$SYS" "$ZIP_TOOLS/7z_$SYS"
  fetch "7z-unix-license.txt" "$ZIP_TOOLS/7z-unix-license.txt"
  fetch "7z-extra-license.txt" "$ZIP_TOOLS/7z-extra-license.txt"
fi

cd ../panel
npm install
cd ../frontend-react
npm install

echo "------------"
if [ -n "$MISSING" ]; then
  echo "Done, but these daemon helpers are missing:$MISSING"
  echo "Download them from the release pages in lib-urls.txt into daemon/lib/ and run chmod +x on them."
else
  echo "All done!"
fi
echo "------------"
