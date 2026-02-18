#!/usr/bin/env bash
set -euo pipefail

# Проверка репозитория на неразрешенные маркеры merge-конфликтов.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Ищем только реальные конфликтные строки, начинающиеся с маркеров Git.
if rg -n "^(<<<<<<< |=======$|>>>>>>> )" --glob '!*.png' --glob '!*.jpg' --glob '!*.jpeg' --glob '!*.gif' --glob '!*.webm' .; then
  echo "[FAIL] Найдены неразрешенные merge-маркеры"
  exit 1
fi

echo "[OK] Merge-маркеры не найдены"
