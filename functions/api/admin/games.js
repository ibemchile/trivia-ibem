import { verifyAdmin, jsonResponse, errorResponse, hasUnresolvedLeaderboardTie } from '../_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const isAdmin = await verifyAdmin(request, env);
    if (!isAdmin) return errorResponse('Debes iniciar sesión como administrador.', 401);

    let body = {};
    try { body = await request.json(); } catch (e) {}

    const name = (body.name || '').trim().substring(0, 80);
    const round_size = parseInt(body.round_size, 10) || 10;

    if (!name) return errorResponse('Escribe un nombre para la partida.', 400);
    if (![5, 10, 15, 20].includes(round_size)) return errorResponse('La ronda debe tener 10, 15 o 20 preguntas.', 400);

    // Finalizar partidas anteriores abiertas
    const previousGames = await env.DB.prepare("SELECT id, current_question_id FROM games WHERE status != 'finished'").all();
    for (const prev of previousGames.results || []) {
      const previous = await env.DB.prepare('SELECT status, round_size FROM games WHERE id = ?').bind(prev.id).first();
      if (previous.status === 'running') {
        const current = prev.current_question_id ? await env.DB.prepare('SELECT status, is_tiebreak FROM questions WHERE id = ?').bind(prev.current_question_id).first() : null;
        if (current?.status === 'open') return errorResponse('Cierra la pregunta actual antes de crear otra partida.', 409);
        const pendingTie = await env.DB.prepare("SELECT 1 FROM questions WHERE game_id = ? AND is_tiebreak = 1 AND status = 'draft' LIMIT 1").bind(prev.id).first();
        if (pendingTie || await hasUnresolvedLeaderboardTie(env.DB, prev.id)) {
          return errorResponse('Resuelve los desempates del podio antes de crear otra partida.', 409);
        }
        const closed = await env.DB.prepare("SELECT COUNT(*) AS n FROM questions WHERE game_id = ? AND is_tiebreak = 0 AND status = 'closed'").bind(prev.id).first();
        if (closed.n < previous.round_size) return errorResponse('Completa la ronda actual antes de crear otra partida.', 409);
      }
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

