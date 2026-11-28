import { describe, expect, it } from 'vitest';
import { DEV_FALLBACK_SECRET, loadConfig } from '../lib/config.mjs';

describe('loadConfig', () => {
  it('默认值：端口 1234 / 800ms 防抖 / 1234 路径所需的 app 地址', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.port).toBe(1234);
    expect(config.host).toBe('0.0.0.0');
    expect(config.saveDebounceMs).toBe(800);
    expect(config.secret).toBe(DEV_FALLBACK_SECRET);
    expect(config.appInternalUrl).toBe('http://127.0.0.1:3000');
    expect(config.saveRetryDelaysMs).toEqual([250, 500, 1000]);
    expect(config.instanceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('生产环境缺少 COLLAB_SECRET 直接拒绝启动', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/COLLAB_SECRET 未配置/);
    expect(() => loadConfig({ NODE_ENV: 'production', COLLAB_SECRET: '   ' })).toThrow(/COLLAB_SECRET 未配置/);
    // 长度不足只告警（不阻断），但会进 warnings
    const shortSecret = loadConfig({ NODE_ENV: 'production', COLLAB_SECRET: 'short' });
    expect(shortSecret.warnings.join()).toContain('长度小于 16');
    const config = loadConfig({ NODE_ENV: 'production', COLLAB_SECRET: 'x'.repeat(32) });
    expect(config.secret).toHaveLength(32);
    expect(config.warnings.join()).not.toContain('长度小于 16');
  });

  it('读取端口/防抖/重试间隔，非法值报错', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      PORT: '4321',
      HOST: '127.0.0.1',
      COLLAB_SAVE_DEBOUNCE_MS: '300',
      COLLAB_SAVE_RETRY_DELAYS_MS: '100, 200,300',
      APP_INTERNAL_URL: 'http://app:3000/',
    });
    expect(config.port).toBe(4321);
    expect(config.host).toBe('127.0.0.1');
    expect(config.saveDebounceMs).toBe(300);
    expect(config.saveRetryDelaysMs).toEqual([100, 200, 300]);
    expect(config.appInternalUrl).toBe('http://app:3000');
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ APP_INTERNAL_URL: 'not a url' })).toThrow(/APP_INTERNAL_URL/);
  });
});
