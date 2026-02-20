#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Ошибка: не найдено '$cmd'. Установите зависимость и повторите запуск." >&2
    exit 1
  fi
}

validate_port() {
  local value="$1" name="$2"
  if [[ ! "$value" =~ ^[0-9]+$ ]] || (( value < 1 || value > 65535 )); then
    echo "Ошибка: $name должен быть числом от 1 до 65535 (сейчас: '$value')." >&2
    exit 1
  fi
}

have_whiptail=0
if command -v whiptail >/dev/null 2>&1; then
  have_whiptail=1
fi

require_cmd docker

prompt_input() {
  local title="$1" prompt="$2" default="${3:-}"
  if [[ "$have_whiptail" -eq 1 ]]; then
    whiptail --title "$title" --inputbox "$prompt" 10 78 "$default" 3>&1 1>&2 2>&3
  else
    read -r -p "$prompt [$default]: " val
    echo "${val:-$default}"
  fi
}

prompt_menu() {
  local title="$1" prompt="$2" default="$3"
  shift 3
  if [[ "$have_whiptail" -eq 1 ]]; then
    whiptail --title "$title" --menu "$prompt" 18 90 8 "$@" 3>&1 1>&2 2>&3
  else
    echo "$prompt" >&2
    local i=1
    local keys=()
    while [[ "$#" -gt 0 ]]; do
      echo "  $i) $1 - $2" >&2
      keys+=("$1")
      shift 2
      ((i++))
    done
    read -r -p "Select option (default: $default): " idx
    if [[ -z "${idx:-}" ]]; then
      echo "$default"
      return
    fi
    echo "${keys[$((idx-1))]}"
  fi
}

upsert_env_if_missing() {
  local key="$1" value="$2" file="$3"
  if ! grep -qE "^${key}=" "$file"; then
    echo "${key}=${value}" >> "$file"
  fi
}

upsert_env() {
  local key="$1" value="$2" file="$3"
  if grep -qE "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

MODE=$(prompt_menu "Stream Overlay Installer" "Выберите режим публикации" "reverse" \
  "direct" "Публиковать web напрямую наружу" \
  "edge" "Встроенный nginx-контейнер (с доменным virtual host)" \
  "reverse" "Через существующий reverse proxy (рекомендуется)" )

case "$MODE" in
  direct|edge|reverse) ;;
  *) echo "Ошибка: неизвестный режим '$MODE'" >&2; exit 1 ;;
esac

APP_HTTP_PORT=$(prompt_input "Порт приложения" "Введите внешний порт для web-сервиса" "13337")
STREAMER_API_TOKEN=$(prompt_input "Streamer token" "Введите STREAMER_API_TOKEN" "change-me-please")
validate_port "$APP_HTTP_PORT" "APP_HTTP_PORT"

APP_HTTP_BIND="127.0.0.1"
if [[ "$MODE" == "direct" ]]; then
  APP_HTTP_BIND="0.0.0.0"
fi

upsert_env "APP_HTTP_PORT" "$APP_HTTP_PORT" .env
upsert_env "APP_HTTP_BIND" "$APP_HTTP_BIND" .env
upsert_env "STREAMER_API_TOKEN" "$STREAMER_API_TOKEN" .env
upsert_env_if_missing "WEBRTC_NODE_PORT" "13777" .env
upsert_env_if_missing "MINIO_API_PORT" "9000" .env
upsert_env_if_missing "MINIO_CONSOLE_PORT" "9001" .env
upsert_env_if_missing "TURN_PORT" "3478" .env
upsert_env_if_missing "TURN_MIN_PORT" "49160" .env
upsert_env_if_missing "TURN_MAX_PORT" "49200" .env
upsert_env_if_missing "NGINX_UPSTREAM" "http://web:13337" .env

PROFILE_ARGS=()
if [[ "$MODE" == "edge" ]]; then
  NGINX_HTTP_PORT=$(prompt_input "Nginx HTTP port" "Введите внешний HTTP-порт nginx" "8080")
  NGINX_SERVER_NAME=$(prompt_input "Nginx server_name" "Введите домен для stream-overlay (server_name)" "overlay.example.com")
  validate_port "$NGINX_HTTP_PORT" "NGINX_HTTP_PORT"
  upsert_env "NGINX_HTTP_PORT" "$NGINX_HTTP_PORT" .env
  upsert_env "NGINX_SERVER_NAME" "$NGINX_SERVER_NAME" .env
  PROFILE_ARGS+=(--profile edge)
fi

if [[ "$have_whiptail" -eq 1 ]]; then
  whiptail --title "Готово" --msgbox "Запускаю сборку и старт контейнеров.\nРежим: $MODE\nПорт web: $APP_HTTP_PORT\nBind: $APP_HTTP_BIND" 12 78
else
  echo "Running docker compose in mode: $MODE"
fi

docker compose build web
docker compose "${PROFILE_ARGS[@]}" up -d

echo
if [[ "$MODE" == "edge" ]]; then
  echo "Открывайте домен, указанный в NGINX_SERVER_NAME, на порту ${NGINX_HTTP_PORT}."
  echo "Запросы на IP будут отбрасываться default_server (return 444)."
elif [[ "$MODE" == "reverse" ]]; then
  echo "Поднимите внешний nginx/caddy и проксируйте домен на 127.0.0.1:${APP_HTTP_PORT}."
else
  echo "Открывайте: http://<SERVER_IP>:${APP_HTTP_PORT}/"
fi

echo "Примеры reverse proxy + Let's Encrypt смотрите в README.md"
