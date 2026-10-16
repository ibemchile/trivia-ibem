import { verifyAdmin, jsonResponse, errorResponse } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const isAdmin = await verifyAdmin(request, env);
    if (!isAdmin) return errorResponse('Debes iniciar sesión como administrador.', 401);

    let body = {};
    try { body = await request.json(); } catch (e) {}

    const gid = parseInt(body.game_id, 10);
    const exists = await env.DB.prepare("SELECT 1 FROM games WHERE id = ?").bind(gid).first();
    if (!exists) return errorResponse('Partida desconocida.', 404);

    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

