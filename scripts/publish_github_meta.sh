#!/usr/bin/env bash
set -Eeuo pipefail

# Updates GitHub repo "About" metadata from .github/repository-metadata.json
# Requires: gh CLI authenticated (gh auth status)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Ошибка: команда '$1' не найдена" >&2
    exit 1
  }
}

require_cmd gh
require_cmd python3

if ! gh auth status >/dev/null 2>&1; then
  echo "Ошибка: gh не авторизован. Выполните: gh auth login" >&2
  exit 1
fi

if [[ ! -f .github/repository-metadata.json ]]; then
  echo "Ошибка: нет .github/repository-metadata.json" >&2
  exit 1
fi

REPO_SLUG="${1:-}"
if [[ -z "$REPO_SLUG" ]]; then
  REPO_SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
fi

description="$(python3 -c 'import json;print(json.load(open(".github/repository-metadata.json"))["description"])')"
homepage="$(python3 -c 'import json;print(json.load(open(".github/repository-metadata.json")).get("homepage", ""))')"
topics_csv="$(python3 -c 'import json;print(",".join(json.load(open(".github/repository-metadata.json")).get("topics", [])))')"

echo "Обновляю About для $REPO_SLUG"
gh api -X PATCH "repos/${REPO_SLUG}" \
  -f "description=${description}" \
  -f "homepage=${homepage}" >/dev/null

if [[ -n "$topics_csv" ]]; then
  args=()
  IFS=',' read -r -a topics <<< "$topics_csv"
  for t in "${topics[@]}"; do
    args+=("-f" "names[]=$t")
  done
  gh api -X PUT "repos/${REPO_SLUG}/topics" -H "Accept: application/vnd.github+json" "${args[@]}" >/dev/null
fi

echo "Готово. Проверьте вкладку About в GitHub." 
