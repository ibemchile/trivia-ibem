import { verifyAdmin, jsonResponse, errorResponse } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const isAdmin = await verifyAdmin(request, env);
    if (!isAdmin) return errorResponse('Debes iniciar sesión como administrador.', 401);

    let body = {};
    try { body = await request.json(); } catch (e) {}

    const gid = parseInt(body.game_id, 10);
    const round_size = parseInt(body.round_size, 10);

    if (![10, 15, 20].includes(round_size)) {
      return errorResponse('La ronda debe tener 10, 15 o 20 preguntas.', 400);
    }

    const res = await env.DB.prepare(
      "UPDATE games SET round_size = ? WHERE id = ? AND status = 'waiting'"
    ).bind(round_size, gid).run();

    if (res.meta?.changes === 0) {
      return errorResponse('La ronda solo se puede cambiar antes de comenzar la partida.', 409);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

