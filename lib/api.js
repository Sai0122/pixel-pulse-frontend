const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

export function getToken() {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('pixelpulse_token');
}

export async function apiFetch(path, options = {}) {
  const token = getToken();

  const headers = {
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    sessionStorage.removeItem('pixelpulse_token');
    sessionStorage.removeItem('pixelpulse_user');
    window.location.reload();
    throw new Error('Your session has expired. Please log in again.');
  }

  return response;
}