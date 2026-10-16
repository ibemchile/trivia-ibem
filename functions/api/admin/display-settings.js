import { verifyAdmin, jsonResponse, errorResponse } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const isAdmin = await verifyAdmin(request, env);
    if (!isAdmin) return errorResponse('Debes iniciar sesión como administrador.', 401);

    let body = {};
    try { body = await request.json(); } catch (e) {}

    const gid = parseInt(body.game_id, 10);
    const value = body.show_leaderboard_after_question ? 1 : 0;

    const res = await env.DB.prepare(
      "UPDATE games SET show_leaderboard_after_question = ? WHERE id = ? AND status != 'finished'"
    ).bind(value, gid).run();

    if (res.meta?.changes === 0) {
      return errorResponse('Partida finalizada o desconocida.', 409);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

