import { verifyAdmin, jsonResponse, errorResponse } from '../../_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const isAdmin = await verifyAdmin(request, env);
    if (!isAdmin) return errorResponse('Debes iniciar sesión como administrador.', 401);

    let body = {};
    try { body = await request.json(); } catch (e) {}

    const qid = parseInt(body.id, 10);
    const res = await env.DB.prepare('DELETE FROM questions WHERE id = ? AND used = 0 AND game_id IS NULL').bind(qid).run();

    if (res.meta?.changes === 0) {
      return errorResponse('Pregunta utilizada o no encontrada.', 409);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

