import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import { RequireRole } from '../../src/features/client/auth/guards.tsx';
import { installFakeApi, user } from './fakeApi.ts';
import { cleanUp, renderComponent } from './render.tsx';

afterEach(cleanUp);

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function App() {
  return (
    <Routes>
      <Route
        path="/secret"
        element={
          <RequireRole roles={['admin']}>
            <h1>SECRET</h1>
          </RequireRole>
        }
      />
      <Route
        path="/any"
        element={
          <RequireRole>
            <h1>ANY</h1>
          </RequireRole>
        }
      />
      <Route path="*" element={<Where />} />
    </Routes>
  );
}

const asUser = (overrides = {}) =>
  installFakeApi({ 'GET /auth/me': () => ({ body: { user: user(overrides) } }) });

describe('RequireRole', () => {
  it('без входа отправляет на /login и запоминает, куда вернуться', async () => {
    installFakeApi({ 'GET /auth/me': () => ({ body: { user: null } }) });
    renderComponent(<App />, '/secret');
    expect((await screen.findByTestId('where')).textContent).toBe('/login?next=%2Fsecret');
  });

  it('другая роль видит «Нет доступа» на русском', async () => {
    asUser({ role: 'client' });
    renderComponent(<App />, '/secret');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Нет доступа');
    expect(screen.queryByText('SECRET')).toBeNull();
  });

  it('и на румынском', async () => {
    asUser({ role: 'kitchen' });
    renderComponent(<App />, '/secret', 'ro');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Acces interzis');
  });

  it('нужная роль видит содержимое, без списка ролей достаточно входа', async () => {
    asUser({ role: 'admin' });
    renderComponent(<App />, '/secret');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('SECRET');
  });

  it('любой вошедший проходит туда, где роли не заданы', async () => {
    asUser({ role: 'client' });
    renderComponent(<App />, '/any');
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('ANY');
  });
});
