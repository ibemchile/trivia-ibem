import { verifyAdmin, jsonResponse, errorResponse } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const isAdmin = await verifyAdmin(request, env);
    if (!isAdmin) return errorResponse('Debes iniciar sesión como administrador.', 401);

    let body = {};
    try { body = await request.json(); } catch (e) {}

    const name = (body.name || '').trim().substring(0, 80);
    const round_size = parseInt(body.round_size, 10) || 10;

    if (!name) return errorResponse('Escribe un nombre para la partida.', 400);
    if (![10, 15, 20].includes(round_size)) return errorResponse('La ronda debe tener 10, 15 o 20 preguntas.', 400);

    // Finalizar partidas anteriores abiertas
    const previousGames = await env.DB.prepare("SELECT id, current_question_id FROM games WHERE status != 'finished'").all();
    for (const prev of previousGames.results || []) {
      if (prev.current_question_id) {
        await env.DB.prepare("UPDATE questions SET status = 'closed' WHERE id = ? AND status = 'open'").bind(prev.current_question_id).run();
      }
      await env.DB.prepare("UPDATE games SET status = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = ?").bind(prev.id).run();
    }

    const res = await env.DB.prepare(
      "INSERT INTO games (name, status, round_size) VALUES (?, 'waiting', ?)"
    ).bind(name, round_size).run();

    const gid = res.meta?.last_row_id;
    return jsonResponse({ ok: true, game_id: gid });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

