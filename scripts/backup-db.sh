#!/usr/bin/env bash
# ============================================================================
# P0-9 数据库备份 / 校验 / 恢复演练（在服务器项目目录执行）
#
# 用法：
#   ./scripts/backup-db.sh                 # 备份：mysqldump -> backups/db/<db>-<时间戳>.sql.gz
#   ./scripts/backup-db.sh --check         # 只检查最近备份是否 < MAX_AGE_HOURS（部署脚本调用）
#   ./scripts/backup-db.sh --verify        # 把最近备份恢复到 BACKUP_VERIFY_DB 并 SELECT COUNT(*)
#   ./scripts/backup-db.sh --list          # 列出已有备份
#
# 环境变量：
#   PROJECT_DIR        项目目录（默认 /home/ubuntu/travel-notes）
#   BACKUP_DIR         备份目录（默认 $PROJECT_DIR/backups/db）
#   DB_NAME            库名（默认 travel_notes）
#   RETENTION_DAYS     保留天数（默认 30）
#   MAX_AGE_HOURS      --check 允许的最大备份年龄（默认 26，给「每日 02:30 备份」留 2h 余量）
#   BACKUP_REMOTE      可选，rclone 远端（如 cos:bucket/travel-notes-db），每日备份后同步
#   BACKUP_VERIFY_DB   --verify 用的临时库名（必须显式提供，且不能等于 DB_NAME）
#   COMPOSE            docker compose 命令（默认 "docker compose"）
#
# 为什么不用 mysqldump 直接连宿主机：生产 MySQL 只在 compose 网络内，没有暴露端口；
# 所以统一走 docker compose exec -T db mysqldump，备份文件落在宿主机磁盘。
# ============================================================================
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/home/ubuntu/travel-notes}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups/db}"
DB_NAME="${DB_NAME:-travel_notes}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
COMPOSE="${COMPOSE:-docker compose}"
MODE="${1:-backup}"

cd "$PROJECT_DIR"

log() { echo "[backup-db] $*"; }
die() { echo "[backup-db] ERROR: $*" >&2; exit 1; }

# 读取 .env 里的 MYSQL_ROOT_PASSWORD；已导出的环境变量优先，不覆盖
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090,SC1091
  . "$PROJECT_DIR/.env"
  set +a
fi
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"
[ -n "$MYSQL_ROOT_PASSWORD" ] || die "MYSQL_ROOT_PASSWORD 未设置（.env 缺失或未加载）"

# 密码走 MYSQL_PWD 环境变量传给容器，不出现在 `ps` 可见的命令行参数里
exec_db() {
  $COMPOSE exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" db "$@"
}

mysql_exec() {
  # -T 关闭 TTY 分配，否则 cron/管道场景会报 "the input device is not a TTY"
  exec_db mysql -uroot "$@"
}

dump_db() {
  exec_db mysqldump -uroot \
    --single-transaction --routines --triggers --events \
    --default-character-set=utf8mb4 "$DB_NAME"
}

latest_backup() {
  # shellcheck disable=SC2012
  ls -1t "$BACKUP_DIR"/"${DB_NAME}"-*.sql.gz 2>/dev/null | head -n 1 || true
}

do_backup() {
  mkdir -p "$BACKUP_DIR"
  local ts file tmp
  ts="$(date +%Y%m%d-%H%M%S)"
  file="$BACKUP_DIR/${DB_NAME}-${ts}.sql.gz"
  tmp="${file}.part"

  log "开始备份 $DB_NAME -> $file"
  if ! dump_db | gzip -9 > "$tmp"; then
    rm -f "$tmp"
    die "mysqldump 失败（检查 db 容器状态与 MYSQL_ROOT_PASSWORD）"
  fi
  gzip -t "$tmp" || { rm -f "$tmp"; die "gzip -t 校验失败，备份文件不可用"; }
  [ -s "$tmp" ] || { rm -f "$tmp"; die "备份文件为空"; }
  mv "$tmp" "$file"
  log "备份完成：$file（$(du -h "$file" | cut -f1)）"

  # 保留策略：默认 30 天（与 DEPLOYMENT.md 保持一致）
  find "$BACKUP_DIR" -type f -name "${DB_NAME}-*.sql.gz" -mtime +"$RETENTION_DAYS" -print -delete \
    | while IFS= read -r old; do log "清理过期备份: $old"; done

  if [ -n "${BACKUP_REMOTE:-}" ]; then
    command -v rclone >/dev/null 2>&1 || die "BACKUP_REMOTE 已设置但 rclone 未安装"
    log "同步到远端 $BACKUP_REMOTE ..."
    rclone copy "$file" "$BACKUP_REMOTE" || die "rclone 上传失败"
  fi
}

do_check() {
  local file age
  file="$(latest_backup)"
  [ -n "$file" ] || die "没有任何备份（$BACKUP_DIR/${DB_NAME}-*.sql.gz）；先执行 bash scripts/backup-db.sh"
  age=$(( ( $(date +%s) - $(stat -c %Y "$file") ) / 3600 ))
  log "最近备份: $file（${age}h 前，阈值 ${MAX_AGE_HOURS}h）"
  gzip -t "$file" || die "最近备份损坏（gzip -t 失败）：$file"
  [ "$age" -lt "$MAX_AGE_HOURS" ] || die "最近备份已 ${age}h，超过 ${MAX_AGE_HOURS}h 阈值；先执行 bash scripts/backup-db.sh"
  log "备份检查通过"
}

do_verify() {
  local target="${BACKUP_VERIFY_DB:-}"
  local file="${VERIFY_FILE:-$(latest_backup)}"
  [ -n "$target" ] || die "--verify 需要 BACKUP_VERIFY_DB=<临时库名>（不要指向生产库 $DB_NAME）"
  [ "$target" != "$DB_NAME" ] || die "BACKUP_VERIFY_DB 不能等于生产库名 $DB_NAME"
  [ -n "$file" ] || die "没有可恢复的备份文件"
  [ -f "$file" ] || die "备份文件不存在：$file"

  log "恢复演练：$file -> $target"
  mysql_exec -e "DROP DATABASE IF EXISTS \`$target\`; CREATE DATABASE \`$target\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" \
    || die "无法创建临时库 $target"
  gunzip -c "$file" | mysql_exec "$target" || die "恢复失败（备份可能损坏或版本不兼容）"

  local count
  count="$(mysql_exec -N -B -e "SELECT COUNT(*) FROM \`$target\`.User;" 2>/dev/null || echo "?")"
  log "恢复完成：${target}.User 行数 = ${count}"
  echo "verify_result=$target User=$count"
  log "临时库 $target 保留供人工核对；确认后执行：$COMPOSE exec -T db mysql -uroot -p*** -e 'DROP DATABASE \`$target\`'"
}

do_list() {
  mkdir -p "$BACKUP_DIR"
  # shellcheck disable=SC2012
  ls -lh "$BACKUP_DIR"/"${DB_NAME}"-*.sql.gz 2>/dev/null || die "没有备份文件"
}

case "$MODE" in
  backup) do_backup ;;
  --check|check) do_check ;;
  --verify|verify) do_verify ;;
  --list|list) do_list ;;
  *)
    die "未知参数：$MODE（可用：--check / --verify / --list）"
    ;;
esac
