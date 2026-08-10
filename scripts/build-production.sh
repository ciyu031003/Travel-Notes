#!/bin/bash
# ============================================================================
#  Travel-Notes 低内存构建脚本（面向 2C2G 服务器）
#
#  作用：
#    1. 限制 Node.js 堆内存，避免构建时 OOM
#    2. 构建阶段跳过数据库读取（SKIP_DB_ON_BUILD=1），大幅降低内存峰值与耗时
#    3. 自动检测/提示 Swap 交换分区（内存不足时的兜底）
#    4. 构建失败后清理缓存自动重试一次
#
#  用法:
#    ./scripts/build-production.sh              # 标准低内存构建
#    NODE_OPTIONS=... ./scripts/build-production.sh   # 自定义 Node 堆内存
#    SKIP_TSC=1 ./scripts/build-production.sh  # 极端低内存时跳过类型检查（不推荐）
# ============================================================================
set -euo pipefail

# ======================== 配置区 ========================
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BUILD_LOG="$LOG_DIR/build-${TIMESTAMP}.log"

# Node 堆内存上限（MB）。2G 内存建议 1536；可自定义：
#   BUILD_NODE_MAX_OLD_SPACE=1024 ./scripts/build-production.sh
BUILD_NODE_MAX_OLD_SPACE="${BUILD_NODE_MAX_OLD_SPACE:-1536}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

log()    { echo -e "$1" | tee -a "$BUILD_LOG"; }
info()   { log "${GREEN}[INFO]${NC} $1"; }
warn()   { log "${YELLOW}[WARN]${NC} $1"; }
error()  { log "${RED}[ERROR]${NC} $1"; }
step()   { log "\n${CYAN}══════════════════════════════════════════${NC}\n${CYAN}  $1${NC}\n${CYAN}══════════════════════════════════════════${NC}"; }

# ======================== 内存检测 ========================

check_memory() {
    step "检查服务器内存"

    local total_mem_kb swap_total_kb
    total_mem_kb=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
    swap_total_kb=$(grep SwapTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
    local total_mem_mb=$((total_mem_kb / 1024))
    local swap_total_mb=$((swap_total_kb / 1024))

    info "物理内存: ${total_mem_mb}MB / 交换分区: ${swap_total_mb}MB"

    if [ "$total_mem_mb" -lt 2048 ] && [ "$swap_total_mb" -lt 2048 ]; then
        warn "内存不足且缺少 Swap：建议先创建 Swap 再构建（参考 docs/SERVER_SETUP.md）"
        warn "  创建 2G Swap: sudo fallocate -l 2G /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile"
    elif [ "$total_mem_mb" -lt 4096 ]; then
        info "内存有限，将使用低内存构建模式（Node 堆上限 ${BUILD_NODE_MAX_OLD_SPACE}MB，构建跳过数据库读取）"
    fi
}

# ======================== 清理缓存 ========================

clean_cache() {
    if [ -d "$APP_DIR/.next" ]; then
        info "清理旧构建缓存 .next ..."
        rm -rf "$APP_DIR/.next"
    fi
}

# ======================== 构建 ========================

do_build() {
    cd "$APP_DIR"

    # 生成 Prisma Client（确保与 schema.prisma 一致）
    info "生成 Prisma Client..."
    npx prisma generate 2>&1 | tee -a "$BUILD_LOG"

    # 低内存构建：
    #  - NODE_OPTIONS 限制 V8 堆内存上限（配合 Swap 避免 OOM）
    #  - SKIP_DB_ON_BUILD=1 让 next build 阶段跳过数据库读取（页面先预渲染轻量壳，运行时 ISR 生成真实内容）
    #  - 保留 next build 自动设置的 NEXT_PHASE=phase-production-build 供数据库短路判断
    info "开始构建 (Node 堆上限 ${BUILD_NODE_MAX_OLD_SPACE}MB, 跳过数据库读取)..."
    log "  日志: $BUILD_LOG"

    if NODE_OPTIONS="--max-old-space-size=${BUILD_NODE_MAX_OLD_SPACE}" \
       SKIP_DB_ON_BUILD=1 \
       npm run build 2>&1 | tee -a "$BUILD_LOG"; then
        return 0
    fi
    return 1
}

build_with_retry() {
    if do_build; then
        return 0
    fi

    warn "首次构建失败，清理缓存后重试一次..."
    clean_cache
    sleep 2
    if do_build; then
        return 0
    fi
    return 1
}

# ======================== 主流程 ========================

main() {
    step "Travel-Notes 低内存构建"
    info "目录: $APP_DIR"
    info "日志: $BUILD_LOG"

    check_memory
    clean_cache

    if build_with_retry; then
        info "构建成功！产物: $APP_DIR/.next"
        log ""
        info "提示：构建期间跳过了数据库读取，部署完成后建议执行一次「预热」"
        info "      使 ISR 页面立即生成真实内容（deploy.sh 已内置预热）"
        return 0
    else
        error "构建失败！完整日志: $BUILD_LOG"
        log "  排查建议："
        log "  1. 检查内存: free -h（2G 内存建议配置 2-4G Swap）"
        log "  2. 减小 Node 堆上限: BUILD_NODE_MAX_OLD_SPACE=1024 ./scripts/build-production.sh"
        log "  3. 依赖损坏: cd .. && npm install --legacy-peer-deps"
        return 1
    fi
}

main "$@"
