#!/usr/bin/env bash
# 发布 release APK 到 nginx 静态分发目录（/downloads/）。
#
# 为什么不用 COS：本机与生产 .env 都没有 COS_* 凭据，而 nginx 的
# /var/www/travel-notes-downloads/ 是既有且生效的分发路径
# （APP_DOWNLOAD_URL=https://travel-notes.yuanabd.cn/downloads/tiantu.apk），
# 历史上每个版本都在这里留一份「带版本号」的副本 + 覆盖 tiantu.apk 别名。
set -euo pipefail

SRC="${1:?用法: publish-apk-nginx.sh /tmp/tiantu-<ver>-b<build>.apk <ver> <build>}"
VER="${2:?缺少版本号}"
BUILD="${3:?缺少构建号}"
DEST=/var/www/travel-notes-downloads
DATE=$(date +%Y%m%d)
VERSIONED="tiantu-${DATE}-v${VER}-b${BUILD}.apk"

[ -f "$SRC" ] || { echo "找不到 APK: $SRC" >&2; exit 1; }
sudo mkdir -p "$DEST"

# /var/www 通常属 root：先探测可写性，不可写就走 sudo（脚本在服务器上执行）
SUDO=""
if [ ! -w "$DEST" ]; then SUDO="sudo"; fi
echo "分发目录可写: $([ -w "$DEST" ] && echo yes || echo 'no -> 使用 sudo')"

echo "--- 发布前 ---"
$SUDO ls -la "$DEST" | tail -8

# 先放带版本号的副本（保留历史，便于回滚 / 核对），再覆盖别名
$SUDO install -m 0644 "$SRC" "$DEST/$VERSIONED"
$SUDO install -m 0644 "$SRC" "$DEST/tiantu.apk"

echo "--- 发布后 ---"
$SUDO ls -la "$DEST" | tail -8

echo "--- 校验：别名与副本大小一致 ---"
a=$(stat -c%s "$DEST/tiantu.apk")
b=$(stat -c%s "$DEST/$VERSIONED")
echo "tiantu.apk=$a  $VERSIONED=$b"
[ "$a" = "$b" ] || { echo "❌ 大小不一致" >&2; exit 1; }

echo "--- 校验：sha256 一致 ---"
sha256sum "$DEST/tiantu.apk" "$DEST/$VERSIONED"

echo "--- 校验：带版本号的副本不会被覆盖，清理 /tmp 源文件 ---"
rm -f "$SRC"
echo "已删除 $SRC"
