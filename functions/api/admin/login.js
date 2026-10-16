import { jsonResponse, errorResponse, hashToken, setCookie } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {}

    const username = (body.username || '').trim();
    const password = (body.password || '').trim();

    const expectedUser = env.ADMIN_USERNAME || 'admin';
    const expectedPass = env.ADMIN_PASSWORD || '';

    if (!expectedPass) {
      return errorResponse('Configura ADMIN_PASSWORD en las variables de entorno de Cloudflare antes de iniciar.', 503);
    }

    if (username !== expectedUser || password !== expectedPass) {
      return errorResponse('Credenciales incorrectas.', 401);
    }

    const adminSecret = env.SESSION_SECRET || 'secret-admin-token-salt';
    const token = await hashToken(`${expectedUser}:${expectedPass}:${adminSecret}`);

    const isSecure = new URL(request.url).protocol === 'https:';
    const headers = new Headers();
    headers.set('Set-Cookie', setCookie('admin_token', token, 86400 * 30, isSecure));

    return jsonResponse({ ok: true, csrf: 'cf-csrf-active' }, 200, headers);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

