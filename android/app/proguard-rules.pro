# ============================================================================
# 甜途（com.tiantu.app）R8 保留规则（P2-26）
#
# 开 minifyEnabled 后，**所有"字符串/注解/JS 桥"引用的类都必须在下面保留**：
# R8 静态分析看不到这些引用，删掉或改名就是运行时崩溃（白屏/建库失败/插件不可用）。
# 每次新增原生插件时，先确认这里有没有对应的 keep。
# ============================================================================

# --- Capacitor 核心与插件桥 -------------------------------------------------
# registerPlugin / @CapacitorPlugin / @PluginMethod 全部靠反射与注解查找
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
}

# --- 本仓库自有原生代码（AppUpdater 本地插件，见 MainActivity.registerPlugin） ---
-keep class com.tiantu.app.** { *; }

# --- @capacitor-community/sqlite（含 SQLCipher 可选依赖）---------------------
# 插件在 Java 侧按类名加载数据库实现（net.sqlcipher / net.zetetic），
# 且 JS 侧通过 addJavascriptInterface 调用 —— 两者都必须保留。
-keep class com.getcapacitor.community.database.** { *; }
-keep class net.sqlcipher.** { *; }
-keep class net.zetetic.** { *; }
-dontwarn net.sqlcipher.**
-dontwarn net.zetetic.**

# --- WebView JS 接口 --------------------------------------------------------
# 任何 @JavascriptInterface 方法都是"从 JS 调用"的，R8 看不到调用点
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface

# --- JSON / 注解 / 泛型签名 --------------------------------------------------
# org.json 被 Capacitor 的 JSObject 直接使用；泛型签名影响 Gson/反射式反序列化
-keep class org.json.** { *; }
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# 保留行号：崩溃栈要能对上源码行（配合服务端 /api/diagnostics 上报）
-keepattributes SourceFile,LineNumberTable

# --- 第三方告警白名单（不影响运行，只消除 R8 缺类告警）-----------------------
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn kotlinx.**
-dontwarn org.slf4j.**
-dontwarn org.bouncycastle.**
-dontwarn javax.annotation.**
