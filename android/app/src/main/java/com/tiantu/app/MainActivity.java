package com.tiantu.app;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 本地插件：应用内下载 APK 并直接拉起安装器（见 AppUpdaterPlugin）
        registerPlugin(AppUpdaterPlugin.class);
        // C1：SQLite 加密口令的 Keystore 保管（见 SecureStorePlugin / native/secure-store.ts）
        registerPlugin(SecureStorePlugin.class);
        super.onCreate(savedInstanceState);
        // Android 系统边缘返回/返回键必须在原生侧接管。网页 touchmove 无法拦截系统手势。
        // 不调用 super/back dispatcher 默认行为（默认会 finish Activity 回到桌面）。
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge == null || bridge.getWebView() == null) return;
                bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(
                    "window.__tiantuHandleBack && window.__tiantuHandleBack()", null));
            }
        });
    }
}
