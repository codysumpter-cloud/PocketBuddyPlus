#!/usr/bin/env bash
set -euo pipefail

SCRIPT="${1:-scripts/prismtek-workspace-doctor.sh}"
SCRIPT="$(cd "$(dirname "$SCRIPT")" && pwd)/$(basename "$SCRIPT")"
SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/workspace-doctor-test.XXXXXX")"
trap 'rm -rf "$SANDBOX"' EXIT

TEST_HOME="$SANDBOX/home"
REMOTES="$SANDBOX/remotes"
mkdir -p "$TEST_HOME/Documents" "$TEST_HOME/Desktop" "$TEST_HOME/Downloads" "$REMOTES"

git config --global --add safe.directory '*' >/dev/null 2>&1 || true

seed_remote() {
  name="$1"
  bare="$REMOTES/$name.git"
  work="$SANDBOX/seed-$name"
  git init --bare "$bare" >/dev/null
  git init "$work" >/dev/null
  git -C "$work" config user.name "Workspace Doctor Test"
  git -C "$work" config user.email "workspace-doctor@example.test"
  printf '%s\n' "$name" > "$work/README.md"
  git -C "$work" add README.md
  git -C "$work" commit -m "seed $name" >/dev/null
  git -C "$work" branch -M main
  git -C "$work" remote add origin "$bare"
  git -C "$work" push -u origin main >/dev/null
  git --git-dir="$bare" symbolic-ref HEAD refs/heads/main
}

seed_remote "PocketBuddyPlus"
seed_remote "prismtek-apps"

# One clean duplicate should be quarantined after a canonical clone is created.
git clone "$REMOTES/PocketBuddyPlus.git" "$TEST_HOME/Documents/PocketBuddyPlus-old" >/dev/null

# One dirty duplicate must be backed up and left in place.
git clone "$REMOTES/prismtek-apps.git" "$TEST_HOME/Desktop/prismtek-apps-working" >/dev/null
printf 'uncommitted work\n' > "$TEST_HOME/Desktop/prismtek-apps-working/UNTRACKED.txt"

run_doctor() {
  mode="$1"
  HOME="$TEST_HOME" \
  PRISMTEK_ROOT="$TEST_HOME/Prismtek" \
  PRISMTEK_POCKETBUDDYPLUS_REMOTE="$REMOTES/PocketBuddyPlus.git" \
  PRISMTEK_APPS_REMOTE="$REMOTES/prismtek-apps.git" \
  bash "$SCRIPT" "$mode"
}

bash -n "$SCRIPT"
run_doctor audit >/dev/null
AUDIT_REPORT="$(find "$TEST_HOME/Prismtek/reports" -name 'workspace-doctor-*.md' -print | sort | tail -1)"
[ -f "$AUDIT_REPORT" ]
grep -F "$TEST_HOME/Documents/PocketBuddyPlus-old" "$AUDIT_REPORT" >/dev/null
grep -F "$TEST_HOME/Desktop/prismtek-apps-working" "$AUDIT_REPORT" >/dev/null
grep -F 'dirty working tree' "$AUDIT_REPORT" >/dev/null

sleep 1
run_doctor apply >/dev/null

[ -d "$TEST_HOME/Prismtek/repos/PocketBuddyPlus/.git" ]
[ -d "$TEST_HOME/Prismtek/repos/prismtek-apps/.git" ]
[ ! -e "$TEST_HOME/Documents/PocketBuddyPlus-old" ]
find "$TEST_HOME/Prismtek/archive" -type d -name 'PocketBuddyPlus-old-*' -print -quit | grep . >/dev/null
[ -d "$TEST_HOME/Desktop/prismtek-apps-working/.git" ]
[ -f "$TEST_HOME/Desktop/prismtek-apps-working/UNTRACKED.txt" ]
find "$TEST_HOME/Prismtek/backups/workspace-doctor" -name 'repository.bundle' -print -quit | grep . >/dev/null
find "$TEST_HOME/Prismtek/backups/workspace-doctor" -name 'untracked-files.tar.gz' -print -quit | grep . >/dev/null

APPLY_REPORT="$(find "$TEST_HOME/Prismtek/reports" -name 'workspace-doctor-*.md' -print | sort | tail -1)"
grep -F 'Duplicates moved to quarantine' "$APPLY_REPORT" >/dev/null
grep -F "$TEST_HOME/Desktop/prismtek-apps-working" "$APPLY_REPORT" >/dev/null
grep -F 'Nothing is deleted by this tool.' "$APPLY_REPORT" >/dev/null

echo "Workspace Doctor integration test passed."
