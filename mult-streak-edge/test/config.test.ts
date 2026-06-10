import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('applies sensible defaults from an empty environment', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3000);
    expect(config.idleMinutes).toBe(15);
    expect(config.cookieSecret).toBe('dev-insecure-cookie-secret');
    expect(config.resendApiKey).toBeUndefined();
    expect(config.adminEmail).toBeUndefined();
  });

  it('reads values from the environment', () => {
    const config = loadConfig({
      PORT: '8080',
      COOKIE_SECRET: 'my-strong-secret',
      IDLE_MINUTES: '30',
      RESEND_API_KEY: 'resend-key',
      ADMIN_EMAIL: 'admin@example.com',
      FROM_EMAIL: 'from@example.com',
    });
    expect(config.port).toBe(8080);
    expect(config.cookieSecret).toBe('my-strong-secret');
    expect(config.idleMinutes).toBe(30);
    expect(config.resendApiKey).toBe('resend-key');
    expect(config.adminEmail).toBe('admin@example.com');
    expect(config.fromEmail).toBe('from@example.com');
  });

  it('accepts RESEND_API as an alias for RESEND_API_KEY', () => {
    const config = loadConfig({ RESEND_API: 'alias-key' });
    expect(config.resendApiKey).toBe('alias-key');
  });

  it('trims whitespace from COOKIE_SECRET', () => {
    const config = loadConfig({ COOKIE_SECRET: '  trimmed  ' });
    expect(config.cookieSecret).toBe('trimmed');
  });

  it('throws in production when COOKIE_SECRET is missing', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(
      /COOKIE_SECRET must be set in production/,
    );
  });

  it('throws in production when COOKIE_SECRET is blank', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', COOKIE_SECRET: '   ' })).toThrow(
      /COOKIE_SECRET must be set in production/,
    );
  });

  it('does not throw in development when COOKIE_SECRET is missing', () => {
    expect(() => loadConfig({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('does not throw when COOKIE_SECRET is set in production', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', COOKIE_SECRET: 'strong-secret' }),
    ).not.toThrow();
  });
});
