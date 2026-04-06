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
info()  { echo -e "${BLU}  i${RESET}  $*"; }
ok()    { echo -e "${BGRN}  v${RESET}  $*"; }
warn()  { echo -e "${BYLW}  !${RESET}  $*"; }
err()   { echo -e "${BRED}  x${RESET}  $*" >&2; }
die()   { err "$*"; exit 1; }
hr()    { echo -e "${DIM}────────────────────────────────────────────────────────────${RESET}"; }
blank() { echo ""; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
ENV_EXAMPLE="${SCRIPT_DIR}/.env.example"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"

# ────────────────────────────────────────────────────────────
# banner — НЕ очищает экран (данные остаются видны)
# Для полной очистки вызывай: clear; banner
# ────────────────────────────────────────────────────────────
banner() {
  echo -e "${BMGN}"
  cat << 'EOF'
                                                       /\   /\
                                                      ( OwO )
                                                       )   (   )~
  ████████╗ ██████╗  ██████╗ ███╗   ██╗      ██████╗  ██████╗ ██╗  ██╗
     ██╔══╝██╔═══██╗██╔═══██╗████╗  ██║      ██╔══██╗██╔═══██╗██║ ██╔╝
     ██║   ██║   ██║██║   ██║██╔██╗ ██║█████╗██║  ██║██║   ██║█████╔╝
     ██║   ██║   ██║██║   ██║██║╚██╗██║╚════╝██║  ██║██║   ██║██╔═██╗
     ██║   ╚██████╔╝╚██████╔╝██║ ╚████║      ██████╔╝╚██████╔╝██║  ██╗
     ╚═╝    ╚═════╝  ╚═════╝ ╚═╝  ╚═══╝      ╚═════╝  ╚═════╝ ╚═╝  ╚═╝
                                                               ~~~~w~~
EOF
  echo -e "${RESET}"
  echo -e "  ${BCYN}OnionRP Streaming Tool${RESET}  ${DIM}WebRTC · mediasoup SFU · OBS Overlay${RESET}"
  echo -e "  ${DIM}https://github.com/Anch0vu/stream-overlay${RESET}"
  blank; hr; blank
}

# ────────────────────────────────────────────────────────────
# pause — пишет в /dev/tty, не в stdout
# ────────────────────────────────────────────────────────────
pause() {
  printf "  ${DIM}[ Нажмите Enter для продолжения ]${RESET}" >/dev/tty
  read -r </dev/tty || true
}

# ────────────────────────────────────────────────────────────
# Интерактивный ввод
# КЛЮЧЕВОЙ ФИКСинт: промпт → /dev/tty, читаем из /dev/tty
# Это позволяет вызывать VAR=$(read_val ...) без потери промпта
# ────────────────────────────────────────────────────────────
read_val() {
  local prompt="$1" default="${2:-}"
  if [[ -n "$default" ]]; then
    echo -ne "  ${WHT}${prompt} [${default}]: ${RESET}" >/dev/tty
  else
    echo -ne "  ${WHT}${prompt}: ${RESET}" >/dev/tty
  fi
  local val=""
  read -r val </dev/tty || true
  printf '%s' "${val:-$default}"
}

read_pass() {
  local prompt="$1" default="${2:-}"
  if [[ -n "$default" ]]; then
    echo -ne "  ${WHT}${prompt} [сохранить]: ${RESET}" >/dev/tty
  else
    echo -ne "  ${WHT}${prompt}: ${RESET}" >/dev/tty
  fi
  local val=""
  read -rs val </dev/tty || true
  printf '\n' >/dev/tty
  printf '%s' "${val:-$default}"
}

# ────────────────────────────────────────────────────────────
# Проверка зависимостей
# ────────────────────────────────────────────────────────────
check_deps() {
  local missing=()
  for cmd in docker curl openssl awk; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
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

# ────────────────────────────────────────────────────────────
# compose wrapper — всегда с project-directory
# При REDIS_MODE=docker автоматически добавляет --profile docker-redis
# ────────────────────────────────────────────────────────────
compose() {
  local extra_args=()
  if [[ "$(env_get REDIS_MODE)" == "docker" ]]; then
    extra_args=(--profile docker-redis)
  fi
  if docker compose version &>/dev/null 2>&1; then
    docker compose --project-directory "$SCRIPT_DIR" -f "$COMPOSE_FILE" "${extra_args[@]}" "$@"
  else
    docker-compose --project-directory "$SCRIPT_DIR" -f "$COMPOSE_FILE" "${extra_args[@]}" "$@"
  fi
}

# ────────────────────────────────────────────────────────────
# Генерация паролей
# Charset: только символы безопасные для sed и shell
# Исключены: & | \ ! ` $ ( ) < > ; ' "
# ────────────────────────────────────────────────────────────
gen_pass() {
  local len="${1:-32}"
  openssl rand -base64 64 | tr -dc 'a-zA-Z0-9@#%^*_+=-' | head -c "$len"
  echo ""
}

gen_secret() {
  openssl rand -hex 32
}

# ────────────────────────────────────────────────────────────
# Определить публичный IP
# ────────────────────────────────────────────────────────────
detect_public_ip() {
  local ip=""
  ip=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null) \
    || ip=$(curl -s --max-time 5 https://ifconfig.me 2>/dev/null) \
    || ip=$(curl -s --max-time 5 https://ipecho.net/plain 2>/dev/null) \
    || true
  printf '%s' "${ip:-}"
}

# ────────────────────────────────────────────────────────────
# .env helpers
# ────────────────────────────────────────────────────────────
env_get() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || { printf ''; return 0; }
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true
}

# Безопасная запись в .env через awk (нет проблем со спецсимволами)
env_set() {
  local key="$1" val="$2"
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    # awk безопасно заменяет строку, не зависит от спецсимволов в val
    awk -v k="$key" -v v="$val" \
      'BEGIN{FS="="; OFS="="} $1==k{$0=k"="v} 1' \
      "$ENV_FILE" > "${ENV_FILE}.tmp" && mv "${ENV_FILE}.tmp" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

# ────────────────────────────────────────────────────────────
# Ссылки и доступы после запуска
# ────────────────────────────────────────────────────────────
print_links() {
  local port pub_ip
  port=$(env_get WEB_PORT); port="${port:-13777}"
  pub_ip=$(env_get MEDIASOUP_ANNOUNCED_IP); pub_ip="${pub_ip:-localhost}"
  hr; blank
  echo -e "  ${WHT}Ссылки:${RESET}"
  echo -e "  ${BBLU}  Dock-панель  ${BCYN}http://${pub_ip}:${port}${RESET}"
  echo -e "  ${BBLU}  API health   ${BCYN}http://${pub_ip}:${port}/api/health${RESET}"
  echo -e "  ${BBLU}  OBS overlay  ${BCYN}http://${pub_ip}:${port}/obs${RESET}"
  blank

  # Показываем пароль стримера, если .env существует
  local sp; sp=$(env_get STREAMER_PASSWORD)
  local rm; rm=$(env_get REDIS_MODE); rm="${rm:-docker}"
  if [[ -n "$sp" ]]; then
    echo -e "  ${WHT}Доступы:${RESET}"
    echo -e "  ${DIM}  Пароль стримера   ${RESET}${BYLW}${sp}${RESET}"
    echo -e "  ${DIM}  Режим Redis        ${RESET}${BYLW}${rm}${RESET}"
    echo -e "  ${DIM}  Остальное          ${RESET}${DIM}→ cat ${ENV_FILE}${RESET}"
    blank
  fi
}

# ────────────────────────────────────────────────────────────
# Ожидание готовности API (polling /api/health)
# ────────────────────────────────────────────────────────────
wait_healthy() {
  local port pub_ip
  port=$(env_get WEB_PORT); port="${port:-13777}"
  pub_ip=$(env_get MEDIASOUP_ANNOUNCED_IP); pub_ip="${pub_ip:-localhost}"
  local url="http://127.0.0.1:${port}/api/health"

  info "Ожидание готовности сервера..."
  local elapsed=0 dot_count=0
  printf "  " >/dev/tty
  while [[ $elapsed -lt 90 ]]; do
    if curl -sf --max-time 2 "$url" &>/dev/null; then
      printf "\n" >/dev/tty
      ok "Сервис отвечает — готов к работе"; blank
      return 0
    fi
    printf "." >/dev/tty
    sleep 3
    (( elapsed += 3, dot_count += 1 ))
    # Новая строка каждые 20 точек
    [[ $(( dot_count % 20 )) -eq 0 ]] && printf "\n  " >/dev/tty
  done
  printf "\n" >/dev/tty
  warn "Сервер не ответил за 90 секунд — проверьте логи (п.4)"
  return 1
}

# ────────────────────────────────────────────────────────────
# Проверка firewall для WebRTC UDP портов
# ────────────────────────────────────────────────────────────
check_firewall() {
  local min_port max_port
  min_port=$(env_get MEDIASOUP_MIN_PORT); min_port="${min_port:-40000}"
  max_port=$(env_get MEDIASOUP_MAX_PORT); max_port="${max_port:-49999}"

  # ufw
  if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "^Status: active"; then
    if ! ufw status 2>/dev/null | grep -qE "${min_port}[:/]|${min_port}:${max_port}"; then
      blank
      warn "ufw активен, но UDP ${min_port}:${max_port} не открыты!"
      echo -e "  ${DIM}Выполните:  ufw allow ${min_port}:${max_port}/udp${RESET}"
      blank
    fi
    return
  fi

  # iptables (только если ufw не активен)
  if command -v iptables &>/dev/null; then
    local rules; rules=$(iptables -L INPUT -n 2>/dev/null || true)
    if echo "$rules" | grep -q "DROP\|REJECT" && \
       ! echo "$rules" | grep -qE "dpt:${min_port}|dpts:${min_port}"; then
      blank
      warn "iptables DROP обнаружен, UDP ${min_port}:${max_port} могут быть заблокированы"
      echo -e "  ${DIM}Если стрим не работает, откройте порты вручную:${RESET}"
      echo -e "  ${DIM}  iptables -A INPUT -p udp --dport ${min_port}:${max_port} -j ACCEPT${RESET}"
      blank
    fi
  fi
}

# ────────────────────────────────────────────────────────────
# Мастер конфигурации
# ────────────────────────────────────────────────────────────
run_wizard() {
  clear; banner
  echo -e "  ${BCYN}>>  Мастер первоначальной настройки${RESET}"
  blank

  info "Определяем публичный IP..."
  local auto_ip
  auto_ip=$(detect_public_ip)
  if [[ -n "$auto_ip" ]]; then
    ok "Обнаружен IP: ${BYLW}${auto_ip}${RESET}"
  else
    warn "Не удалось определить IP автоматически"
    auto_ip="YOUR_PUBLIC_IP"
  fi
  blank

  [[ -f "$ENV_FILE" ]] || cp "$ENV_EXAMPLE" "$ENV_FILE"

  # ─── Сеть ───────────────────────────────────────────────
  echo -e "  ${BBLU}--  Сеть  ---------------------------------------${RESET}"
  blank

  local pub_ip
  pub_ip=$(read_val "Публичный IP сервера" "$auto_ip")
  blank

  local web_port
  local _wp; _wp=$(env_get WEB_PORT); _wp="${_wp:-13777}"
  web_port=$(read_val "Внешний порт веб-панели" "$_wp")
  blank

  local cors_origin
  cors_origin=$(read_val "CORS Origin" "http://${pub_ip}:${web_port}")
  blank

  # ─── Redis ──────────────────────────────────────────────
  echo -e "  ${BBLU}--  Redis  --------------------------------------${RESET}"
  blank

  local redis_mode redis_host redis_port
  # Проверяем, занят ли порт 6379 системным Redis
  local redis_running=false
  if ss -lptn 2>/dev/null | grep -q ':6379 ' || \
     nc -z 127.0.0.1 6379 2>/dev/null; then
    redis_running=true
  fi

  local saved_mode; saved_mode=$(env_get REDIS_MODE)

  if [[ "$redis_running" == "true" ]]; then
    echo -e "  ${YLW}!  На сервере уже запущен Redis (порт 6379 занят).${RESET}"
    blank
    echo -e "  ${DIM}[1] Использовать системный Redis (рекомендуется)${RESET}"
    echo -e "  ${DIM}[2] Запустить Redis в Docker  (потребует остановки системного)${RESET}"
    blank
    echo -ne "  ${WHT}Выбор [${saved_mode:-1}]: ${RESET}" >/dev/tty
    local redis_choice; read -r redis_choice </dev/tty || true
    redis_choice="${redis_choice:-${saved_mode:-1}}"
  else
    echo -e "  ${DIM}[1] Запустить Redis в Docker  (рекомендуется)${RESET}"
    echo -e "  ${DIM}[2] Использовать внешний Redis (укажите хост)${RESET}"
    blank
    echo -ne "  ${WHT}Выбор [${saved_mode:-1}]: ${RESET}" >/dev/tty
    local redis_choice; read -r redis_choice </dev/tty || true
    # При обнаруженном системном Redis по умолчанию 1=external; без Redis 1=docker
    if [[ "$redis_running" == "true" ]]; then
      redis_choice="${redis_choice:-${saved_mode:-1}}"
    else
      redis_choice="${redis_choice:-${saved_mode:-1}}"
    fi
  fi
  blank

  if { [[ "$redis_running" == "true" ]] && [[ "$redis_choice" == "1" ]]; } || \
     { [[ "$redis_running" == "false" ]] && [[ "$redis_choice" == "2" ]]; }; then
    # Внешний Redis
    redis_mode="external"
    local _rh; _rh=$(env_get REDIS_HOST)
    [[ "$_rh" == "redis" || -z "$_rh" ]] && _rh="127.0.0.1"
    redis_host=$(read_val "Redis host" "$_rh")
    redis_port=$(read_val "Redis port" "$(env_get REDIS_PORT || echo 6379)")
    blank
  else
    # Docker Redis
    redis_mode="docker"
    redis_host="redis"
    redis_port="6379"
  fi

  # ─── Пароли ─────────────────────────────────────────────
  echo -e "  ${BBLU}--  Пароли (пусто = автогенерация)  ------------${RESET}"
  blank

  local redis_pw
  if [[ "$redis_mode" == "external" ]]; then
    echo -e "  ${DIM}Для внешнего Redis укажите его текущий пароль (пусто = без пароля).${RESET}"
    blank
  fi
  redis_pw=$(read_pass "Redis password" "$(env_get REDIS_PASSWORD)")
  if [[ -z "$redis_pw" ]]; then
    redis_pw=$(gen_pass 24)
    info "Redis: ${DIM}${redis_pw}${RESET}"
  fi

  local jwt_secret
  jwt_secret=$(read_pass "JWT secret (>=32 символа)" "$(env_get JWT_SECRET)")
  if [[ -z "$jwt_secret" ]]; then
    jwt_secret=$(gen_secret)
    info "JWT:   ${DIM}${jwt_secret}${RESET}"
  fi

  local streamer_pw
  streamer_pw=$(read_pass "Пароль стримера" "$(env_get STREAMER_PASSWORD)")
  if [[ -z "$streamer_pw" ]]; then
    streamer_pw=$(gen_pass 20)
    info "Strmr: ${DIM}${streamer_pw}${RESET}"
  fi

  local turn_pw
  turn_pw=$(read_pass "TURN пароль" "$(env_get TURN_SERVER_PASSWORD)")
  if [[ -z "$turn_pw" ]]; then
    turn_pw=$(gen_pass 20)
    info "TURN:  ${DIM}${turn_pw}${RESET}"
  fi
  blank

  # ─── WebRTC порты ───────────────────────────────────────
  echo -e "  ${BBLU}--  WebRTC порты  --------------------------------${RESET}"
  blank

  local _mn; _mn=$(env_get MEDIASOUP_MIN_PORT); _mn="${_mn:-40000}"
  local _mx; _mx=$(env_get MEDIASOUP_MAX_PORT); _mx="${_mx:-49999}"
  local min_port max_port
  min_port=$(read_val "UDP мин. порт" "$_mn")
  max_port=$(read_val "UDP макс. порт" "$_mx")
  blank

  # ─── TURN ───────────────────────────────────────────────
  echo -e "  ${BBLU}--  TURN / coturn  ------------------------------${RESET}"
  blank
  echo -e "  ${DIM}TURN используется WebRTC для обхода NAT/firewall клиентов.${RESET}"
  echo -e "  ${DIM}Username/realm — учётные данные встроенного coturn-сервера.${RESET}"
  blank

  local _tu; _tu=$(env_get TURN_SERVER_USERNAME); _tu="${_tu:-onionrp}"
  local turn_user turn_realm
  turn_user=$(read_val "TURN username" "$_tu")
  turn_realm=$(read_val "TURN realm" "onionrp.local")
  blank

  # ─── Запись .env ────────────────────────────────────────
  info "Запись конфигурации..."

  env_set NODE_ENV                "production"
  env_set HOST                    "0.0.0.0"
  env_set SERVER_PORT             "3001"
  env_set WEB_PORT                "$web_port"
  env_set MEDIASOUP_LISTEN_IP     "0.0.0.0"
  env_set MEDIASOUP_ANNOUNCED_IP  "$pub_ip"
  env_set MEDIASOUP_MIN_PORT      "$min_port"
  env_set MEDIASOUP_MAX_PORT      "$max_port"
  env_set MEDIASOUP_LOG_LEVEL     "warn"
  env_set REDIS_MODE              "$redis_mode"
  # Внешний Redis: контейнер обращается к хосту через host.docker.internal
  if [[ "$redis_mode" == "external" ]]; then
    local docker_redis_host="$redis_host"
    [[ "$redis_host" == "127.0.0.1" || "$redis_host" == "localhost" ]] && \
      docker_redis_host="host.docker.internal"
    env_set REDIS_HOST            "$docker_redis_host"
  else
    env_set REDIS_HOST            "redis"
  fi
  env_set REDIS_PORT              "$redis_port"
  env_set REDIS_PASSWORD          "$redis_pw"
  env_set JWT_SECRET              "$jwt_secret"
  env_set JWT_EXPIRES_IN          "24h"
  env_set STREAMER_PASSWORD       "$streamer_pw"
  env_set MODERATOR_KEY_TTL       "600"
  env_set TURN_SERVER_URL         "turn:${pub_ip}:3478"
  env_set TURN_SERVER_USERNAME    "$turn_user"
  env_set TURN_SERVER_PASSWORD    "$turn_pw"
  env_set CORS_ORIGIN             "$cors_origin"
  env_set MEDIASOUP_WORKERS       "2"
  env_set RATE_LIMIT_WINDOW_MS    "60000"
  env_set RATE_LIMIT_MAX_REQUESTS "100"

  # ─── coturn конфиг через awk ────────────────────────────
  local coturn_conf="${SCRIPT_DIR}/coturn/turnserver.conf"
  if [[ -f "$coturn_conf" ]]; then
    awk \
      -v ip="$pub_ip" \
      -v usr="${turn_user}:${turn_pw}" \
      -v rlm="$turn_realm" \
      '/^external-ip=/{ print "external-ip=" ip; next }
       /^user=/        { print "user=" usr;        next }
       /^realm=/       { print "realm=" rlm;       next }
       { print }' \
      "$coturn_conf" > "${coturn_conf}.tmp" && mv "${coturn_conf}.tmp" "$coturn_conf"
    ok "coturn/turnserver.conf обновлён"
  fi

  # Ограничиваем доступ к .env (пароли, JWT secret)
  chmod 600 "$ENV_FILE" 2>/dev/null || true

  blank; ok "${BGRN}.env успешно сохранён${RESET}  ${DIM}(chmod 600)${RESET}"; blank

  printf "  ${WHT}Собрать и запустить контейнеры сейчас? [y/N]: ${RESET}" >/dev/tty
  local do_build=""
  read -r do_build </dev/tty || true
  if [[ "$do_build" =~ ^[Yy]$ ]]; then
    build_and_start
  fi
  pause
}

# ────────────────────────────────────────────────────────────
# Сборка и запуск
# ────────────────────────────────────────────────────────────
build_and_start() {
  blank; hr
  info "Сборка контейнеров (BuildKit)..."
  echo -e "  ${DIM}(первая сборка занимает 3–10 минут из-за компиляции нативных модулей)${RESET}"
  blank
  if ! DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 \
       compose build --progress=plain 2>&1; then
    err "Сборка завершилась с ошибкой. Проверьте вывод выше."
    return 1
  fi
  blank
  info "Запуск сервисов..."
  compose up -d
  blank
  check_firewall
  wait_healthy || true
  print_links
}

# ────────────────────────────────────────────────────────────
# Статус сервисов (без clear — данные остаются)
# ────────────────────────────────────────────────────────────
show_status() {
  blank; hr
  echo -e "  ${BCYN}>>  Статус сервисов${RESET}"; blank
  compose ps 2>/dev/null || { err "Docker Compose недоступен"; pause; return 1; }
  print_links
  pause
}

# ────────────────────────────────────────────────────────────
# Просмотр логов
# ────────────────────────────────────────────────────────────
show_logs_menu() {
  blank; hr
  echo -e "  ${BCYN}>>  Просмотр логов${RESET}"; blank
  echo -e "  ${WHT}1${RESET}  webrtc-node (сигнальный сервер)"
  echo -e "  ${WHT}2${RESET}  nginx"
  echo -e "  ${WHT}3${RESET}  redis"
  echo -e "  ${WHT}4${RESET}  coturn"
  echo -e "  ${WHT}5${RESET}  все сервисы"
  echo -e "  ${WHT}0${RESET}  назад"
  blank
  echo -ne "  ${WHT}Выбор${RESET}: "; local choice; read -r choice
  blank

  local svc=""
  case "$choice" in
    1) svc="webrtc-node" ;;
    2) svc="nginx" ;;
    3) svc="redis" ;;
    4) svc="coturn" ;;
    5) svc="" ;;
    *) return ;;
  esac

  info "Ctrl+C для выхода из лога"
  hr
  if [[ -n "$svc" ]]; then
    compose logs -f --tail=100 "$svc" || true
  else
    compose logs -f --tail=50 || true
  fi
  hr; pause
}

# ────────────────────────────────────────────────────────────
# Генерация ключа модератора
# ────────────────────────────────────────────────────────────
gen_mod_key() {
  blank; hr
  echo -e "  ${BCYN}>>  Генерация ключа модератора${RESET}"; blank

  local port pub_ip streamer_pw
  port=$(env_get WEB_PORT);              port="${port:-13777}"
  pub_ip=$(env_get MEDIASOUP_ANNOUNCED_IP); pub_ip="${pub_ip:-localhost}"
  streamer_pw=$(env_get STREAMER_PASSWORD)

  if [[ -z "$streamer_pw" ]]; then
    streamer_pw=$(read_pass "Пароль стримера" "")
  fi

  info "Авторизация как стример..."
  local token_resp token
  # Правильный эндпоинт: POST /api/auth/streamer
  token_resp=$(curl -s --max-time 10 -X POST \
    -H "Content-Type: application/json" \
    -d "{\"password\":\"${streamer_pw}\"}" \
    "http://${pub_ip}:${port}/api/auth/streamer" 2>/dev/null) || true

  token=$(printf '%s' "$token_resp" | grep -o '"token":"[^"]*"' | cut -d'"' -f4 2>/dev/null) || true

  if [[ -z "$token" ]]; then
    err "Авторизация не удалась. Сервисы запущены?"
    [[ -n "$token_resp" ]] && echo -e "  ${DIM}Ответ: ${token_resp}${RESET}"
    pause; return
  fi
  ok "Авторизован"

  info "Генерация ключа..."
  local key_resp key
  # Правильный эндпоинт: POST /api/auth/keys/generate
  key_resp=$(curl -s --max-time 10 -X POST \
    -H "Authorization: Bearer ${token}" \
    "http://${pub_ip}:${port}/api/auth/keys/generate" 2>/dev/null) || true
  key=$(printf '%s' "$key_resp" | grep -o '"key":"[^"]*"' | cut -d'"' -f4 2>/dev/null) || true

  if [[ -z "$key" ]]; then
    err "Не удалось получить ключ"
    [[ -n "$key_resp" ]] && echo -e "  ${DIM}Ответ: ${key_resp}${RESET}"
    pause; return
  fi

  blank
  echo -e "  ${BGRN}  Ключ модератора:${RESET}"; blank
  echo -e "  ${BYLW}  +------------------------------------------+${RESET}"
  echo -e "  ${BYLW}  |  ${BCYN}${key}${BYLW}  |${RESET}"
  echo -e "  ${BYLW}  +------------------------------------------+${RESET}"
  blank
  local ttl; ttl=$(env_get MODERATOR_KEY_TTL); ttl="${ttl:-600}"
  info "Действителен $(( ttl / 60 )) мин ($ttl с)"
  blank; pause
}

# ────────────────────────────────────────────────────────────
# Текущая конфигурация
# ────────────────────────────────────────────────────────────
show_config() {
  blank; hr
  echo -e "  ${BCYN}>>  Текущая конфигурация${RESET}"; blank

  if [[ ! -f "$ENV_FILE" ]]; then
    warn ".env не найден — запустите мастер настройки (п.1)"
    pause; return
  fi

  local pub_ip web_port server_port cors
  pub_ip=$(env_get MEDIASOUP_ANNOUNCED_IP)
  web_port=$(env_get WEB_PORT)
  server_port=$(env_get SERVER_PORT)
  cors=$(env_get CORS_ORIGIN)

  # printf с цветом в format-строке — не в аргументе
  _row() { printf "  ${DIM}%-30s${RESET}  ${BCYN}%s${RESET}\n" "$1" "$2"; }
  _row "Публичный IP"        "$pub_ip"
  _row "Порт веб-панели"     "$web_port"
  _row "Порт сигн. сервера"  "$server_port"
  _row "CORS Origin"         "$cors"
  _row "UDP диапазон"        "$(env_get MEDIASOUP_MIN_PORT)-$(env_get MEDIASOUP_MAX_PORT)"
  _row "TURN URL"            "$(env_get TURN_SERVER_URL)"
  _row "Redis host:port"     "$(env_get REDIS_HOST):$(env_get REDIS_PORT)"
  _row "Node ENV"            "$(env_get NODE_ENV)"
  blank; hr; blank
  echo -e "  ${DIM}Файл: ${ENV_FILE}${RESET}"
  blank; pause
}

# ────────────────────────────────────────────────────────────
# Обновление
# ────────────────────────────────────────────────────────────
do_update() {
  blank; hr
  echo -e "  ${BCYN}>>  Обновление${RESET}"; blank

  if ! command -v git &>/dev/null; then
    warn "git не найден — обновление через git невозможно"
    pause; return
  fi

  info "Проверка новых коммитов..."
  git -C "$SCRIPT_DIR" fetch origin 2>&1 || {
    warn "Не удалось подключиться к git remote"
    pause; return
  }

  local branch; branch=$(git -C "$SCRIPT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  local ahead_behind; ahead_behind=$(git -C "$SCRIPT_DIR" rev-list --left-right --count "HEAD...origin/${branch}" 2>/dev/null || echo "0	0")
  local behind; behind=$(echo "$ahead_behind" | awk '{print $2}')

  if [[ "$behind" == "0" ]]; then
    ok "Уже актуальная версия — обновление не требуется"
    pause; return
  fi

  blank
  echo -e "  ${DIM}Новые коммиты (${behind}):${RESET}"
  git -C "$SCRIPT_DIR" log --oneline "HEAD..origin/${branch}" 2>/dev/null | \
    while IFS= read -r line; do echo -e "  ${DIM}  ${line}${RESET}"; done
  blank

  info "Остановка сервисов..."
  compose stop || true

  info "git pull..."
  git -C "$SCRIPT_DIR" pull --ff-only origin "$branch" || {
    warn "git pull не удался — конфликт изменений. Обновите вручную."
    compose start || true; pause; return
  }

  build_and_start
  ok "Обновление завершено"; pause
}

# ────────────────────────────────────────────────────────────
# Резервная копия
# ────────────────────────────────────────────────────────────
do_backup() {
  blank; hr
  echo -e "  ${BCYN}>>  Резервное копирование${RESET}"; blank

  local backup_dir="${SCRIPT_DIR}/backups"
  mkdir -p "$backup_dir"
  local ts; ts=$(date +%Y%m%d_%H%M%S)
  local backup_file="${backup_dir}/backup_${ts}.tar.gz"

  info "Создание архива..."
  tar -czf "$backup_file" -C "$SCRIPT_DIR" \
    .env coturn/turnserver.conf 2>/dev/null || true

  ok "Сохранено: ${BYLW}${backup_file}${RESET}"; blank
  info "Redis backup: docker compose exec redis redis-cli -a \$REDIS_PASSWORD BGSAVE"
  blank; pause
}

# ────────────────────────────────────────────────────────────
# Деинсталляция
# ────────────────────────────────────────────────────────────
do_uninstall() {
  blank; hr
  echo -e "  ${BRED}>>  Деинсталляция${RESET}"; blank
  warn "Остановит и УДАЛИТ все контейнеры и Docker volumes!"
  warn "Файлы проекта (${SCRIPT_DIR}) НЕ будут удалены."; blank

  printf "  ${BRED}Введите YES для подтверждения: ${RESET}" >/dev/tty
  local confirm=""
  read -r confirm </dev/tty || true

  if [[ "$confirm" != "YES" ]]; then
    info "Отменено"; pause; return
  fi

  compose down -v --remove-orphans 2>/dev/null || true
  blank; ok "Контейнеры и volumes удалены"; blank; pause
}

# ────────────────────────────────────────────────────────────
# Редактировать .env
# ────────────────────────────────────────────────────────────
edit_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    err ".env не найден — запустите мастер настройки (п.1)"
    pause; return
  fi
  local editor="${EDITOR:-nano}"
  command -v "$editor" &>/dev/null || editor=vi
  command -v "$editor" &>/dev/null || { err "Редактор не найден (нет nano/vi)"; pause; return; }
  "$editor" "$ENV_FILE"
}

# ────────────────────────────────────────────────────────────
# Управление сервисами
# ────────────────────────────────────────────────────────────
service_menu() {
  while true; do
    blank; hr
    echo -e "  ${BCYN}>>  Управление сервисами${RESET}"; blank
    echo -e "  ${WHT}1${RESET}  Запустить"
    echo -e "  ${WHT}2${RESET}  Остановить"
    echo -e "  ${WHT}3${RESET}  Перезапустить"
    echo -e "  ${WHT}4${RESET}  Пересобрать + запустить"
    echo -e "  ${WHT}5${RESET}  Статус"
    echo -e "  ${WHT}0${RESET}  Назад"
    blank; echo -ne "  ${WHT}Выбор${RESET}: "
    local choice; read -r choice; blank

    case "$choice" in
      1) compose start   && ok "Запущено"       || err "Ошибка"; pause ;;
      2) compose stop    && ok "Остановлено"    || err "Ошибка"; pause ;;
      3) compose restart && ok "Перезапущено"   || err "Ошибка"; pause ;;
      4) build_and_start; pause ;;
      5) show_status ;;
      0) return ;;
      *) warn "Неверный выбор" ;;
    esac
  done
}

# ────────────────────────────────────────────────────────────
# Главное меню
# banner() НЕ очищает экран — вывод предыдущих команд остаётся
# ────────────────────────────────────────────────────────────
main_menu() {
  clear
  while true; do
    banner

    # Быстрый статус сервисов
    local svc_status
    if compose ps --services --filter "status=running" 2>/dev/null | grep -q . 2>/dev/null; then
      svc_status="${BGRN}zapusheny${RESET}"
    else
      svc_status="${DIM}ostanovleny${RESET}"
    fi
    echo -e "  Сервисы: ${svc_status}"; blank

    echo -e "  ${WHT} 1${RESET}  Установка / Мастер настройки"
    echo -e "  ${WHT} 2${RESET}  Управление сервисами"
    echo -e "  ${WHT} 3${RESET}  Статус"
    echo -e "  ${WHT} 4${RESET}  Логи"
    echo -e "  ${WHT} 5${RESET}  Ключ модератора"
    echo -e "  ${WHT} 6${RESET}  Текущая конфигурация"
    echo -e "  ${WHT} 7${RESET}  Редактировать .env"
    echo -e "  ${WHT} 8${RESET}  Резервная копия"
    echo -e "  ${WHT} 9${RESET}  Обновить (git pull)"
    echo -e "  ${WHT}10${RESET}  Деинсталляция"
    blank
    echo -e "  ${WHT} 0${RESET}  Выход"
    blank; echo -ne "  ${WHT}Выбор${RESET}: "
    local choice; read -r choice

    case "$choice" in
      1)  run_wizard ;;
      2)  service_menu ;;
      3)  show_status ;;
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
    # После каждого действия banner() рисуется НИЖЕ без очистки экрана
    # Пользователь видит вывод предыдущей команды при скролле вверх
  done
}

# ────────────────────────────────────────────────────────────
# Точка входа
# ────────────────────────────────────────────────────────────
main() {
  case "${1:-}" in
    install)   check_deps && run_wizard ;;
    start)     compose up -d ;;
    stop)      compose stop ;;
    restart)   compose restart ;;
    build)     build_and_start ;;
    status)    show_status ;;
    logs)      [[ -n "${2:-}" ]] && compose logs -f --tail=100 "$2" \
                                  || compose logs -f --tail=50 ;;
    update)    do_update ;;
    uninstall) do_uninstall ;;
    "")
      check_deps || { blank; warn "Установите Docker."; blank; exit 1; }
      main_menu
      ;;
    *)
      echo "Использование: $0 [install|start|stop|restart|build|status|logs [service]|update|uninstall]"
      exit 1
      ;;
  esac
}

main "$@"
