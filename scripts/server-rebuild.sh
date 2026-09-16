#!/usr/bin/env bash
# ============================================================================
# 服务器端「安全清盘 → 解包 → 重建」一键流程
#
# 为什么要脚本化：2026-09-15 因磁盘被 containerd 泄漏快照打满，
# 构建在导出镜像阶段失败，并波及同机另一项目。手工流程容易漏掉清盘这一步，
# 因此把「先清盘」固化为重建的前置步骤。
#
# 用法（本地打包上传后，在服务器执行）：
#   scp /tmp/tn-deploy.tar.gz travel-notes:/tmp/
#   ssh travel-notes "bash /home/ubuntu/travel-notes/scripts/server-rebuild.sh"
#
# 可选环境变量：
#   TARBALL=/tmp/tn-deploy.tar.gz   部署包路径
#   SKIP_CLEAN=1                    跳过清盘（不推荐）
#   MIN_FREE_MB=8000                构建前要求的最小可用空间（MB），不足则中止
# ============================================================================
set -euo pipefail

PROJECT_DIR="/home/ubuntu/travel-notes"
TARBALL="${TARBALL:-/tmp/tn-deploy.tar.gz}"
MIN_FREE_MB="${MIN_FREE_MB:-8000}"
SKIP_CLEAN="${SKIP_CLEAN:-0}"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
step() { echo; echo "===== $* ====="; }
avail_mb() { df -Pk / | awk 'NR==2{print int($4/1024)}'; }

cd "$PROJECT_DIR"

step "[$(ts)] ① 构建前磁盘清理（只清缓存垃圾，不影响其他项目）"
if [ "$SKIP_CLEAN" = "1" ]; then
  echo "已按 SKIP_CLEAN=1 跳过（不推荐）"
else
  bash scripts/disk-clean.sh | tail -6
fi

step "[$(ts)] ② 构建前空间校验"
FREE=$(avail_mb)
echo "当前可用: ${FREE}MB（要求 ≥ ${MIN_FREE_MB}MB）"
if [ "$FREE" -lt "$MIN_FREE_MB" ]; then
  echo "❌ 可用空间不足，已中止构建 —— 避免重现「磁盘打满导致构建失败 + 波及同机项目」。" >&2
  echo "   可先排查：mount | grep containerd-mount（泄漏挂载点）/ docker system df" >&2
  exit 1
fi

step "[$(ts)] ③ 解包部署内容"
if [ ! -f "$TARBALL" ]; then
  echo "❌ 找不到部署包: $TARBALL" >&2
  exit 1
fi
# 解包前先记录归档内的路径清单：tar -x 是"覆盖"而不是"同步"，
# 上一次部署过、这一次被删除的文件会**留在服务器上**（曾出现已删除组件残留在
# 服务器源码目录，虽然不进构建产物，但会误导排障与后续增量对比）。
MANIFEST=$(mktemp)
PRESENT=$(mktemp)
STALE=$(mktemp)
tar -tzf "$TARBALL" | sed 's#^\./##' | grep -v '/$' | sort > "$MANIFEST"

# 只清理"归档里已不存在"的源码文件；不碰 .env / data / logs / node_modules 等运行期文件
# （它们不在归档里，也不在下面的扫描白名单内）。
for dir in app components lib hooks scripts prisma data types docs; do
  [ -d "$PROJECT_DIR/$dir" ] || continue
  ( cd "$PROJECT_DIR" && find "$dir" -type f \
      \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.cjs' -o -name '*.mjs' \
         -o -name '*.css' -o -name '*.json' -o -name '*.prisma' -o -name '*.md' \) \
      | sort ) > "$PRESENT"
  comm -23 "$PRESENT" "$MANIFEST" > "$STALE"
  while IFS= read -r stale; do
    [ -z "$stale" ] && continue
    echo "  移除归档中已不存在的文件: $stale"
    rm -f "$PROJECT_DIR/$stale"
  done < "$STALE"
done
rm -f "$MANIFEST" "$PRESENT" "$STALE"

tar -xzf "$TARBALL" -C "$PROJECT_DIR"
echo "解包完成: $TARBALL"

step "[$(ts)] ④ 重建应用容器（不影响 db 与其他项目）"
sudo docker compose up -d --build app 2>&1 | tail -8

step "[$(ts)] ⑤ 健康检查"
sleep 8
curl -s -H "Host: travel-notes.yuanabd.cn" "https://127.0.0.1/api/health" || true
echo
echo "容器状态:"
sudo docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'travel-notes|learn-workbench' || true

step "[$(ts)] 完成"
df -h / | tail -1
