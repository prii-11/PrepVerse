import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useContext } from 'react';

vi.mock('../services/authService', () => ({
  authService: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}));

vi.mock('../services/api', () => ({
  setAccessToken: vi.fn(),
  registerUnauthorizedHandler: vi.fn(),
}));

import { AuthContext, AuthProvider } from './AuthContext';
import { authService } from '../services/authService';
import { setAccessToken, registerUnauthorizedHandler } from '../services/api';

const USER = { _id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B' };

function Probe() {
  const auth = useContext(AuthContext);
  return (
    <div>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="email">{auth.user?.email ?? 'none'}</span>
      <button onClick={() => auth.login({ email: 'a@b.c', password: 'x' })}>login</button>
      <button onClick={() => auth.signup({ firstName: 'A' })}>signup</button>
      <button onClick={() => auth.logout()}>logout</button>
    </div>
  );
}

describe('AuthContext (P1 auth compatibility)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('login stores the token in memory through setAccessToken', async () => {
    authService.login.mockResolvedValue({ token: 'jwt-token', user: USER });
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
    expect(setAccessToken).toHaveBeenCalledWith('jwt-token');
    expect(screen.getByTestId('email')).toHaveTextContent('a@b.c');
  });

  it('signup registers against the backend and authenticates', async () => {
    authService.register.mockResolvedValue({ token: 'jwt-2', user: USER });
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'signup' }));

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
    expect(authService.register).toHaveBeenCalledWith({ firstName: 'A' });
    expect(setAccessToken).toHaveBeenCalledWith('jwt-2');
  });

  it('logout clears the runtime auth state', async () => {
    authService.login.mockResolvedValue({ token: 'jwt-token', user: USER });
    authService.logout.mockResolvedValue({ message: 'Logged out' });
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'login' }));
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

    await user.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
    expect(authService.logout).toHaveBeenCalledTimes(1);
    expect(setAccessToken).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('email')).toHaveTextContent('none');
  });

  it('registers the 401 handler on mount', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(registerUnauthorizedHandler).toHaveBeenCalledTimes(1);
  });
});
