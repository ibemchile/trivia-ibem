import { jsonResponse, clearCookie } from '../_utils.js';

export async function onRequestPost() {
  const headers = new Headers();
  headers.set('Set-Cookie', clearCookie('admin_token'));
  return jsonResponse({ ok: true }, 200, Object.fromEntries(headers.entries()));
}

