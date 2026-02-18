#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_files=(
  README.md
  Dockerfile
  docker-compose.yml
  .env.example
  .dockerignore
  main.py
  requirements.txt
  infra/nginx.conf
  scripts/install.sh
  scripts/check_merge_conflicts.sh
  scripts/publish_github_meta.sh
  systemd/stream-overlay.service
  templates/mod_panel.html
  templates/overlay.html
  static/mod_panel.js
  static/overlay.js
)

echo "[1/3] Проверка наличия ключевых файлов"
for f in "${required_files[@]}"; do
  [[ -f "$f" ]] || { echo "Отсутствует: $f" >&2; exit 1; }
done

echo "[2/3] Проверка git tracking"
for f in "${required_files[@]}" uploads/.gitkeep; do
  git ls-files --error-unmatch "$f" >/dev/null 2>&1 || { echo "Не отслеживается git: $f" >&2; exit 1; }
done

echo "[3/3] Проверка, что shell scripts не игнорируются"
for f in scripts/*.sh; do
  if git check-ignore "$f" >/dev/null 2>&1; then
    echo "Скрипт игнорируется, а не должен: $f" >&2
    exit 1
  fi
done

echo "[OK] Repo production-ready checks passed"
