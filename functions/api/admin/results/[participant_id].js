import { verifyAdmin, getActiveGame, jsonResponse, errorResponse } from '../../_utils.js';

export async function onRequestGet({ request, params, env }) {
  try {
    const isAdmin = await verifyAdmin(request, env);
    if (!isAdmin) return errorResponse('Debes iniciar sesión como administrador.', 401);

    const participantId = params.participant_id;
    const url = new URL(request.url);
    const gameParam = url.searchParams.get('game');

    let gid = gameParam ? parseInt(gameParam, 10) : null;
    if (!gid) {
      const active = await getActiveGame(env.DB);
      gid = active ? active.id : 1;
    }

    const res = await env.DB.prepare(`
      SELECT q.question_order, q.question_text, q.correct_option, q.explanation, q.source,
        a.selected_option, a.is_correct, a.points_awarded
      FROM answers a
      JOIN questions q ON q.id = a.question_id
      WHERE a.participant_id = ? AND a.game_id = ?
      ORDER BY q.question_order
    `).bind(participantId, gid).all();

    return jsonResponse({ answers: res.results || [] });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

