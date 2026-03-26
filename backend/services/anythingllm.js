import config from '../config.js';

const BASE = config.anythingllmUrl;
const API_KEY = config.anythingllmApiKey;

async function request(method, path, body) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AnythingLLM API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function listWorkspaces() {
  return request('GET', '/api/v1/workspaces');
}

export async function createWorkspace(name) {
  return request('POST', '/api/v1/workspace/new', { name });
}

export async function createUser(username, password, role = 'default') {
  return request('POST', '/api/v1/admin/users/new', { username, password, role });
}

export async function listUsers() {
  return request('GET', '/api/v1/users');
}

export async function deleteUser(userId) {
  return request('DELETE', `/api/v1/admin/users/${userId}`);
}

export async function healthCheck() {
  try {
    const res = await fetch(`${BASE}/api/v1/auth`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
