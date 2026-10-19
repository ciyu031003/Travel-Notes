/**
 * 媒体临时目录（多副本准备 · B）。
 *
 * 为什么需要可配置：分片上传/视频转码都把中间文件写 `os.tmpdir()`（每个容器的本地盘）。
 * 单实例没问题，但**多副本**时「init 在副本 A、chunk 落到副本 B」会找不到会话目录，
 * 表现为「上传到一半就 404 / 一直重传」。把根目录做成 MEDIA_TMP_DIR 可配，
 * 多副本部署时指向共享卷（NFS/COSFS/EFS 等）即可；默认仍是 os.tmpdir()，单机零影响。
 *
 * 注意：共享卷上 rmdir/unlink 的最终一致性可能延迟（COSFS 尤甚），
 * 因此这里只负责**路径**，清理逻辑仍保持「尽力而为 + TTL 清扫」（见各调用方）。
 */
import os from 'os'
import path from 'path'

/** 媒体临时文件的根目录：MEDIA_TMP_DIR 优先，未配置回退 os.tmpdir() */
export function mediaTmpBaseDir(): string {
  const configured = (process.env.MEDIA_TMP_DIR || '').trim()
  return configured || os.tmpdir()
}

/** 在媒体临时根目录下取子目录（不同管线各用各的子目录，避免互相清扫） */
export function mediaTmpDir(subdir: string): string {
  return path.join(mediaTmpBaseDir(), subdir)
}
