import { jsonResponse, errorResponse, getCookie, hashToken } from './_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const pid = getCookie(request, 'participant_id');
    const token = getCookie(request, 'participant_token');

    if (!pid || !token) {
      return errorResponse('Identidad de participante no válida; vuelve a ingresar.', 401);
    }

    const p = await env.DB.prepare('SELECT * FROM participants WHERE id = ?').bind(pid).first();
    if (!p) {
      return errorResponse('Identidad no encontrada.', 401);
    }

    const hashed = await hashToken(token);
    if (p.token_hash !== hashed) {
      return errorResponse('Token no válido.', 401);
    }

    let body = {};
    try {
      body = await request.json();
    } catch (e) {}

    const choice = (body.choice || '').toString().toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(choice)) {
      return errorResponse('Alternativa inválida.', 400);
    }

    const game = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(p.game_id).first();
    if (!game || game.status !== 'running' || !game.current_question_id) {
      return errorResponse('La pregunta está cerrada.', 409);
    }

    const q = await env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(game.current_question_id).first();
    if (!q || q.status !== 'open') {
      return errorResponse('La pregunta está cerrada.', 409);
    }

    const existingAns = await env.DB.prepare('SELECT 1 FROM answers WHERE question_id = ? AND participant_id = ?').bind(q.id, p.id).first();
    if (existingAns) {
      return errorResponse('Ya confirmaste una respuesta para esta pregunta.', 409);
    }

    const isCorrect = choice === q.correct_option ? 1 : 0;
    const confirmedAt = new Date().toISOString();
    let pointsAwarded = isCorrect;
    if (q.is_tiebreak) {
      const baseline = await env.DB.prepare(`
        SELECT p.id, COALESCE(SUM(CASE WHEN tq.is_tiebreak = 0 THEN a.points_awarded ELSE 0 END), 0) AS score
        FROM participants p
        LEFT JOIN answers a ON a.participant_id = p.id AND a.game_id = p.game_id
        LEFT JOIN questions tq ON tq.id = a.question_id
        WHERE p.game_id = ? GROUP BY p.id
      `).bind(game.id).all();
      const scores = (baseline.results || []).map(row => row.score);
      const topScore = Math.max(...scores, -1);
      const tiedAtStart = (baseline.results || []).filter(row => row.score === topScore).map(row => row.id);
      const previousTies = await env.DB.prepare(
        "SELECT id FROM questions WHERE game_id = ? AND is_tiebreak = 1 AND question_order < ? ORDER BY question_order, id"
      ).bind(game.id, q.question_order).all();
      let eligible = tiedAtStart.includes(p.id);
      for (const prior of (previousTies.results || [])) {
        if (!eligible) break;
        const priorAnswer = await env.DB.prepare(
          'SELECT is_correct FROM answers WHERE question_id = ? AND participant_id = ?'
        ).bind(prior.id, p.id).first();
        eligible = Boolean(priorAnswer && priorAnswer.is_correct);
      }
      pointsAwarded = isCorrect && eligible ? 1 : 0;
    }
    await env.DB.prepare(
      'INSERT INTO answers (game_id, question_id, participant_id, selected_option, confirmed_at, is_correct, points_awarded) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(game.id, q.id, p.id, choice, confirmedAt, isCorrect, pointsAwarded).run();

    return jsonResponse({ ok: true });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return errorResponse('Ya confirmaste una respuesta para esta pregunta.', 409);
    }
    return errorResponse(err.message, 500);
  }
}

