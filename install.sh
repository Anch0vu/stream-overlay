#!/usr/bin/env bash
# ============================================================
#  TOON-dok • OnionRP Streaming Tool — Управление / Installer
#  Совместимость: Ubuntu 22.04 / 24.04, Debian 12+
# ============================================================
set -euo pipefail

# ── Цвета ────────────────────────────────────────────────────
RED='\033[0;31m';  BRED='\033[1;31m'
GRN='\033[0;32m';  BGRN='\033[1;32m'
YLW='\033[0;33m';  BYLW='\033[1;33m'
BLU='\033[0;34m';  BBLU='\033[1;34m'
CYN='\033[0;36m';  BCYN='\033[1;36m'
MGN='\033[0;35m';  BMGN='\033[1;35m'
WHT='\033[1;37m';  DIM='\033[2m'
RESET='\033[0m'

# ── Утилиты вывода ───────────────────────────────────────────
info()    { echo -e "${BLU}  ℹ${RESET}  $*"; }
ok()      { echo -e "${BGRN}  ✓${RESET}  $*"; }
warn()    { echo -e "${BYLW}  ⚠${RESET}  $*"; }
err()     { echo -e "${BRED}  ✗${RESET}  $*" >&2; }
die()     { err "$*"; exit 1; }
hr()      { echo -e "${DIM}$(printf '─%.0s' {1..60})${RESET}"; }
blank()   { echo ""; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
ENV_EXAMPLE="${SCRIPT_DIR}/.env.example"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"

# ────────────────────────────────────────────────────────────
banner() {
  clear
  echo -e "${BMGN}"
  cat << 'EOF'
  ████████╗ ██████╗  ██████╗ ███╗   ██╗      ██████╗  ██████╗ ██╗  ██╗
     ██╔══╝██╔═══██╗██╔═══██╗████╗  ██║      ██╔══██╗██╔═══██╗██║ ██╔╝
     ██║   ██║   ██║██║   ██║██╔██╗ ██║█████╗██║  ██║██║   ██║█████╔╝
     ██║   ██║   ██║██║   ██║██║╚██╗██║╚════╝██║  ██║██║   ██║██╔═██╗
     ██║   ╚██████╔╝╚██████╔╝██║ ╚████║      ██████╔╝╚██████╔╝██║  ██╗
     ╚═╝    ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝      ╚═════╝  ╚═════╝ ╚═╝  ╚═╝
EOF
  echo -e "${RESET}"
  echo -e "  ${BCYN}OnionRP Streaming Tool${RESET}  ${DIM}WebRTC · mediasoup SFU · OBS Overlay${RESET}"
  echo -e "  ${DIM}https://github.com/Anch0vu/stream-overlay${RESET}"
  blank
  hr
  blank
}

# ────────────────────────────────────────────────────────────
# Проверка зависимостей
# ────────────────────────────────────────────────────────────
check_deps() {
  local missing=()
  for cmd in docker curl openssl; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done

  # docker compose v2 (плагин) или docker-compose v1
  if ! docker compose version &>/dev/null 2>&1 && \
     ! command -v docker-compose &>/dev/null; then
    missing+=("docker-compose")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    err "Не найдены: ${missing[*]}"
    info "Установить Docker: https://docs.docker.com/engine/install/ubuntu/"
    return 1
  fi
  return 0
}

compose() {
  if docker compose version &>/dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" "$@"
  else
    docker-compose -f "$COMPOSE_FILE" "$@"
  fi
}

# ────────────────────────────────────────────────────────────
# Генерация случайного пароля
# ────────────────────────────────────────────────────────────
gen_pass() {
  local len=${1:-32}
  openssl rand -base64 48 | tr -dc 'a-zA-Z0-9!@#%^&*_-' | head -c "$len"
}

gen_secret() {
  openssl rand -hex 32
}

# ────────────────────────────────────────────────────────────
# Определить публичный IP
# ────────────────────────────────────────────────────────────
detect_public_ip() {
  local ip=""
  ip=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null) || \
  ip=$(curl -s --max-time 5 https://ifconfig.me 2>/dev/null) || \
  ip=$(curl -s --max-time 5 https://ipecho.net/plain 2>/dev/null) || true
  echo "${ip:-}"
}

# ────────────────────────────────────────────────────────────
# Чтение значения из .env
# ────────────────────────────────────────────────────────────
env_get() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || { echo ""; return; }
  grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'
}

# Запись / обновление значения в .env
env_set() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

# ────────────────────────────────────────────────────────────
# Интерактивный ввод с подсказкой
# read_val PROMPT DEFAULT VARNAME
# ────────────────────────────────────────────────────────────
read_val() {
  local prompt="$1" default="$2"
  local hint=""
  [[ -n "$default" ]] && hint=" ${DIM}[${default}]${RESET}"
  echo -ne "  ${WHT}${prompt}${hint}: ${RESET}"
  read -r val
  echo "${val:-$default}"
}

read_pass() {
  local prompt="$1" default="$2"
  local hint=""
  [[ -n "$default" ]] && hint=" ${DIM}[оставить текущий]${RESET}"
  echo -ne "  ${WHT}${prompt}${hint}: ${RESET}"
  read -rs val
  echo ""
  echo "${val:-$default}"
}

# ────────────────────────────────────────────────────────────
# Мастер конфигурации
# ────────────────────────────────────────────────────────────
run_wizard() {
  banner
  echo -e "  ${BCYN}⚙  Мастер первоначальной настройки${RESET}"
  blank
  info "Определяем публичный IP..."
  local auto_ip
  auto_ip=$(detect_public_ip)
  [[ -n "$auto_ip" ]] && ok "Обнаружен IP: ${BYLW}${auto_ip}${RESET}" || warn "Не удалось определить IP автоматически"
  blank

  # Создать .env из примера если нет
  [[ -f "$ENV_FILE" ]] || cp "$ENV_EXAMPLE" "$ENV_FILE"

  echo -e "  ${BBLU}━━  Сеть  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  local pub_ip web_port cors_origin
  pub_ip=$(read_val   "Публичный IP сервера"          "${auto_ip:-YOUR_PUBLIC_IP}")
  web_port=$(read_val "Внешний порт веб-панели"       "$(env_get WEB_PORT || echo 13777)")
  cors_origin=$(read_val "CORS Origin (протокол+хост:порт)" "http://${pub_ip}:${web_port}")
  blank

  echo -e "  ${BBLU}━━  Пароли  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  info "Пустой ввод = автогенерация нового пароля"
  local redis_pw jwt_secret streamer_pw turn_pw
  redis_pw=$(read_pass   "Redis password"          "$(env_get REDIS_PASSWORD)")
  [[ -z "$redis_pw" ]] && redis_pw=$(gen_pass 24) && info "Redis: ${DIM}${redis_pw}${RESET}"
  jwt_secret=$(read_pass "JWT secret (≥32 символа)" "$(env_get JWT_SECRET)")
  [[ -z "$jwt_secret" ]] && jwt_secret=$(gen_secret) && info "JWT:   ${DIM}${jwt_secret}${RESET}"
  streamer_pw=$(read_pass "Пароль стримера"         "$(env_get STREAMER_PASSWORD)")
  [[ -z "$streamer_pw" ]] && streamer_pw=$(gen_pass 20) && info "Strmr: ${DIM}${streamer_pw}${RESET}"
  turn_pw=$(read_pass    "TURN пароль"              "$(env_get TURN_SERVER_PASSWORD)")
  [[ -z "$turn_pw" ]] && turn_pw=$(gen_pass 20) && info "TURN:  ${DIM}${turn_pw}${RESET}"
  blank

  echo -e "  ${BBLU}━━  mediasoup / WebRTC  ━━━━━━━━━━━━━━━━━━━${RESET}"
  local min_port max_port
  min_port=$(read_val "UDP мин. порт" "$(env_get MEDIASOUP_MIN_PORT || echo 40000)")
  max_port=$(read_val "UDP макс. порт" "$(env_get MEDIASOUP_MAX_PORT || echo 49999)")
  blank

  echo -e "  ${BBLU}━━  TURN / coturn  ━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  local turn_user turn_realm
  turn_user=$(read_val  "TURN username"  "$(env_get TURN_SERVER_USERNAME || echo onionrp)")
  turn_realm=$(read_val "TURN realm"     "onionrp.local")
  blank

  # Запись в .env
  env_set NODE_ENV               production
  env_set HOST                   0.0.0.0
  env_set SERVER_PORT            3001
  env_set WEB_PORT               "$web_port"
  env_set MEDIASOUP_LISTEN_IP    0.0.0.0
  env_set MEDIASOUP_ANNOUNCED_IP "$pub_ip"
  env_set MEDIASOUP_MIN_PORT     "$min_port"
  env_set MEDIASOUP_MAX_PORT     "$max_port"
  env_set MEDIASOUP_LOG_LEVEL    warn
  env_set REDIS_HOST             redis
  env_set REDIS_PORT             6379
  env_set REDIS_PASSWORD         "$redis_pw"
  env_set JWT_SECRET             "$jwt_secret"
  env_set JWT_EXPIRES_IN         24h
  env_set STREAMER_PASSWORD      "$streamer_pw"
  env_set MODERATOR_KEY_TTL      600
  env_set TURN_SERVER_URL        "turn:${pub_ip}:3478"
  env_set TURN_SERVER_USERNAME   "$turn_user"
  env_set TURN_SERVER_PASSWORD   "$turn_pw"
  env_set CORS_ORIGIN            "$cors_origin"
  env_set RATE_LIMIT_WINDOW_MS   60000
  env_set RATE_LIMIT_MAX_REQUESTS 100

  # Обновить coturn конфиг
  local coturn_conf="${SCRIPT_DIR}/coturn/turnserver.conf"
  if [[ -f "$coturn_conf" ]]; then
    sed -i "s|^external-ip=.*|external-ip=${pub_ip}|" "$coturn_conf"
    sed -i "s|^user=.*|user=${turn_user}:${turn_pw}|" "$coturn_conf"
    sed -i "s|^realm=.*|realm=${turn_realm}|" "$coturn_conf"
    ok "coturn/turnserver.conf обновлён"
  fi

  blank
  ok "${BGRN}.env успешно создан${RESET}"
  blank

  local do_build
  echo -ne "  ${WHT}Собрать и запустить контейнеры сейчас? ${DIM}[y/N]${RESET}: "
  read -r do_build
  if [[ "$do_build" =~ ^[Yy]$ ]]; then
    build_and_start
  fi
}

# ────────────────────────────────────────────────────────────
# Сборка и запуск
# ────────────────────────────────────────────────────────────
build_and_start() {
  banner
  info "Сборка контейнеров (BuildKit)..."
  DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 \
    compose build --progress=plain 2>&1 | tail -30
  blank
  info "Запуск сервисов..."
  compose up -d
  blank
  show_status
}

# ────────────────────────────────────────────────────────────
# Статус сервисов
# ────────────────────────────────────────────────────────────
show_status() {
  banner
  echo -e "  ${BCYN}  Статус сервисов${RESET}"
  blank
  compose ps 2>/dev/null || { err "Docker Compose недоступен"; return 1; }
  blank

  local port
  port=$(env_get WEB_PORT)
  port="${port:-13777}"
  local pub_ip
  pub_ip=$(env_get MEDIASOUP_ANNOUNCED_IP)

  hr
  blank
  echo -e "  ${WHT}Ссылки:${RESET}"
  echo -e "  ${BBLU}🌐  Dock-панель   ${BCYN}http://${pub_ip:-localhost}:${port}${RESET}"
  echo -e "  ${BBLU}🔍  API health    ${BCYN}http://${pub_ip:-localhost}:${port}/api/health${RESET}"
  echo -e "  ${BBLU}📺  OBS overlay   ${BCYN}http://${pub_ip:-localhost}:${port}/obs${RESET}"
  blank
}

# ────────────────────────────────────────────────────────────
# Просмотр логов
# ────────────────────────────────────────────────────────────
show_logs_menu() {
  banner
  echo -e "  ${BCYN}  Просмотр логов${RESET}"
  blank
  echo -e "  ${WHT}1${RESET}  webrtc-node (сигнальный сервер)"
  echo -e "  ${WHT}2${RESET}  nginx"
  echo -e "  ${WHT}3${RESET}  redis"
  echo -e "  ${WHT}4${RESET}  coturn"
  echo -e "  ${WHT}5${RESET}  все сервисы"
  echo -e "  ${WHT}0${RESET}  назад"
  blank
  echo -ne "  ${WHT}Выбор${RESET}: "
  read -r choice
  case "$choice" in
    1) compose logs -f --tail=100 webrtc-node ;;
    2) compose logs -f --tail=100 nginx ;;
    3) compose logs -f --tail=100 redis ;;
    4) compose logs -f --tail=100 coturn ;;
    5) compose logs -f --tail=50 ;;
    *) return ;;
  esac
}

# ────────────────────────────────────────────────────────────
# Генерация ключа модератора
# ────────────────────────────────────────────────────────────
gen_mod_key() {
  banner
  echo -e "  ${BCYN}  Генерация ключа модератора${RESET}"
  blank

  local port
  port=$(env_get WEB_PORT); port="${port:-13777}"
  local pub_ip
  pub_ip=$(env_get MEDIASOUP_ANNOUNCED_IP); pub_ip="${pub_ip:-localhost}"
  local streamer_pw
  streamer_pw=$(env_get STREAMER_PASSWORD)

  if [[ -z "$streamer_pw" ]]; then
    streamer_pw=$(read_pass "Пароль стримера" "")
  fi

  info "Авторизация как стример..."
  local token_resp
  token_resp=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "{\"password\":\"${streamer_pw}\"}" \
    "http://${pub_ip}:${port}/api/auth/login" 2>/dev/null) || \
    { err "Не удалось подключиться к серверу. Сервисы запущены?"; blank; pause; return; }

  local token
  token=$(echo "$token_resp" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 2>/dev/null) || true

  if [[ -z "$token" ]]; then
    err "Ошибка авторизации. Проверьте пароль стримера."
    echo "  Ответ: ${DIM}${token_resp}${RESET}"
    blank; pause; return
  fi
  ok "Авторизован"

  info "Генерация ключа..."
  local key_resp key
  key_resp=$(curl -s -X POST \
    -H "Authorization: Bearer ${token}" \
    "http://${pub_ip}:${port}/api/auth/moderator-key" 2>/dev/null) || true
  key=$(echo "$key_resp" | grep -o '"key":"[^"]*"' | cut -d'"' -f4 2>/dev/null) || true

  if [[ -z "$key" ]]; then
    err "Не удалось получить ключ."
    echo "  Ответ: ${DIM}${key_resp}${RESET}"
    blank; pause; return
  fi

  blank
  echo -e "  ${BGRN}  Ключ модератора:${RESET}"
  blank
  echo -e "  ${BYLW}  ┌──────────────────────────────────────────┐${RESET}"
  echo -e "  ${BYLW}  │  ${BCYN}${key}${BYLW}  │${RESET}"
  echo -e "  ${BYLW}  └──────────────────────────────────────────┘${RESET}"
  blank
  local ttl
  ttl=$(env_get MODERATOR_KEY_TTL); ttl="${ttl:-600}"
  info "Ключ действителен ${ttl} секунд ($(( ttl / 60 )) мин)"
  blank
  pause
}

# ────────────────────────────────────────────────────────────
# Обновление (git pull + rebuild)
# ────────────────────────────────────────────────────────────
do_update() {
  banner
  echo -e "  ${BCYN}  Обновление${RESET}"
  blank

  if ! command -v git &>/dev/null; then
    warn "git не найден. Обновление вручную: скачайте новую версию в ${SCRIPT_DIR}"
    pause; return
  fi

  info "Остановка сервисов..."
  compose stop

  info "Получение обновлений..."
  git -C "$SCRIPT_DIR" pull --ff-only || {
    warn "git pull завершился с ошибкой. Обновите вручную."
    compose start; pause; return
  }

  build_and_start
  blank
  ok "Обновление завершено"
  pause
}

# ────────────────────────────────────────────────────────────
# Создание резервной копии .env + volumes metadata
# ────────────────────────────────────────────────────────────
do_backup() {
  banner
  echo -e "  ${BCYN}  Резервное копирование${RESET}"
  blank

  local backup_dir="${SCRIPT_DIR}/backups"
  mkdir -p "$backup_dir"
  local ts
  ts=$(date +%Y%m%d_%H%M%S)
  local backup_file="${backup_dir}/backup_${ts}.tar.gz"

  info "Создание архива..."
  tar -czf "$backup_file" \
    -C "$SCRIPT_DIR" \
    .env \
    coturn/turnserver.conf \
    2>/dev/null || true

  ok "Сохранено: ${BYLW}${backup_file}${RESET}"
  blank
  info "Для резервного копирования данных Redis:"
  echo -e "  ${DIM}docker compose exec redis redis-cli -a \"\$REDIS_PASSWORD\" BGSAVE${RESET}"
  blank
  pause
}

# ────────────────────────────────────────────────────────────
# Деинсталляция
# ────────────────────────────────────────────────────────────
do_uninstall() {
  banner
  echo -e "  ${BRED}  Деинсталляция${RESET}"
  blank
  warn "Это остановит и удалит все контейнеры и Docker volumes!"
  warn "Файлы проекта (${SCRIPT_DIR}) НЕ будут удалены."
  blank
  echo -ne "  ${BRED}Введите ${WHT}YES${BRED} для подтверждения${RESET}: "
  read -r confirm
  [[ "$confirm" == "YES" ]] || { info "Отменено"; pause; return; }

  compose down -v --remove-orphans 2>/dev/null || true
  blank
  ok "Контейнеры и volumes удалены"
  blank
  pause
}

# ────────────────────────────────────────────────────────────
# Открыть .env в редакторе
# ────────────────────────────────────────────────────────────
edit_env() {
  [[ -f "$ENV_FILE" ]] || { err ".env не найден. Запустите мастер настройки (п.1)"; pause; return; }
  local editor="${EDITOR:-nano}"
  command -v "$editor" &>/dev/null || editor=vi
  "$editor" "$ENV_FILE"
}

# ────────────────────────────────────────────────────────────
# Показать текущие настройки
# ────────────────────────────────────────────────────────────
show_config() {
  banner
  echo -e "  ${BCYN}  Текущая конфигурация${RESET}"
  blank
  if [[ ! -f "$ENV_FILE" ]]; then
    warn ".env не найден"
    pause; return
  fi

  local pub_ip web_port server_port cors
  pub_ip=$(env_get MEDIASOUP_ANNOUNCED_IP)
  web_port=$(env_get WEB_PORT)
  server_port=$(env_get SERVER_PORT)
  cors=$(env_get CORS_ORIGIN)

  _cfg_row() { printf "  ${DIM}%-28s${RESET}  ${BCYN}%s${RESET}\n" "$1" "$2"; }
  _cfg_row "Публичный IP"       "${pub_ip}"
  _cfg_row "Порт веб-панели"    "${web_port}"
  _cfg_row "Порт сигн. сервера" "${server_port}"
  _cfg_row "CORS Origin"        "${cors}"
  _cfg_row "UDP диапазон"       "$(env_get MEDIASOUP_MIN_PORT)–$(env_get MEDIASOUP_MAX_PORT)"
  _cfg_row "TURN URL"           "$(env_get TURN_SERVER_URL)"
  _cfg_row "Redis host:port"    "$(env_get REDIS_HOST):$(env_get REDIS_PORT)"
  _cfg_row "Node ENV"           "$(env_get NODE_ENV)"
  blank

  hr
  blank
  echo -e "  ${DIM}Конфиг-файл: ${ENV_FILE}${RESET}"
  blank
  pause
}

# ────────────────────────────────────────────────────────────
pause() { echo -ne "  ${DIM}[ Нажмите Enter для продолжения ]${RESET}"; read -r; }

# ────────────────────────────────────────────────────────────
# Меню управления сервисами
# ────────────────────────────────────────────────────────────
service_menu() {
  while true; do
    banner
    echo -e "  ${BCYN}  Управление сервисами${RESET}"
    blank
    echo -e "  ${WHT}1${RESET}  Запустить  (start)"
    echo -e "  ${WHT}2${RESET}  Остановить (stop)"
    echo -e "  ${WHT}3${RESET}  Перезапустить (restart)"
    echo -e "  ${WHT}4${RESET}  Пересобрать и перезапустить (build)"
    echo -e "  ${WHT}5${RESET}  Статус"
    echo -e "  ${WHT}0${RESET}  Назад"
    blank
    echo -ne "  ${WHT}Выбор${RESET}: "
    read -r choice
    case "$choice" in
      1) compose start;   pause ;;
      2) compose stop;    pause ;;
      3) compose restart; pause ;;
      4) build_and_start; pause ;;
      5) show_status;     pause ;;
      0) return ;;
    esac
  done
}

# ────────────────────────────────────────────────────────────
# Главное меню
# ────────────────────────────────────────────────────────────
main_menu() {
  while true; do
    banner

    # Краткий статус в заголовке
    if compose ps --services --filter "status=running" 2>/dev/null | grep -q .; then
      echo -e "  Сервисы: ${BGRN}● запущены${RESET}"
    else
      echo -e "  Сервисы: ${DIM}○ остановлены${RESET}"
    fi
    blank

    echo -e "  ${WHT} 1${RESET}  Первоначальная установка / Мастер настройки"
    echo -e "  ${WHT} 2${RESET}  Управление сервисами"
    echo -e "  ${WHT} 3${RESET}  Показать статус"
    echo -e "  ${WHT} 4${RESET}  Просмотр логов"
    echo -e "  ${WHT} 5${RESET}  Генерация ключа модератора"
    echo -e "  ${WHT} 6${RESET}  Текущая конфигурация"
    echo -e "  ${WHT} 7${RESET}  Редактировать .env"
    echo -e "  ${WHT} 8${RESET}  Резервное копирование"
    echo -e "  ${WHT} 9${RESET}  Обновить (git pull + rebuild)"
    echo -e "  ${WHT}10${RESET}  Деинсталляция"
    blank
    echo -e "  ${WHT} 0${RESET}  Выход"
    blank
    echo -ne "  ${WHT}Выбор${RESET}: "
    read -r choice

    case "$choice" in
      1)  run_wizard ;;
      2)  service_menu ;;
      3)  show_status;     pause ;;
      4)  show_logs_menu ;;
      5)  gen_mod_key ;;
      6)  show_config ;;
      7)  edit_env ;;
      8)  do_backup ;;
      9)  do_update ;;
      10) do_uninstall ;;
      0)  blank; echo -e "  ${DIM}Выход${RESET}"; blank; exit 0 ;;
      *)  warn "Неверный выбор" ;;
    esac
  done
}

# ────────────────────────────────────────────────────────────
# Точка входа
# ────────────────────────────────────────────────────────────
main() {
  # Неинтерактивный режим (CI / автоматизация)
  case "${1:-}" in
    install)   check_deps && run_wizard ;;
    start)     compose up -d ;;
    stop)      compose stop ;;
    restart)   compose restart ;;
    build)     build_and_start ;;
    status)    show_status ;;
    logs)      compose logs -f --tail=100 "${2:-webrtc-node}" ;;
    update)    do_update ;;
    uninstall) do_uninstall ;;
    "")
      check_deps || {
        blank
        warn "Установите Docker прежде чем продолжить."
        blank
        exit 1
      }
      main_menu
      ;;
    *)
      echo "Использование: $0 [install|start|stop|restart|build|status|logs|update|uninstall]"
      exit 1
      ;;
  esac
}

main "$@"
