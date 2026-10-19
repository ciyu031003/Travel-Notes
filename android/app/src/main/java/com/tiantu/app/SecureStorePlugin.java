package com.tiantu.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * C1：SQLite 加密密钥的安全保管（Android Keystore）。
 *
 * 为什么要这么绕：
 *  · SQLite 加密（SQLCipher）需要一个口令；口令**不能硬编码**在 JS/APK 里 ——
 *    任何人反编译都能拿到，等于没加密；
 *  · 也不能让 JS 生成后存 localStorage —— 物理接触者直接把 localStorage 取走即可；
 *  · 因此口令由原生生成并**只以密文形态落盘**：真正的 AES 密钥放在 AndroidKeyStore
 *    （芯片/TEE 保护、不可导出），SharedPreferences 里只存 AES/GCM 的密文 + IV。
 *
 * 失效语义：如果 Keystore 条目被系统删除/失效（换锁屏、恢复出厂等），解密会失败。
 * 此时**必须抛错**而不是生成新密钥 —— 生成新密钥会让已有加密库永远打不开（静默丢数据）。
 * JS 侧收到 null 后按"未加密模式"打开会失败，离线层会显式报错（getOfflineInitError），
 * 线上数据仍在服务器，App 在线功能不受影响。
 *
 * 注意：本插件只做"密钥保管"，不参与 SQLCipher 本身；数据库加密见 lib/modules/offline/native/sqlite-db.ts。
 */
@CapacitorPlugin(name = "SecureStore")
public class SecureStorePlugin extends Plugin {

    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    /** Keystore 别名（与文档/工单约定的 tiantu_db_secret 一致） */
    private static final String KEY_ALIAS = "tiantu_db_secret";
    private static final String PREFS_NAME = "tiantu_secure";
    private static final String PREF_CIPHERTEXT = "db_secret_ct";
    private static final String PREF_IV = "db_secret_iv";
    private static final int SECRET_BYTES = 32;
    private static final int GCM_TAG_BITS = 128;
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    /** 取（或首次生成）数据库口令：返回 base64(32 字节随机数) */
    @PluginMethod
    public void getOrCreateSecret(PluginCall call) {
        try {
            String secret = readSecret();
            if (secret == null) {
                secret = createSecret();
            }
            JSObject ret = new JSObject();
            ret.put("secret", secret);
            call.resolve(ret);
        } catch (Exception e) {
            // 不 resolve 空值：让 JS 明确知道"密钥不可用"，走降级/报错路径
            call.reject("SecureStore 不可用: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        }
    }

    /** 读取已存口令；没有则返回 null；有但解不开则抛异常（绝不覆盖） */
    private String readSecret() throws Exception {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String ctB64 = prefs.getString(PREF_CIPHERTEXT, null);
        String ivB64 = prefs.getString(PREF_IV, null);
        if (ctB64 == null || ivB64 == null) {
            return null;
        }
        byte[] ciphertext = Base64.decode(ctB64, Base64.NO_WRAP);
        byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);
        SecretKey key = getOrCreateKey(false);
        if (key == null) {
            throw new IllegalStateException("Keystore 中缺少密钥，无法解密口令");
        }
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
        byte[] plain = cipher.doFinal(ciphertext);
        return Base64.encodeToString(plain, Base64.NO_WRAP);
    }

    /** 首次生成：随机 32 字节 → AES/GCM 加密 → 只存密文+IV */
    private String createSecret() throws Exception {
        byte[] plain = new byte[SECRET_BYTES];
        new SecureRandom().nextBytes(plain);
        SecretKey key = getOrCreateKey(true);
        if (key == null) {
            throw new IllegalStateException("无法创建 Keystore 密钥");
        }
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key);
        byte[] ciphertext = cipher.doFinal(plain);
        byte[] iv = cipher.getIV();
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putString(PREF_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .putString(PREF_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
            .apply();
        return Base64.encodeToString(plain, Base64.NO_WRAP);
    }

    /**
     * 取（必要时生成）Keystore 中的 AES 密钥。
     * @param createIfMissing false 时只查不建 —— 解密路径绝不能顺手生成新密钥（否则旧密文永久失效）
     */
    private SecretKey getOrCreateKey(boolean createIfMissing) throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }
        if (!createIfMissing) {
            return null;
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                // 不要求每次使用都解锁：数据库要在 App 启动时自动打开；PIN 是 UI 门禁（见 privacy-lock.ts）
                .setUserAuthenticationRequired(false)
                .build()
        );
        return generator.generateKey();
    }
}
