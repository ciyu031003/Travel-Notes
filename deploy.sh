#!/bin/bash
# ============================================================================
#  Travel-Notes 一键部署脚本
#  用法: ./deploy.sh [选项]
#
#  选项:
#    --clean        清理 node_modules 后重新安装（解决依赖损坏问题）
#    --skip-pull    跳过 git pull（已手动拉取代码时使用）
#    --no-backup    跳过数据库备份（不推荐，首次部署可用）
#    --skip-build   跳过构建步骤（仅更新配置/重启时使用）
#    --force        跳过所有确认提示，直接执行
#    --help         显示帮助信息
#
#  示例:
#    ./deploy.sh                 # 标准部署
#    ./deploy.sh --clean         # 清理后重新安装依赖
#    ./deploy.sh --skip-pull     # 不拉取代码，仅构建+重启
#    ./deploy.sh --force         # 全自动，无确认提示
# ============================================================================
set -euo pipefail

# ======================== 配置区 ========================
APP_NAME="travel-notes"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$APP_DIR/logs"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DEPLOY_LOG="$LOG_DIR/deploy-${TIMESTAMP}.log"
BACKUP_DIR="$APP_DIR/.deploy-backup"
DB_BACKUP_DIR="$BACKUP_DIR/db"
NODE_REQUIRED=18
NODE_RECOMMENDED=20

# 解析 .env 中的 DATABASE_URL（用于数据库备份）
DATABASE_URL=""
if [ -f "$APP_DIR/.env" ]; then
    DATABASE_URL=$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" 2>/dev/null | sed 's/^DATABASE_URL=//' | tr -d '"' || true)
fi

# ======================== 颜色定义 ========================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ======================== 参数解析 ========================
CLEAN_INSTALL=false
SKIP_PULL=false
SKIP_BACKUP=false
SKIP_BUILD=false
FORCE=false

for arg in "$@"; do
    case "$arg" in
        --clean)      CLEAN_INSTALL=true ;;
        --skip-pull)  SKIP_PULL=true ;;
        --no-backup)  SKIP_BACKUP=true ;;
        --skip-build) SKIP_BUILD=true ;;
        --force)      FORCE=true ;;
        --help|-h)
            head -25 "$0" | tail -23
            exit 0
            ;;
        *)
            echo -e "${RED}未知参数: $arg${NC}"
            echo "使用 --help 查看帮助"
            exit 1
            ;;
    esac
done

# ======================== 工具函数 ========================

# 同时输出到终端和日志文件
log() {
    echo -e "$1" | tee -a "$DEPLOY_LOG"
}

log_info()    { log "${GREEN}[INFO]${NC} $1"; }
log_warn()    { log "${YELLOW}[WARN]${NC} $1"; }
log_error()   { log "${RED}[ERROR]${NC} $1"; }
log_step()    { log "\n${CYAN}══════════════════════════════════════════════════${NC}"; \
                log "${CYAN}  $1${NC}"; \
                log "${CYAN}══════════════════════════════════════════════════${NC}\n"; }
log_success() { log "${GREEN}══════════════════════════════════════════════════${NC}"; \
                log "${GREEN}  ✅ $1${NC}"; \
                log "${GREEN}══════════════════════════════════════════════════${NC}\n"; }

# 确认提示
confirm() {
    if [ "$FORCE" = true ]; then
        return 0
    fi
    echo -ne "${YELLOW}$1 [Y/n] ${NC}"
    read -r response
    case "$response" in
        [nN][oO]|[nN]) return 1 ;;
        *) return 0 ;;
    esac
}

# 检测命令是否存在
has_cmd() {
    command -v "$1" &>/dev/null
}

# ======================== 初始化 ========================

init() {
    mkdir -p "$LOG_DIR" "$BACKUP_DIR" "$DB_BACKUP_DIR"

    log "${BOLD}Travel-Notes 部署脚本${NC}"
    log "时间: $(date '+%Y-%m-%d %H:%M:%S')"
    log "目录: $APP_DIR"
    log "日志: $DEPLOY_LOG"
    log ""

    # 检查是否在项目根目录
    if [ ! -f "$APP_DIR/package.json" ]; then
        log_error "未找到 package.json，请在项目根目录运行此脚本"
        exit 1
    fi

    # 检查 .env 文件
    if [ ! -f "$APP_DIR/.env" ]; then
        log_error "未找到 .env 文件！"
        log "  首次部署请参考 .env.example 创建配置："
        log "  cp .env.example .env && nano .env"
        exit 1
    fi

    log_info ".env 文件存在"
}

# ======================== 操作系统检测 ========================

detect_os() {
    log_step "检测操作系统"

    if [ -f /etc/os-release ]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        OS_ID="${ID:-unknown}"
        OS_VERSION="${VERSION_ID:-}"
        OS_NAME="${PRETTY_NAME:-$OS_ID}"
    elif [ -f /etc/redhat-release ]; then
        OS_ID="centos"
        OS_NAME=$(cat /etc/redhat-release)
    else
        OS_ID="unknown"
        OS_NAME="未知系统"
    fi

    log_info "操作系统: $OS_NAME"

    case "$OS_ID" in
        ubuntu|debian)
            PKG_MGR="apt"
            PKG_UPDATE="sudo apt-get update -qq"
            PKG_INSTALL="sudo apt-get install -y -qq"
            ;;
        centos|rhel|fedora|rocky|almalinux)
            PKG_MGR="yum"
            PKG_UPDATE=""
            PKG_INSTALL="sudo yum install -y -q"
            ;;
        *)
            log_warn "未识别的 Linux 发行版: $OS_ID，将尝试使用 apt/yum"
            if has_cmd apt-get; then
                PKG_MGR="apt"
                PKG_UPDATE="sudo apt-get update -qq"
                PKG_INSTALL="sudo apt-get install -y -qq"
            elif has_cmd yum; then
                PKG_MGR="yum"
                PKG_UPDATE=""
                PKG_INSTALL="sudo yum install -y -q"
            else
                log_error "无法确定包管理器，请手动安装所需依赖"
                exit 1
            fi
            ;;
    esac

    log_info "包管理器: $PKG_MGR"
}

# ======================== Node.js 检测与安装 ========================

check_node() {
    log_step "检查 Node.js"

    if has_cmd node; then
        NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
        NODE_FULL=$(node -v)
        NPM_VERSION=$(npm -v 2>/dev/null || echo "未安装")

        if [ "$NODE_VERSION" -lt "$NODE_REQUIRED" ]; then
            log_error "Node.js 版本过低: $NODE_FULL (需要 >= v$NODE_REQUIRED)"
            log "  Next.js 15 要求 Node.js >= 18"
            if confirm "是否自动升级到 Node.js v$NODE_RECOMMENDED？"; then
                install_node
            else
                log_error "请手动升级 Node.js 后重试"
                exit 1
            fi
        else
            log_info "Node.js: $NODE_FULL"
            log_info "npm: $NPM_VERSION"
        fi
    else
        log_error "未检测到 Node.js"
        if confirm "是否自动安装 Node.js v$NODE_RECOMMENDED？"; then
            install_node
        else
            log_error "请手动安装 Node.js >= v$NODE_REQUIRED 后重试"
            exit 1
        fi
    fi
}

install_node() {
    log_info "安装 Node.js v$NODE_RECOMMENDED..."

    # 清理旧版本残留（Ubuntu/Debian 常见坑）
    case "$OS_ID" in
        ubuntu|debian)
            log_info "清理旧版本残留..."
            sudo apt-get remove -y -qq nodejs npm libnode-dev libnode72 2>/dev/null || true
            sudo apt-get autoremove -y -qq 2>/dev/null || true
            sudo rm -rf /usr/include/node 2>/dev/null || true
            sudo rm -f /usr/bin/node /usr/bin/npm /usr/bin/npx 2>/dev/null || true

            log_info "添加 NodeSource 源..."
            curl -fsSL "https://deb.nodesource.com/setup_${NODE_RECOMMENDED}.x" | sudo -E bash - 2>&1 | tee -a "$DEPLOY_LOG"
            sudo apt-get install -y -qq nodejs 2>&1 | tee -a "$DEPLOY_LOG"
            ;;
        centos|rhel|fedora|rocky|almalinux)
            curl -fsSL "https://rpm.nodesource.com/setup_${NODE_RECOMMENDED}.x" | sudo bash - 2>&1 | tee -a "$DEPLOY_LOG"
            sudo yum install -y -q nodejs 2>&1 | tee -a "$DEPLOY_LOG"
            ;;
    esac

    # 验证安装
    if has_cmd node; then
        log_info "Node.js 安装成功: $(node -v)"
    else
        log_error "Node.js 安装失败，请手动安装"
        exit 1
    fi
}

# ======================== PM2 检测与安装 ========================

check_pm2() {
    log_step "检查 PM2"

    if has_cmd pm2; then
        log_info "PM2: $(pm2 --version 2>/dev/null || echo '已安装')"
    else
        log_warn "未检测到 PM2"
        if confirm "是否全局安装 PM2？"; then
            sudo npm install -g pm2 2>&1 | tee -a "$DEPLOY_LOG"
            log_info "PM2 安装成功"

            # 设置开机自启
            log_info "配置 PM2 开机自启..."
            pm2 startup systemd -u "$(whoami)" --hp "$HOME" 2>/dev/null | grep "sudo" | head -1 | bash 2>/dev/null || true
        else
            log_error "PM2 是必需的，请手动安装: sudo npm install -g pm2"
            exit 1
        fi
    fi
}

# ======================== Git 拉取代码 ========================

git_pull() {
    if [ "$SKIP_PULL" = true ]; then
        log_step "跳过 Git 拉取 (--skip-pull)"
        return 0
    fi

    log_step "拉取最新代码"

    # 检查是否在 git 仓库中
    if [ ! -d "$APP_DIR/.git" ]; then
        log_error "当前目录不是 Git 仓库"
        exit 1
    fi

    # 保存当前 commit（用于回滚）
    OLD_HEAD=$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo "")
    log_info "当前版本: ${OLD_HEAD:-unknown}"

    # 检查本地是否有未提交的修改
    if ! git -C "$APP_DIR" diff --quiet 2>/dev/null || ! git -C "$APP_DIR" diff --cached --quiet 2>/dev/null; then
        log_warn "检测到本地有未提交的修改"
        git -C "$APP_DIR" status --short | tee -a "$DEPLOY_LOG"
        if ! confirm "是否暂存本地修改并继续拉取？"; then
            log_error "请先处理本地修改后重试"
            exit 1
        fi
        git -C "$APP_DIR" stash 2>&1 | tee -a "$DEPLOY_LOG"
        log_info "本地修改已暂存"
    fi

    # 拉取代码
    git -C "$APP_DIR" pull 2>&1 | tee -a "$DEPLOY_LOG"

    NEW_HEAD=$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo "")
    log_info "更新到版本: ${NEW_HEAD:-unknown}"

    if [ "$OLD_HEAD" = "$NEW_HEAD" ] && [ -n "$OLD_HEAD" ]; then
        log_warn "代码无变化（已在最新版本）"
    fi

    # 恢复暂存的修改（如果有）
    if git -C "$APP_DIR" stash list | grep -q . 2>/dev/null; then
        git -C "$APP_DIR" stash pop 2>&1 | tee -a "$DEPLOY_LOG" || true
        log_info "本地修改已恢复"
    fi
}

# ======================== 数据库备份 ========================

backup_database() {
    if [ "$SKIP_BACKUP" = true ]; then
        log_step "跳过数据库备份 (--no-backup)"
        return 0
    fi

    log_step "备份数据库"

    if [ -z "$DATABASE_URL" ]; then
        log_warn "未找到 DATABASE_URL，跳过数据库备份"
        return 0
    fi

    if ! has_cmd mysqldump; then
        log_warn "未安装 mysqldump，跳过数据库备份"
        log "  安装方法: $PKG_INSTALL mysql-client"
        return 0
    fi

    # 解析 DATABASE_URL
    # 格式: mysql://user:password@host:port/database
    local db_url="${DATABASE_URL#mysql://}"
    local db_user db_pass db_host db_port db_name

    db_user=$(echo "$db_url" | sed -E 's/^([^:]+):.*/\1/')
    db_pass=$(echo "$db_url" | sed -E 's/^[^:]+:([^@]+)@.*/\1/')
    db_host=$(echo "$db_url" | sed -E 's/.*@([^:]+):.*/\1/')
    db_port=$(echo "$db_url" | sed -E 's/.*:([0-9]+)\/.*/\1/')
    db_name=$(echo "$db_url" | sed -E 's/.*\/(.*)$/\1/')

    if [ -z "$db_name" ] || [ "$db_name" = "$db_url" ]; then
        log_warn "无法解析数据库名称，跳过备份"
        return 0
    fi

    local backup_file="$DB_BACKUP_DIR/${db_name}_${TIMESTAMP}.sql"

    log_info "备份 $db_name → $backup_file"

    if mysqldump -u"$db_user" -p"$db_pass" -h"$db_host" -P"$db_port" \
        --single-transaction --quick --routines --triggers \
        "$db_name" > "$backup_file" 2>>"$DEPLOY_LOG"; then
        local size
        size=$(du -h "$backup_file" | cut -f1)
        log_info "备份成功 (${size})"

        # 保留最近 10 个备份
        ls -t "$DB_BACKUP_DIR"/*.sql 2>/dev/null | tail -n +11 | while read -r old_file; do
            rm -f "$old_file"
            log_info "清理旧备份: $(basename "$old_file")"
        done
    else
        log_warn "数据库备份失败（将继续部署，建议手动检查）"
    fi
}

# ======================== 安装依赖 ========================

install_deps() {
    log_step "安装项目依赖"

    if [ "$CLEAN_INSTALL" = true ]; then
        log_info "清理模式: 删除 node_modules 和 lock 文件..."
        rm -rf "$APP_DIR/node_modules"
        rm -f "$APP_DIR/package-lock.json"
        log_info "清理完成"
    fi

    log_info "安装依赖 (--legacy-peer-deps)..."
    log "  注: --legacy-peer-deps 用于解决 lucide-react@0.344.0 与 React 19 的 peer dependency 冲突"

    cd "$APP_DIR"
    npm install --legacy-peer-deps 2>&1 | tee -a "$DEPLOY_LOG"

    log_info "依赖安装完成"
}

# ======================== Prisma 生成与数据库同步 ========================

sync_database() {
    log_step "同步 Prisma Client 和数据库结构"

    cd "$APP_DIR"

    # 生成 Prisma Client（每次都执行，确保类型定义与 schema.prisma 一致）
    log_info "生成 Prisma Client..."
    npx prisma generate 2>&1 | tee -a "$DEPLOY_LOG"
    log_info "Prisma Client 生成完成"

    # 同步数据库结构（处理表结构变更：新增字段、修改类型等）
    log_info "同步数据库结构 (prisma db push)..."
    npx prisma db push 2>&1 | tee -a "$DEPLOY_LOG"
    log_info "数据库结构同步完成"
}

# ======================== 构建项目 ========================

build_project() {
    if [ "$SKIP_BUILD" = true ]; then
        log_step "跳过构建 (--skip-build)"
        return 0
    fi

    log_step "构建项目"

    cd "$APP_DIR"

    log_info "开始构建 (npm run build)..."
    log "  构建可能需要 2-5 分钟，请耐心等待..."

    if npm run build 2>&1 | tee -a "$DEPLOY_LOG"; then
        log_info "构建成功"
    else
        log_error "构建失败！"
        log "  常见原因："
        log "  1. Node.js 版本过低 (需要 >= v18)"
        log "  2. 内存不足 (建议添加 Swap)"
        log "  3. TypeScript 类型错误 (检查是否执行了 prisma generate)"
        log "  4. 依赖损坏 (尝试 ./deploy.sh --clean)"
        exit 1
    fi
}

# ======================== PM2 重启 ========================

restart_pm2() {
    log_step "重启 PM2 服务"

    cd "$APP_DIR"

    # 检查 PM2 进程是否已存在
    if pm2 describe "$APP_NAME" &>/dev/null; then
        log_info "重启现有进程: $APP_NAME"
        pm2 restart "$APP_NAME" 2>&1 | tee -a "$DEPLOY_LOG"
    else
        log_info "首次启动: 使用 ecosystem.config.js"
        if [ -f "$APP_DIR/ecosystem.config.js" ]; then
            pm2 start "$APP_DIR/ecosystem.config.js" 2>&1 | tee -a "$DEPLOY_LOG"
        else
            log_warn "未找到 ecosystem.config.js，使用默认方式启动"
            pm2 start npm --name "$APP_NAME" -- start 2>&1 | tee -a "$DEPLOY_LOG"
        fi
    fi

    # 保存进程列表（确保开机自启）
    pm2 save 2>&1 | tee -a "$DEPLOY_LOG" || true

    log_info "PM2 服务已启动"
}

# ======================== Nginx 检查 ========================

check_nginx() {
    log_step "检查 Nginx"

    if ! has_cmd nginx; then
        log_warn "未安装 Nginx，跳过检查"
        log "  如需 Nginx 反向代理，请参考 docs/SERVER_SETUP.md"
        return 0
    fi

    # 检查 Nginx 配置语法
    if sudo nginx -t 2>&1 | tee -a "$DEPLOY_LOG"; then
        log_info "Nginx 配置正常"

        # 检查 client_max_body_size 配置（图片上传需要）
        local nginx_conf_dir="/etc/nginx/conf.d"
        local has_body_size=false
        if [ -d "$nginx_conf_dir" ]; then
            if grep -r "client_max_body_size" "$nginx_conf_dir" 2>/dev/null | grep -q .; then
                has_body_size=true
            fi
        fi
        if [ "$has_body_size" = false ]; then
            log_warn "未检测到 client_max_body_size 配置"
            log "  图片上传功能需要设置 client_max_body_size 20m;"
            log "  请在 Nginx 站点配置中添加此指令"
        fi

        # 重载 Nginx（配置可能有更新）
        if sudo systemctl is-active --quiet nginx 2>/dev/null; then
            sudo systemctl reload nginx 2>&1 | tee -a "$DEPLOY_LOG" || true
            log_info "Nginx 已重载"
        else
            sudo systemctl start nginx 2>&1 | tee -a "$DEPLOY_LOG" || true
            log_info "Nginx 已启动"
        fi
    else
        log_error "Nginx 配置检查失败，请检查配置文件"
        log "  Nginx 未重载，但应用已启动，可通过 3000 端口直接访问"
    fi
}

# ======================== 健康检查 ========================

health_check() {
    log_step "健康检查"

    local max_retries=6
    local wait_seconds=5
    local url="http://localhost:3000"

    log_info "等待应用启动..."

    for i in $(seq 1 $max_retries); do
        sleep $wait_seconds

        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")

        if [ "$http_code" = "200" ] || [ "$http_code" = "302" ]; then
            log_info "应用已启动 (HTTP $http_code)"
            log_success "部署成功！"
            return 0
        else
            log_warn "第 $i/$max_retries 次检查: HTTP $http_code，等待重试..."
        fi
    done

    log_error "应用未在预期时间内启动"
    log "  排查步骤："
    log "  1. 查看日志: pm2 logs $APP_NAME --lines 50"
    log "  2. 检查端口: sudo lsof -i :3000"
    log "  3. 检查内存: free -h"
    log "  4. 查看部署日志: $DEPLOY_LOG"
    return 1
}

# ======================== 回滚 ========================

rollback() {
    log_step "回滚到上一个版本"

    if [ -z "${OLD_HEAD:-}" ]; then
        log_warn "无回滚目标版本，跳过回滚"
        return 0
    fi

    local current_head
    current_head=$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo "")

    if [ "$current_head" = "$OLD_HEAD" ]; then
        log_info "当前版本与旧版本相同，无需回滚"
        return 0
    fi

    log_warn "回滚到版本: $OLD_HEAD"
    if confirm "确认回滚到 $OLD_HEAD？"; then
        git -C "$APP_DIR" checkout "$OLD_HEAD" 2>&1 | tee -a "$DEPLOY_LOG"
        log_info "已回滚到 $OLD_HEAD"

        # 重新生成 Prisma Client 和构建
        log_info "重新生成 Prisma Client..."
        cd "$APP_DIR"
        npx prisma generate 2>&1 | tee -a "$DEPLOY_LOG" || true

        log_info "重新构建..."
        npm run build 2>&1 | tee -a "$DEPLOY_LOG" || log_warn "回滚后构建失败"

        log_info "重启 PM2..."
        pm2 restart "$APP_NAME" 2>&1 | tee -a "$DEPLOY_LOG" || true

        log_warn "回滚完成，请检查应用状态"
    else
        log_warn "用户取消回滚，当前代码保持在失败状态"
        log "  手动回滚: git checkout $OLD_HEAD && npm run build && pm2 restart $APP_NAME"
    fi
}

# ======================== 错误处理 ========================

on_error() {
    local exit_code=$?
    local line_no=$1
    log_error "部署过程中出错 (行: $line_no, 退出码: $exit_code)"
    log "  完整日志: $DEPLOY_LOG"

    # 如果构建失败，尝试回滚
    rollback

    log_error "部署失败"
    exit 1
}

# ======================== 主流程 ========================

main() {
    # 初始化
    init

    # 设置错误陷阱（在 init 之后，确保日志目录已创建）
    trap 'on_error $LINENO' ERR

    # 环境检测与准备
    detect_os
    check_node
    check_pm2

    # 部署步骤
    git_pull

    # 备份代码版本（用于回滚）
    OLD_HEAD="${OLD_HEAD:-$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo "")}"

    backup_database
    install_deps
    sync_database
    build_project
    restart_pm2
    check_nginx
    health_check

    # 部署完成
    log ""
    log_info "部署日志: $DEPLOY_LOG"
    log_info "PM2 状态:"
    pm2 list 2>/dev/null | tee -a "$DEPLOY_LOG" || true
}

main "$@"
