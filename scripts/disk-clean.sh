#!/usr/bin/env bash
# travel-notes 服务器磁盘定期清理脚本
# 目标：防止 docker 构建缓存/悬空镜像累积导致磁盘打满、部署失败
# 说明：只清 docker 构建缓存与未使用镜像，绝不触碰数据卷(mysql-data / uploads-data)

set -uo pipefail

LOG="/home/ubuntu/travel-notes/logs/disk-clean.log"
mkdir -p "$(dirname "$LOG")"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

{
  echo "===== $(ts) disk-clean start ====="
  echo "-- before --"
  df -h / | tail -1
  docker system df 2>/dev/null | head -6
} >> "$LOG"

# 1) 清理 docker 构建缓存（最大头，上次释放 27GB 的就是它）
echo "[$(ts)] docker builder prune..." >> "$LOG"
docker builder prune -af >> "$LOG" 2>&1

# 2) 清理未使用(悬空)镜像，保留运行中镜像
echo "[$(ts)] docker image prune -af..." >> "$LOG"
docker image prune -af >> "$LOG" 2>&1

# 3) 清理宿主机 apt 与日志缓存（温和，不影响服务）
echo "[$(ts)] apt & journal cleanup..." >> "$LOG"
sudo apt-get clean >/dev/null 2>&1 || true
sudo journalctl --vacuum-time=3d >/dev/null 2>&1 || true

# 4) 若磁盘仍 >90%，额外清悬空卷(不含被使用的卷) 与 低危回收
if [ "$(df -h / | tail -1 | awk '{print $5}' | tr -d '%')" -gt 90 ]; then
  echo "[$(ts)] disk high, pruning dangling volumes..." >> "$LOG"
  docker volume prune -f >> "$LOG" 2>&1 || true
fi

{
  echo "-- after --"
  df -h / | tail -1
  echo "===== $(ts) disk-clean end ====="
} >> "$LOG"

# 输出最近一屏日志用于 cron 查看
tail -5 "$LOG"
