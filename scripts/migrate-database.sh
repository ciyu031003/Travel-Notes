#!/bin/bash
# ============================================================================
#  Travel-Notes 数据库迁移脚本
#
#  用途：
#    - 服务器迁移时，在旧服务器导出数据库备份，在新服务器导入恢复
#    - 日常数据库备份 / 备份列表查看 / 恢复后校验
#
#  用法:
#    ./scripts/migrate-database.sh backup [DIR]          # 导出备份（默认 backups/db/，可传目录）
#    ./scripts/migrate-database.sh restore <file.sql|file.sql.gz>  # 恢复（自动建库）
#    ./scripts/migrate-database.sh list                   # 列出已有备份
#    ./scripts/migrate-database.sh verify                 # 校验当前库表结构与数据量
#    ./scripts/migrate-database.sh help
#
#  依赖：mysql / mysqldump 客户端（旧服务器: mysqldump；新服务器: mysql）
#    Ubuntu/Debian: sudo apt-get install -y mysql-client
#    CentOS/RHEL:   sudo yum install -y mysql
#
#  说明：脚本从项目根目录 .env 读取 DATABASE_URL（mysql://user:pass@host:port/db）
# ============================================================================
set -euo pipefail

# ======================== 配置区 ========================
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="$APP_DIR/backups/db"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ======================== 解析 DATABASE_URL ========================

parse_db_url() {
    if [ ! -f "$APP_DIR/.env" ]; then
        error "未找到 $APP_DIR/.env，请先配置 DATABASE_URL"
        exit 1
    fi

    local db_url
    db_url=$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" 2>/dev/null | sed 's/^DATABASE_URL=//' | tr -d '"' || true)

    if [ -z "$db_url" ]; then
        error ".env 中未配置 DATABASE_URL"
        exit 1
    fi

    local url="${db_url#mysql://}"
    DB_USER=$(echo "$url" | sed -E 's/^([^:]+):.*/\1/')
    DB_PASS=$(echo "$url" | sed -E 's/^[^:]+:([^@]+)@.*/\1/')
    DB_HOST=$(echo "$url" | sed -E 's/.*@([^:]+):.*/\1/')
    DB_PORT=$(echo "$url" | sed -E 's/.*:([0-9]+)\/.*/\1/')
    DB_NAME=$(echo "$url" | sed -E 's/.*\/(.*)$/\1/')

    if [ -z "$DB_NAME" ] || [ "$DB_NAME" = "$url" ]; then
        error "无法解析 DATABASE_URL（期望格式: mysql://user:pass@host:port/dbname）"
        exit 1
    fi
}

# ======================== 子命令 ========================

cmd_backup() {
    local backup_dir="${1:-$BACKUP_ROOT}"
    mkdir -p "$backup_dir"

    if ! command -v mysqldump &>/dev/null; then
        error "未找到 mysqldump，请先安装 mysql-client"
        exit 1
    fi

    parse_db_url

    local backup_file="$backup_dir/${DB_NAME}_${TIMESTAMP}.sql"
    info "导出数据库 ${DB_NAME} → $backup_file"

    if mysqldump -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" \
        --single-transaction --quick --routines --triggers --set-gtid-purged=OFF \
        "$DB_NAME" > "$backup_file" 2>/dev/null; then
        local size
        size=$(du -h "$backup_file" | cut -f1)
        info "备份成功 (${size})"
        echo ""
        info "下一步：将备份文件传输到新服务器后执行恢复"
        echo "  scp $backup_file user@新服务器:/path/to/Travel-Notes/backups/db/"
        echo "  ./scripts/migrate-database.sh restore $backup_file"
    else
        error "备份失败，请检查 mysqldump 是否可连接数据库"
        exit 1
    fi
}

cmd_restore() {
    local file="${1:-}"
    if [ -z "$file" ]; then
        error "用法: ./scripts/migrate-database.sh restore <file.sql|file.sql.gz>"
        exit 1
    fi
    if [ ! -f "$file" ]; then
        error "备份文件不存在: $file"
        exit 1
    fi

    if ! command -v mysql &>/dev/null; then
        error "未找到 mysql 客户端，请先安装 mysql-client"
        exit 1
    fi

    parse_db_url

    info "恢复数据库 ${DB_NAME} ← $file"

    # 确保数据库存在（utf8mb4，与项目建表一致）
    mysql -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" \
        -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null

    # 导入（支持 .sql 与 .sql.gz）
    if [[ "$file" == *.gz ]]; then
        if gunzip -c "$file" | mysql -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" "$DB_NAME" 2>/dev/null; then
            info "恢复成功 (gzip)"
        else
            error "恢复失败，请检查备份文件与数据库权限"
            exit 1
        fi
    else
        if mysql -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" "$DB_NAME" < "$file" 2>/dev/null; then
            info "恢复成功"
        else
            error "恢复失败，请检查备份文件与数据库权限"
            exit 1
        fi
    fi

    cmd_verify
}

cmd_list() {
    local backup_dir="${1:-$BACKUP_ROOT}"
    if [ ! -d "$backup_dir" ]; then
        warn "备份目录不存在: $backup_dir"
        return 0
    fi

    info "备份目录: $backup_dir"
    local count=0
    while IFS= read -r f; do
        count=$((count+1))
        echo "  $(basename "$f")  ($(du -h "$f" | cut -f1))"
    done < <(ls -t "$backup_dir"/*.sql "$backup_dir"/*.sql.gz 2>/dev/null || true)

    if [ "$count" -eq 0 ]; then
        warn "暂无备份文件"
    fi
}

cmd_verify() {
    parse_db_url

    info "校验数据库 ${DB_NAME} ..."

    if ! mysql -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" "$DB_NAME" \
        -e "SHOW TABLES;" 2>/dev/null | tail -n +2 >/dev/null; then
        error "无法连接数据库，校验失败"
        exit 1
    fi

    echo "  ── 表清单与数据量 ──"
    mysql -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" "$DB_NAME" 2>/dev/null \
        -e "SELECT table_name AS '表', table_rows AS '行数' FROM information_schema.tables WHERE table_schema='$DB_NAME' ORDER BY table_name;"

    # 关键表存在性检查
    local required=("Post" "SiteSetting" "PostImage" "Danmaku" "Repo" "TokenBlacklist")
    local missing=()
    for t in "${required[@]}"; do
        if ! mysql -u"$DB_USER" -p"$DB_PASS" -h"$DB_HOST" -P"$DB_PORT" "$DB_NAME" \
            -e "SELECT 1 FROM \`$t\` LIMIT 1;" >/dev/null 2>&1; then
            missing+=("$t")
        fi
    done

    if [ ${#missing[@]} -eq 0 ]; then
        info "校验通过：全部关键表存在 (Post/SiteSetting/PostImage/Danmaku/Repo/TokenBlacklist)"
    else
        warn "部分关键表缺失: ${missing[*]}"
        warn "可运行 node migrate-db.cjs 自动建表/补列"
    fi
}

usage() {
    head -24 "$0" | tail -22
}

# ======================== 主流程 ========================

main() {
    local cmd="${1:-help}"
    shift || true

    case "$cmd" in
        backup)  cmd_backup "${1:-$BACKUP_ROOT}" ;;
        restore) cmd_restore "${1:-}" ;;
        list)    cmd_list "${1:-$BACKUP_ROOT}" ;;
        verify)  cmd_verify ;;
        help|-h|--help) usage ;;
        *)
            error "未知命令: $cmd"
            usage
            exit 1
            ;;
    esac
}

main "$@"
