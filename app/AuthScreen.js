
'use client';

import { useState } from 'react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

export default function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';

      const body = mode === 'login'
        ? { email, password }
        : { name, email, password };

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'Authentication failed');
      }

      if (mode === 'register') {
        setMessage('Account created successfully. Please log in.');
        setMode('login');
        setPassword('');
      } else {
        sessionStorage.setItem('pixelpulse_token', result.access_token);
        sessionStorage.setItem('pixelpulse_user', JSON.stringify(result.user));
        onLogin(result.user);
      }
    } catch (err) {
      setError(err.message || 'Unable to connect to the server');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>PixelPulse</h1>
        <p>Brand governance workspace</p>

        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>

        {mode === 'register' && (
          <input
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={100}
            required
          />
        )}

        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={mode === 'register' ? 12 : 1}
          maxLength={128}
          required
        />

        {mode === 'register' && (
          <small>Password must contain at least 12 characters.</small>
        )}

        {error && <p className="auth-error">{error}</p>}
        {message && <p className="auth-message">{message}</p>}

        <button type="submit" disabled={busy}>
          {busy
            ? 'Please wait…'
            : mode === 'login'
              ? 'Log in'
              : 'Create account'}
        </button>

        <p className="auth-switch">
          {mode === 'login'
            ? "Don't have an account?"
            : 'Already have an account?'}
          {' '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
              setMessage('');
            }}
          >
            {mode === 'login' ? 'Register' : 'Log in'}
          </button>
        </p>
      </form>
    </main>
  );
}
