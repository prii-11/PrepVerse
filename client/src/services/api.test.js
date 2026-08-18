import { describe, expect, it, beforeEach } from 'vitest';
import api, { registerUnauthorizedHandler, setAccessToken } from './api';

function requestInterceptor() {
  return api.interceptors.request.handlers[0];
}

function responseInterceptor() {
  return api.interceptors.response.handlers[0];
}

describe('api client (P1 auth compatibility)', () => {
  beforeEach(() => {
    setAccessToken(null);
  });

  it('attaches the Bearer token when set', () => {
    setAccessToken('token-123');
    const config = requestInterceptor().fulfilled({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer token-123');
  });

  it('does not attach a header when no token is set', () => {
    const config = requestInterceptor().fulfilled({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
  });

  it('clearing the token removes the header', () => {
    setAccessToken('token-123');
    setAccessToken(null);
    const config = requestInterceptor().fulfilled({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
  });

  it('routes 401 responses through the registered unauthorized handler', async () => {
    const handler = vi.fn();
    registerUnauthorizedHandler(handler);

    await expect(
      responseInterceptor().rejected({ response: { status: 401 } }),
    ).rejects.toMatchObject({ response: { status: 401 } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call the unauthorized handler for non-401 errors', async () => {
    const handler = vi.fn();
    registerUnauthorizedHandler(handler);

    await expect(
      responseInterceptor().rejected({ response: { status: 500 } }),
    ).rejects.toMatchObject({ response: { status: 500 } });
    expect(handler).not.toHaveBeenCalled();
  });
});