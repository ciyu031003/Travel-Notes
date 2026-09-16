#!/usr/bin/env bash
# ============================================================================
# travel-notes 服务器磁盘清理（安全版）
#
# 设计原则 —— 只清「无用的缓存与垃圾」，绝不触碰：
#   1. 任何数据卷（mysql-data / postgres / uploads…）—— 本脚本不含 volume prune
#   2. 其他项目的镜像 / 容器 / 网络 —— 只对 dangling 镜像动手，
#      不使用 `docker image prune -a`（那会删掉其他项目「未运行但可能要用」的镜像）
#   3. 运行中容器使用的任何资源 —— 关键步骤均带「占用校验」
#
# 背景：2026-09-15 生产磁盘被打满（100%），构建在导出镜像阶段失败，
#       并导致同机另一项目 learn-workbench-web 被终止后自动重启。
#       根因是 containerd 泄漏快照（33G）+ 失败构建残留的 /tmp/containerd-mount*（4.4G）。
#       仅靠 `docker builder prune -af` 回收 0B —— 必须显式卸载泄漏挂载点。
#
# 用法：
#   bash scripts/disk-clean.sh            # 常规清理（构建/部署前执行）
#   DRY_RUN=1 bash scripts/disk-clean.sh  # 只报告不删除
# ============================================================================
set -uo pipefail

PROJECT_DIR="/home/ubuntu/travel-notes"
LOG="$PROJECT_DIR/logs/disk-clean.log"
DRY_RUN="${DRY_RUN:-0}"
# /tmp 里本项目的历史部署包保留天数
TMP_KEEP_DAYS="${TMP_KEEP_DAYS:-1}"

mkdir -p "$(dirname "$LOG")"
ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" | tee -a "$LOG"; }
run() {
  if [ "$DRY_RUN" = "1" ]; then
    log "  (dry-run) $*"
  else
    "$@" >>"$LOG" 2>&1
  fi
}
avail_mb() { df -Pk / | awk 'NR==2{print int($4/1024)}'; }
used_pct() { df -Pk / | awk 'NR==2{gsub("%","",$5); print $5}'; }

BEFORE_MB=$(avail_mb)
{
  echo "===== $(ts) disk-clean start (dry_run=$DRY_RUN) ====="
  df -h / | tail -1
} >> "$LOG"
log "起始可用: ${BEFORE_MB}MB (已用 $(used_pct)%)"

# ---------------------------------------------------------------------------
# 1) Docker 构建缓存
#    这是最大头；注意它**不含**镜像与卷，安全。
# ---------------------------------------------------------------------------
log "① 清理 docker 构建缓存"
run docker builder prune -af
run docker buildx prune -af

# ---------------------------------------------------------------------------
# 2) 仅清理 dangling（无 tag、无引用的）镜像
#    刻意不用 `image prune -a`：那会删除「未被任何运行中容器使用」的带 tag 镜像，
#    可能误伤同机其他项目的备用镜像。
# ---------------------------------------------------------------------------
log "② 清理 dangling 镜像（不动带 tag 的其他项目镜像）"
run docker image prune -f

# ---------------------------------------------------------------------------
# 3) /tmp 中「本项目」的历史部署包与旧安装包
#    只匹配本项目命名前缀，且只删超过保留天数的；不用通配大扫除。
# ---------------------------------------------------------------------------
log "③ 清理 /tmp 本项目历史部署包（>${TMP_KEEP_DAYS}天）"
if [ "$DRY_RUN" = "1" ]; then
  find /tmp -maxdepth 1 -type f \( -name 'tn-*.tar.gz' -o -name 'tn-deploy*.tar.gz' \) -mtime "+${TMP_KEEP_DAYS}" -print 2>/dev/null | sed 's/^/  (dry-run) /' | tee -a "$LOG"
else
  find /tmp -maxdepth 1 -type f \( -name 'tn-*.tar.gz' -o -name 'tn-deploy*.tar.gz' \) -mtime "+${TMP_KEEP_DAYS}" -print -delete >>"$LOG" 2>&1
fi

# ---------------------------------------------------------------------------
# 4) containerd 泄漏挂载点（失败构建遗留）——本次事故的关键项
#    安全前提：逐个确认「没有任何运行中容器」正在使用该挂载点，否则跳过。
#    注意：这些是只读 overlay 挂载点，`rm -rf` 会报 "Read-only file system"，
#          必须**先 umount**；卸载后空间由 containerd GC 回收。
# ---------------------------------------------------------------------------
log "④ 检查 containerd 泄漏挂载点"
LEAKED=$(mount | grep -oE '/tmp/containerd-mount[0-9]+' || true)
if [ -z "$LEAKED" ]; then
  log "  无泄漏挂载点"
else
  # 汇总所有「运行中容器」的挂载来源，用于占用校验
  IN_USE=""
  for cid in $(docker ps -q 2>/dev/null); do
    IN_USE="$IN_USE $(docker inspect -f '{{range .Mounts}}{{.Source}} {{end}}' "$cid" 2>/dev/null)"
  done
  for mp in $LEAKED; do
    if echo "$IN_USE" | grep -q "$mp"; then
      log "  跳过（有运行中容器在使用）: $mp"
      continue
    fi
    log "  卸载并清理: $mp"
    if [ "$DRY_RUN" != "1" ]; then
      umount "$mp" 2>>"$LOG" || umount -l "$mp" 2>>"$LOG" || true
      rm -rf "$mp" 2>>"$LOG" || true
    fi
  done
fi

# ---------------------------------------------------------------------------
# 5) 宿主机温和回收（不影响任何服务）
# ---------------------------------------------------------------------------
log "⑤ apt 缓存 / journal 日志（保留 3 天）"
run sudo apt-get clean
run sudo journalctl --vacuum-time=3d

# ---------------------------------------------------------------------------
# 6) 结果
# ---------------------------------------------------------------------------
AFTER_MB=$(avail_mb)
log "结束可用: ${AFTER_MB}MB (已用 $(used_pct)%) — 本次释放 $((AFTER_MB - BEFORE_MB))MB"
{
  echo "-- 容器（应全部 Up，含其他项目）--"
  docker ps --format '{{.Names}}\t{{.Status}}' 2>/dev/null | grep -E 'travel-notes|learn-workbench' || true
  echo "===== $(ts) disk-clean end ====="
} >> "$LOG"

tail -8 "$LOG"
