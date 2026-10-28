import { jsonResponse, errorResponse, getCookie, hashToken } from './_utils.js';
import { shouldAwardPoints } from './_tiebreak.mjs';

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

    if (q.is_tiebreak) {
      const eligible = await env.DB.prepare('SELECT 1 FROM tiebreak_eligibility WHERE question_id = ? AND participant_id = ?').bind(q.id, p.id).first();
      if (!eligible) return errorResponse('No estás participando en este desempate.', 403);
    }

    const existingAns = await env.DB.prepare('SELECT 1 FROM answers WHERE question_id = ? AND participant_id = ?').bind(q.id, p.id).first();
    if (existingAns) {
      return errorResponse('Ya confirmaste una respuesta para esta pregunta.', 409);
    }

    const isCorrect = choice === q.correct_option ? 1 : 0;
    const confirmedAt = new Date().toISOString();
    // Los desempates ordenan la disputa, pero nunca modifican la puntuación normal.
    const pointsAwarded = shouldAwardPoints(Boolean(q.is_tiebreak), isCorrect);
    const saved = await env.DB.prepare(`
      INSERT INTO answers (game_id, question_id, participant_id, selected_option, confirmed_at, is_correct, points_awarded)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM questions WHERE id = ? AND status = 'open')
        AND EXISTS (SELECT 1 FROM games WHERE id = ? AND current_question_id = ? AND status = 'running')
    `).bind(game.id, q.id, p.id, choice, confirmedAt, isCorrect, pointsAwarded, q.id, game.id, q.id).run();
    if (!saved.meta?.changes) return errorResponse('La pregunta está cerrada.', 409);

    return jsonResponse({ ok: true });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return errorResponse('Ya confirmaste una respuesta para esta pregunta.', 409);
    }
    return errorResponse(err.message, 500);
  }
}

