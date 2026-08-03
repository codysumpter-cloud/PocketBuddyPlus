#!/usr/bin/env bash
set -euo pipefail

MODE="audit"
ROOT="${PRISMTEK_ROOT:-$HOME/Prismtek}"
STAMP="$(date +%Y%m%d-%H%M%S)"

usage() {
  cat <<'USAGE'
Prismtek Workspace Doctor

Usage:
  bash scripts/prismtek-workspace-doctor.sh [audit|prepare|apply]

Modes:
  audit    Read-only scan. Creates only a report and temporary files. (default)
  prepare  Creates the standard workspace folders and safety backups for risky repos.
  apply    Also creates missing canonical clones and quarantines only proven-safe duplicates.

Safety rules:
  - Never deletes repositories or assets.
  - Never moves dirty repos, linked worktrees, repos with local-only commits, or unknown remotes.
  - Purchased/source assets are reported for manual review only.
  - Every moved duplicate goes to a dated quarantine directory.
USAGE
}

if [ "$#" -gt 1 ]; then
  usage
  exit 2
fi

if [ "$#" -eq 1 ]; then
  MODE="$1"
fi

case "$MODE" in
  audit|prepare|apply) ;;
  -h|--help|help)
    usage
    exit 0
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    usage
    exit 2
    ;;
esac

REPOS_DIR="$ROOT/repos"
WORKTREES_DIR="$ROOT/worktrees"
ASSETS_DIR="$ROOT/assets-private"
INBOX_DIR="$ROOT/inbox"
BACKUPS_DIR="$ROOT/backups/workspace-doctor/$STAMP"
QUARANTINE_DIR="$ROOT/archive/quarantine-$STAMP"
REPORTS_DIR="$ROOT/reports"
REPORT="$REPORTS_DIR/workspace-doctor-$STAMP.md"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/prismtek-workspace-doctor.XXXXXX")"
REPO_ROWS="$TMP_DIR/repos.tsv"
MANUAL_ROWS="$TMP_DIR/manual-review.tsv"
MOVED_ROWS="$TMP_DIR/moved.tsv"
BACKUP_ROWS="$TMP_DIR/backups.tsv"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$REPORTS_DIR"
: > "$REPO_ROWS"
: > "$MANUAL_ROWS"
: > "$MOVED_ROWS"
: > "$BACKUP_ROWS"

if [ "$MODE" != "audit" ]; then
  mkdir -p "$REPOS_DIR" "$WORKTREES_DIR" "$ASSETS_DIR" "$INBOX_DIR" "$BACKUPS_DIR" "$ROOT/archive"
fi

normalize_remote() {
  remote="$1"
  printf '%s' "$remote" \
    | sed -E \
      -e 's#^git@github\.com:#https://github.com/#' \
      -e 's#^ssh://git@github\.com/#https://github.com/#' \
      -e 's#/$##' \
      -e 's#\.git$##' \
    | tr '[:upper:]' '[:lower:]'
}

safe_name() {
  printf '%s' "$1" | sed -E 's#[^A-Za-z0-9._-]+#_#g'
}

is_repo_dirty() {
  repo="$1"
  [ -n "$(git -C "$repo" status --porcelain --untracked-files=all 2>/dev/null || true)" ]
}

local_only_commit_count() {
  repo="$1"
  git -C "$repo" for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null \
    | while IFS= read -r branch; do
        [ -n "$branch" ] || continue
        count="$(git -C "$repo" rev-list --count "$branch" --not --remotes 2>/dev/null || echo 0)"
        printf '%s\n' "$count"
      done \
    | awk '{s += $1} END {print s + 0}'
}

linked_worktree_count() {
  repo="$1"
  git -C "$repo" worktree list --porcelain 2>/dev/null \
    | awk '$1 == "worktree" {n += 1} END {print n + 0}'
}

repo_has_git_directory() {
  repo="$1"
  [ -d "$repo/.git" ]
}

candidate_commits_exist_in_canonical() {
  candidate="$1"
  canonical="$2"
  missing=0
  while IFS= read -r sha; do
    [ -n "$sha" ] || continue
    if ! git -C "$canonical" cat-file -e "$sha^{commit}" 2>/dev/null; then
      missing=1
      break
    fi
  done <<EOF_SHAS
$(git -C "$candidate" for-each-ref --format='%(objectname)' refs/heads 2>/dev/null || true)
EOF_SHAS
  [ "$missing" -eq 0 ]
}

backup_risky_repo() {
  repo="$1"
  remote_key="$2"
  reason="$3"
  [ "$MODE" != "audit" ] || return 0

  name="$(safe_name "$(basename "$repo")")"
  fingerprint="$(printf '%s' "$repo" | shasum | awk '{print substr($1,1,10)}')"
  out="$BACKUPS_DIR/${name}-${fingerprint}"
  mkdir -p "$out"

  git -C "$repo" status --short --branch > "$out/status.txt" 2>&1 || true
  git -C "$repo" remote -v > "$out/remotes.txt" 2>&1 || true
  git -C "$repo" branch -vv --all > "$out/branches.txt" 2>&1 || true
  git -C "$repo" diff > "$out/unstaged.patch" 2>/dev/null || true
  git -C "$repo" diff --cached > "$out/staged.patch" 2>/dev/null || true
  git -C "$repo" bundle create "$out/repository.bundle" --all >/dev/null 2>&1 || true

  untracked_list="$out/untracked-files.txt"
  git -C "$repo" ls-files --others --exclude-standard > "$untracked_list" 2>/dev/null || true
  if [ -s "$untracked_list" ]; then
    (
      cd "$repo"
      tar -czf "$out/untracked-files.tar.gz" -T "$untracked_list"
    ) 2>/dev/null || true
  fi

  printf '%s\t%s\t%s\t%s\n' "$repo" "$out" "$remote_key" "$reason" >> "$BACKUP_ROWS"
}

scan_roots="$TMP_DIR/scan-roots.txt"
: > "$scan_roots"
for root in \
  "$HOME/Prismtek" \
  "$HOME/Documents" \
  "$HOME/Desktop" \
  "$HOME/Downloads" \
  "/Volumes/external"
do
  if [ -d "$root" ]; then
    printf '%s\n' "$root" >> "$scan_roots"
  fi
done

found_git="$TMP_DIR/found-git.txt"
: > "$found_git"
while IFS= read -r root; do
  find "$root" -maxdepth 10 -name .git -print 2>/dev/null || true
done < "$scan_roots" | sort -u > "$found_git"

while IFS= read -r git_entry; do
  [ -n "$git_entry" ] || continue
  repo="$(dirname "$git_entry")"
  if ! git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    continue
  fi

  remote="$(git -C "$repo" remote get-url origin 2>/dev/null || true)"
  remote_key="$(normalize_remote "$remote")"
  branch="$(git -C "$repo" branch --show-current 2>/dev/null || true)"
  head="$(git -C "$repo" rev-parse HEAD 2>/dev/null || true)"
  dirty="no"
  if is_repo_dirty "$repo"; then dirty="yes"; fi
  local_only="$(local_only_commit_count "$repo")"
  worktrees="$(linked_worktree_count "$repo")"
  git_kind="file"
  if repo_has_git_directory "$repo"; then git_kind="directory"; fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$repo" "$remote_key" "$branch" "$head" "$dirty" "$local_only" "$worktrees" "$git_kind" \
    >> "$REPO_ROWS"
done < "$found_git"

TARGETS="$TMP_DIR/targets.tsv"
cat > "$TARGETS" <<EOF_TARGETS
pocketbuddyplus	https://github.com/codysumpter-cloud/pocketbuddyplus	$REPOS_DIR/PocketBuddyPlus	https://github.com/codysumpter-cloud/PocketBuddyPlus.git
prismtek-apps	https://github.com/codysumpter-cloud/prismtek-apps	$REPOS_DIR/prismtek-apps	https://github.com/codysumpter-cloud/prismtek-apps.git
EOF_TARGETS

if [ "$MODE" = "apply" ]; then
  while IFS="$(printf '\t')" read -r target_name target_key canonical clone_url; do
    [ -n "$target_name" ] || continue
    if [ ! -d "$canonical/.git" ]; then
      echo "Creating canonical clone: $canonical"
      if ! git clone "$clone_url" "$canonical"; then
        printf '%s\t%s\n' "$canonical" "clone failed; check GitHub authentication" >> "$MANUAL_ROWS"
      fi
    else
      git -C "$canonical" fetch --prune origin >/dev/null 2>&1 || true
    fi
  done < "$TARGETS"
fi

# Back up anything risky before considering movement.
while IFS="$(printf '\t')" read -r repo remote_key branch head dirty local_only worktrees git_kind; do
  [ -n "$repo" ] || continue
  reason=""
  if [ "$dirty" = "yes" ]; then reason="dirty working tree"; fi
  if [ "$local_only" -gt 0 ]; then
    if [ -n "$reason" ]; then reason="$reason; "; fi
    reason="${reason}${local_only} local-only commit(s)"
  fi
  if [ "$worktrees" -gt 1 ]; then
    if [ -n "$reason" ]; then reason="$reason; "; fi
    reason="${reason}${worktrees} linked worktrees"
  fi
  if [ -n "$reason" ]; then
    backup_risky_repo "$repo" "$remote_key" "$reason"
    printf '%s\t%s\n' "$repo" "$reason" >> "$MANUAL_ROWS"
  fi
done < "$REPO_ROWS"

if [ "$MODE" = "apply" ]; then
  mkdir -p "$QUARANTINE_DIR"

  while IFS="$(printf '\t')" read -r target_name target_key canonical clone_url; do
    [ -d "$canonical/.git" ] || continue

    while IFS="$(printf '\t')" read -r repo remote_key branch head dirty local_only worktrees git_kind; do
      [ "$remote_key" = "$target_key" ] || continue
      [ "$repo" != "$canonical" ] || continue

      reason=""
      if [ "$dirty" != "no" ]; then reason="dirty working tree"; fi
      if [ "$local_only" -ne 0 ]; then reason="local-only commits"; fi
      if [ "$worktrees" -ne 1 ]; then reason="linked worktrees exist"; fi
      if [ "$git_kind" != "directory" ]; then reason="checkout is a linked worktree"; fi
      if ! candidate_commits_exist_in_canonical "$repo" "$canonical"; then reason="branch commit missing from canonical clone"; fi

      if [ -n "$reason" ]; then
        printf '%s\t%s\n' "$repo" "$reason" >> "$MANUAL_ROWS"
        continue
      fi

      base="$(safe_name "$(basename "$repo")")"
      fingerprint="$(printf '%s' "$repo" | shasum | awk '{print substr($1,1,10)}')"
      destination="$QUARANTINE_DIR/${base}-${fingerprint}"
      echo "Quarantining proven-safe duplicate: $repo"
      mv "$repo" "$destination"
      printf '%s\t%s\t%s\n' "$repo" "$destination" "$remote_key" >> "$MOVED_ROWS"
    done < "$REPO_ROWS"
  done < "$TARGETS"
fi

GODOT_ROWS="$TMP_DIR/godot.txt"
ASSET_ROWS="$TMP_DIR/assets.txt"
ALL_PROJECT_ROWS="$TMP_DIR/projects-and-assets.txt"
: > "$GODOT_ROWS"
: > "$ASSET_ROWS"
: > "$ALL_PROJECT_ROWS"
while IFS= read -r root; do
  find "$root" -maxdepth 11 -name project.godot -print 2>/dev/null || true
  find "$root" -maxdepth 9 -type d \( \
      -iname '*TinyHouse*' -o \
      -iname '*Tiny House*' -o \
      -iname '*Pixel*Salvaje*' -o \
      -iname '*Cozy*Isometric*' -o \
      -iname '*PAID*PACK*' \
    \) -print 2>/dev/null || true
done < "$scan_roots" | sort -u > "$ALL_PROJECT_ROWS"

grep '/project\.godot$' "$ALL_PROJECT_ROWS" > "$GODOT_ROWS" 2>/dev/null || true
grep -v '/project\.godot$' "$ALL_PROJECT_ROWS" > "$ASSET_ROWS" 2>/dev/null || true

{
  echo "# Prismtek Workspace Doctor"
  echo
  echo "- Mode: \`$MODE\`"
  echo "- Created: \`$(date)\`"
  echo "- Workspace root: \`$ROOT\`"
  echo
  echo "## Canonical target locations"
  echo
  echo "- \`$REPOS_DIR/PocketBuddyPlus\`"
  echo "- \`$REPOS_DIR/prismtek-apps\`"
  echo "- Task worktrees: \`$WORKTREES_DIR\`"
  echo "- Private assets: \`$ASSETS_DIR\`"
  echo
  echo "## Repository inventory"
  echo
  echo '| Path | Remote | Branch | Dirty | Local-only commits | Worktrees | Checkout kind |'
  echo '|---|---|---:|---:|---:|---:|---|'
  while IFS="$(printf '\t')" read -r repo remote_key branch head dirty local_only worktrees git_kind; do
    printf '| `%s` | `%s` | `%s` | %s | %s | %s | %s |\n' \
      "$repo" "${remote_key:-none}" "${branch:-detached}" "$dirty" "$local_only" "$worktrees" "$git_kind"
  done < "$REPO_ROWS"

  echo
  echo "## Safety backups created"
  echo
  if [ -s "$BACKUP_ROWS" ]; then
    while IFS="$(printf '\t')" read -r repo out remote_key reason; do
      echo "- \`$repo\` → \`$out\` — $reason"
    done < "$BACKUP_ROWS"
  else
    echo "None in this mode."
  fi

  echo
  echo "## Duplicates moved to quarantine"
  echo
  if [ -s "$MOVED_ROWS" ]; then
    while IFS="$(printf '\t')" read -r source destination remote_key; do
      echo "- \`$source\` → \`$destination\`"
    done < "$MOVED_ROWS"
  else
    echo "None."
  fi

  echo
  echo "## Manual review required"
  echo
  if [ -s "$MANUAL_ROWS" ]; then
    sort -u "$MANUAL_ROWS" | while IFS="$(printf '\t')" read -r path reason; do
      echo "- \`$path\` — $reason"
    done
  else
    echo "None identified."
  fi

  echo
  echo "## Godot projects found"
  echo
  if [ -s "$GODOT_ROWS" ]; then
    while IFS= read -r path; do echo "- \`$path\`"; done < "$GODOT_ROWS"
  else
    echo "None found in the scanned roots."
  fi

  echo
  echo "## Purchased/private asset candidates"
  echo
  echo "These are never moved automatically."
  echo
  if [ -s "$ASSET_ROWS" ]; then
    while IFS= read -r path; do echo "- \`$path\`"; done < "$ASSET_ROWS"
  else
    echo "None found by name."
  fi

  echo
  echo "## What the modes do"
  echo
  echo "- \`audit\`: report only."
  echo "- \`prepare\`: create the standard folders and back up dirty/local-only repositories."
  echo "- \`apply\`: additionally create missing canonical clones and move only clean, fully represented, non-worktree duplicates into dated quarantine."
  echo
  echo "Nothing is deleted by this tool."
} > "$REPORT"

echo
echo "Workspace Doctor complete."
echo "Report: $REPORT"
if [ "$MODE" = "apply" ]; then
  echo "Quarantine: $QUARANTINE_DIR"
fi
if command -v open >/dev/null 2>&1; then
  open -R "$REPORT" >/dev/null 2>&1 || true
fi
