package com.tiantu.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 应用内更新：**下载 APK + 直接拉起系统安装器**（不再跳浏览器）。
 *
 * 为什么必须原生实现：Capacitor 官方没有"安装 APK"的能力，而 Android 8+ 还要求
 * 用户为「安装未知应用」单独授权（REQUEST_INSTALL_PACKAGES + canRequestPackageInstalls）。
 * 这条链路只有原生能做，所以这里写成一个本地 Capacitor 插件：
 *
 *   canInstall()            → 是否已授权安装未知应用（未授权时前端引导去设置）
 *   openInstallSettings()   → 直达本应用的「安装未知应用」授权页
 *   downloadAndInstall()    → 后台线程下载（notifyListeners 上报百分比）→ 完成后拉起安装器
 *   installDownloaded()     → 安装已下载的文件（授权返回后重试 / 安装器被取消后重试）
 *
 * 关键实现细节（都是踩过就会白屏/失败的点）：
 *  · 下载先写 `xxx.apk.part`，全部结束再 rename —— 中断不会留下一个"看起来完整"的 apk；
 *  · FileProvider 的 authority 用 `${applicationId}.fileprovider`（与 AndroidManifest 一致），
 *    file_paths 里必须有 external-files-path（Android 10+ 不允许往外部存储根目录写）；
 *  · startActivity / notifyListeners 统一切回主线程。
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String PROVIDER_SUFFIX = ".fileprovider";
    private static final String DEFAULT_FILE_NAME = "tiantu-update.apk";
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 30000;

    private final AtomicBoolean downloading = new AtomicBoolean(false);

    /** 是否已授权「安装未知应用」（Android 8 以下恒为 true） */
    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            allowed = getContext().getPackageManager().canRequestPackageInstalls();
        }
        JSObject ret = new JSObject();
        ret.put("allowed", allowed);
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    /** 跳到本应用的「安装未知应用」授权页 */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())
                );
            } else {
                intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("无法打开系统设置：" + e.getMessage());
        }
    }

    /** 下载并安装。未授权安装未知应用时返回 { needsPermission: true }，由前端引导授权后重试 */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url");
        final String fileName = call.getString("fileName", DEFAULT_FILE_NAME);
        if (url == null || url.isEmpty()) {
            call.reject("缺少下载地址");
            return;
        }
        if (downloading.get()) {
            call.reject("已有下载任务进行中");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            JSObject ret = new JSObject();
            ret.put("needsPermission", true);
            call.resolve(ret);
            return;
        }

        downloading.set(true);
        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);

        final Context context = getContext();
        final File dir = new File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "updates");
        if (!dir.exists() && !dir.mkdirs()) {
            downloading.set(false);
            notifyError("无法创建下载目录");
            return;
        }
        final File target = new File(dir, fileName);

        new Thread(() -> {
            HttpURLConnection conn = null;
            FileOutputStream out = null;
            final File part = new File(dir, fileName + ".part");
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
                conn.setReadTimeout(READ_TIMEOUT_MS);
                conn.setRequestProperty("Accept", "application/vnd.android.package-archive,*/*");
                conn.connect();
                final int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    throw new Exception("服务器返回 HTTP " + code);
                }
                final long total = conn.getContentLengthLong();
                final InputStream in = conn.getInputStream();
                out = new FileOutputStream(part);
                byte[] buf = new byte[64 * 1024];
                long received = 0;
                int lastPercent = -1;
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    received += n;
                    if (total > 0) {
                        int percent = (int) (received * 100 / total);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject p = new JSObject();
                            p.put("percent", percent);
                            p.put("received", received);
                            p.put("total", total);
                            notify("downloadProgress", p);
                        }
                    }
                }
                out.flush();
                out.close();
                out = null;
                in.close();

                if (target.exists() && !target.delete()) {
                    throw new Exception("无法覆盖旧的安装包");
                }
                if (!part.renameTo(target)) {
                    throw new Exception("无法保存安装包");
                }

                JSObject done = new JSObject();
                done.put("path", target.getAbsolutePath());
                done.put("bytes", target.length());
                notify("downloaded", done);

                openInstaller(context, target);
            } catch (final Exception e) {
                try {
                    if (part.exists()) part.delete();
                } catch (Exception ignored) {
                    // 清理失败不影响主流程
                }
                notifyError(e.getMessage() == null ? "下载失败" : e.getMessage());
            } finally {
                downloading.set(false);
                try {
                    if (out != null) out.close();
                } catch (Exception ignored) {
                    // ignore
                }
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    /** 安装已经下载好的安装包（授权返回后重试、或安装器被取消后重试） */
    @PluginMethod
    public void installDownloaded(PluginCall call) {
        final String fileName = call.getString("fileName", DEFAULT_FILE_NAME);
        final Context context = getContext();
        File dir = new File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "updates");
        File target = new File(dir, fileName);
        if (!target.exists()) {
            call.reject("安装包不存在，请重新下载");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !context.getPackageManager().canRequestPackageInstalls()) {
            JSObject ret = new JSObject();
            ret.put("needsPermission", true);
            call.resolve(ret);
            return;
        }
        try {
            openInstaller(context, target);
            call.resolve();
        } catch (Exception e) {
            call.reject("无法打开安装器：" + e.getMessage());
        }
    }

    private void openInstaller(final Context context, final File apk) {
        runOnUi(() -> {
            try {
                Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + PROVIDER_SUFFIX, apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } catch (Exception e) {
                notifyError("无法拉起安装器：" + e.getMessage());
            }
        });
    }

    private void notify(final String event, final JSObject data) {
        runOnUi(() -> notifyListeners(event, data));
    }

    private void notifyError(final String message) {
        JSObject err = new JSObject();
        err.put("message", message);
        notify("downloadFailed", err);
    }

    private void runOnUi(Runnable action) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(action);
        } else {
            action.run();
        }
    }
}
