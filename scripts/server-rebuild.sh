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
#   SKIP_BACKUP_CHECK=1             跳过「最近数据库备份 <26h」检查（不推荐）
#   BACKUP_MAX_AGE_HOURS=26         备份最大允许年龄（小时）
# ============================================================================
set -euo pipefail

PROJECT_DIR="/home/ubuntu/travel-notes"
TARBALL="${TARBALL:-/tmp/tn-deploy.tar.gz}"
MIN_FREE_MB="${MIN_FREE_MB:-8000}"
SKIP_CLEAN="${SKIP_CLEAN:-0}"
SKIP_BACKUP_CHECK="${SKIP_BACKUP_CHECK:-0}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"

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

step "[$(ts)] ③ 部署前检查最近数据库备份（<${BACKUP_MAX_AGE_HOURS}h）"
# P0-9：没有可用备份就不允许发布 —— 回滚镜像容易，回滚数据不可能。
if [ "$SKIP_BACKUP_CHECK" = "1" ]; then
  echo "⚠️  已按 SKIP_BACKUP_CHECK=1 跳过备份检查（不推荐，风险自负）"
elif [ ! -f scripts/backup-db.sh ]; then
  echo "❌ 找不到 scripts/backup-db.sh（本次是首次上线该脚本？）。" >&2
  echo "   请先手动备份：docker compose exec -T -e MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" db mysqldump -uroot --single-transaction travel_notes | gzip > backups/db/manual-\$(date +%Y%m%d-%H%M%S).sql.gz" >&2
  echo "   或确认风险后用 SKIP_BACKUP_CHECK=1 跳过本次检查。" >&2
  exit 1
else
  BACKUP_MAX_AGE_HOURS="$BACKUP_MAX_AGE_HOURS" bash scripts/backup-db.sh --check
fi

step "[$(ts)] ④ 解包部署内容"
if [ ! -f "$TARBALL" ]; then
  echo "❌ 找不到部署包: $TARBALL" >&2
  exit 1
fi
# 解包前清理「本轮确实删掉的源码」：tar -x 是"覆盖"而不是"同步"，
# 已删除的组件会留在服务器源码目录（曾观察到 components/album/reader/ArtPage.tsx 残留）。
#
# ⚠️ 范围必须严格限定：只同步**会进构建产物**的目录，且只删**源码扩展名**。
# 2026-09-16 教训：早先版本把 `docs` 也纳入了扫描，导致服务器上一批只存在于服务器、
# 并不在归档里的历史文档被当成"已删除文件"删掉（zsh 的 `find docs` 列出了它们，
# 而归档里没有 → comm 判为 stale）。文档不进构建产物，不该被部署流程删除。
# 因此白名单刻意**不含 docs**；markdown 也从扩展名里去掉。
MANIFEST=$(mktemp)
PRESENT=$(mktemp)
STALE=$(mktemp)
tar -tzf "$TARBALL" | sed 's#^\./##' | grep -v '/$' | sort > "$MANIFEST"

for dir in app components lib hooks prisma types; do
  [ -d "$PROJECT_DIR/$dir" ] || continue
  ( cd "$PROJECT_DIR" && find "$dir" -type f \
      \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.cjs' -o -name '*.mjs' \
         -o -name '*.css' -o -name '*.prisma' \) \
      | sort ) > "$PRESENT"
  comm -23 "$PRESENT" "$MANIFEST" > "$STALE"
  while IFS= read -r stale; do
    [ -z "$stale" ] && continue
    echo "  移除归档中已不存在的源码文件: $stale"
    rm -f "$PROJECT_DIR/$stale"
  done < "$STALE"
done
rm -f "$MANIFEST" "$PRESENT" "$STALE"

tar -xzf "$TARBALL" -C "$PROJECT_DIR"
echo "解包完成: $TARBALL"

step "[$(ts)] ⑤ 重建应用容器（不影响 db 与其他项目）"
# 记录部署前镜像：健康检查失败时唯一的回滚依据（compose build 会覆盖同名镜像 tag）
PREV_IMAGE_ID="$(sudo docker inspect --format '{{.Image}}' travel-notes-app 2>/dev/null || true)"
PREV_IMAGE_TAG="$(sudo docker inspect --format '{{.Config.Image}}' travel-notes-app 2>/dev/null || true)"
if [ -n "$PREV_IMAGE_ID" ]; then
  sudo docker tag "$PREV_IMAGE_ID" travel-notes-app:previous 2>/dev/null || true
  echo "部署前镜像: $PREV_IMAGE_ID（tag: ${PREV_IMAGE_TAG:-<未知>}，已另存为 travel-notes-app:previous）"
  echo "手工回滚命令: sudo docker tag travel-notes-app:previous ${PREV_IMAGE_TAG:-travel-notes_app} && sudo docker compose up -d --no-build --force-recreate app"
else
  echo "部署前镜像: <未找到，可能是首次部署>"
fi

sudo docker compose up -d --build app 2>&1 | tail -8
echo "部署后镜像: $(sudo docker inspect --format '{{.Image}}' travel-notes-app 2>/dev/null || echo '<未找到>')"

step "[$(ts)] ⑥ 健康检查（失败即中止，不再打印「完成」）"
sleep 5
HEALTH_OK=0
i=1
while [ "$i" -le 12 ]; do
  if curl -fsS -H "Host: travel-notes.yuanabd.cn" "https://127.0.0.1/api/health" -o /dev/null -w "health: HTTP %{http_code}\n"; then
    HEALTH_OK=1
    break
  fi
  echo "  第 $i 次健康检查未通过，5s 后重试..." >&2
  i=$((i + 1))
  sleep 5
done

echo
echo "容器状态:"
sudo docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'travel-notes|learn-workbench' || true

if [ "$HEALTH_OK" != "1" ]; then
  echo "" >&2
  echo "❌ 健康检查失败：60s 内 /api/health 未返回 2xx，部署中止（镜像已构建，但服务未确认可用）。" >&2
  echo "--- docker compose logs --tail 80 app ---" >&2
  sudo docker compose logs --tail 80 app >&2 || true
  if [ -n "${PREV_IMAGE_ID:-}" ]; then
    echo "" >&2
    echo "--- 回滚到部署前镜像 ---" >&2
    echo "sudo docker tag travel-notes-app:previous ${PREV_IMAGE_TAG:-travel-notes_app}" >&2
    echo "sudo docker compose up -d --no-build --force-recreate app" >&2
    echo "或一键：sudo docker tag travel-notes-app:previous ${PREV_IMAGE_TAG:-travel-notes_app} && sudo docker compose up -d --no-build --force-recreate app" >&2
  else
    echo "没有部署前镜像可回滚（首次部署），请修复问题后重新执行部署。" >&2
  fi
  exit 1
fi

echo
echo "✅ 健康检查通过（/api/health 2xx）"
step "[$(ts)] 完成"
df -h / | tail -1
