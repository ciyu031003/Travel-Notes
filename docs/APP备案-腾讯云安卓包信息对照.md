# APP 备案 · 腾讯云安卓包信息对照

依据截图《新增安卓平台 App 包信息》整理。以下三项 App 特征均从本仓库当前 release APK（`android/app/build/outputs/apk/release/app-release.apk`）提取。

| 表单字段 | 填写值 | 来源/说明 |
| --- | --- | --- |
| 平台 | 安卓（Android） | Capacitor Android 原生包 |
| APP 包名 | `com.tiantu.app` | `android/app/build.gradle` 的 `applicationId` |
| APP 公钥 | `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxqZSTcb+K5rIhXJAcBg4SIQbeQQFRUKSHdfMaxrg8DSahBMzsk2g/NuuSuPzt2j+6RhdNUqUhAXjkglnZRh9PqkUcDmt6Mro4yaAYP41ETBfpaIAejeSGfiwO3gKov5z7HfVILB7m7XnrUsRk+ugbFlgDSeR8g10BGLRH/Qzuvu8SR3W3zztkKXT+VmK6hhyytuGMO4dHajJXXZ7L69cuhyKXw45DpyQ2KVfltsq0xRbA9ZbWNsNeV7BnVPSBjc9fKz1EuqOIRXb5DjnuVdVabKU0/ceWBxzkX68PpZoZhxwGMvhb07EnOQdiICbR+9flIaghta+/v1xSo+XSv5OrwIDAQAB` | `android/app/tiantu-release.keystore` 证书解析出的 RSA 2048 公钥（SubjectPublicKeyInfo 的 Base64，去掉 PEM 头尾后为一行） |
| APP 证书数字指纹 MD5 | `f67e57f3f461346c59547f2e47c5c29d` | release APK 签名证书 MD5（32 位十六进制）；如输入框要求冒号形式：`f6:7e:57:f3:f4:61:34:6c:59:54:7f:2e:47:c5:c2:9d` |
| 当前 App 版本 | `1.5.0`（versionCode `6`） | `android/app/build.gradle` |
| 签名证书主题 | `CN=Travel-Notes, OU=Dev, O=tiantu, L=Wuhan, ST=Hubei, C=CN` | `apksigner verify --print-certs` 输出 |

注意事项：

- 包名、公钥、MD5 必须与最终上架/分发渠道使用的 APK 以及签名保持一致；后续如果更换 `android/app/tiantu-release.keystore` 或修改包名，需要重新提取。
- 截图支持每行一个包名批量填写，本仓库当前只有一个 Android 包名，填一行 `com.tiantu.app` 即可。
- 复核命令：`apksigner verify --print-certs android/app/build/outputs/apk/release/app-release.apk`
