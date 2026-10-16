import { verifyAdmin, getGameState, isTopScoreTied, addTiebreakQuestion, jsonResponse, errorResponse } from '../../_utils.js';

export async function onRequestPost({ request, params, env }) {
  try {
    const isAdmin = await verifyAdmin(request, env);
    if (!isAdmin) return errorResponse('Debes iniciar sesión como administrador.', 401);

    const action = params.action;
    let body = {};
    try { body = await request.json(); } catch (e) {}

    const gid = parseInt(body.game_id, 10);
    const game = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(gid).first();
    if (!game) return errorResponse('Partida no encontrada.', 404);

    let q = null;
    if (game.current_question_id) {
      q = await env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(game.current_question_id).first();
    }

    if (action === 'start-game') {
      if (game.status !== 'waiting') {
        return errorResponse('La partida ya comenzó.', 409);
      }
      const bankRes = await env.DB.prepare('SELECT * FROM questions WHERE game_id IS NULL ORDER BY RANDOM() LIMIT ?').bind(game.round_size).all();
      const bank = bankRes.results || [];
      if (bank.length < game.round_size) {
        return errorResponse('El banco no tiene suficientes preguntas para esta ronda.', 409);
      }

      await env.DB.prepare('DELETE FROM questions WHERE game_id = ?').bind(gid).run();

      for (let i = 0; i < bank.length; i++) {
        const item = bank[i];
        await env.DB.prepare(`
          INSERT INTO questions (
            game_id, bank_id, question_text, option_a, option_b, option_c, option_d,
            correct_option, category, difficulty, explanation, source, question_order, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
        `).bind(
          gid, item.id, item.question_text, item.option_a, item.option_b, item.option_c, item.option_d,
          item.correct_option, item.category, item.difficulty, item.explanation, item.source, i + 1
        ).run();
      }

      await env.DB.prepare("UPDATE games SET status = 'running', started_at = CURRENT_TIMESTAMP WHERE id = ?").bind(gid).run();

    } else if (action === 'start-question') {
      if (game.status !== 'running' || (q && q.status !== 'closed')) {
        return errorResponse('Cierra la pregunta actual antes de iniciar otra.', 409);
      }
      const nxt = await env.DB.prepare(
        "SELECT * FROM questions WHERE game_id = ? AND status = 'draft' ORDER BY question_order, id LIMIT 1"
      ).bind(gid).first();

      if (!nxt) return errorResponse('No quedan preguntas pendientes.', 409);

      await env.DB.prepare("UPDATE questions SET status = 'open', used = 1 WHERE id = ?").bind(nxt.id).run();
      if (nxt.bank_id) {
        await env.DB.prepare("UPDATE questions SET used = 1 WHERE id = ? AND game_id IS NULL").bind(nxt.bank_id).run();
      }
      await env.DB.prepare("UPDATE games SET current_question_id = ? WHERE id = ?").bind(nxt.id, gid).run();

    } else if (action === 'close-question') {
      if (!q || q.status !== 'open') {
        return errorResponse('No hay una pregunta abierta.', 409);
      }
      await env.DB.prepare("UPDATE questions SET status = 'closed' WHERE id = ?").bind(q.id).run();

      if (q.is_tiebreak || q.question_order >= game.round_size) {
        const tied = await isTopScoreTied(env.DB, gid);
        if (tied) {
          const added = await addTiebreakQuestion(env.DB, gid);
          if (!added) {
            return errorResponse('No hay preguntas disponibles para el desempate.', 409);
          }
        }
      }

    } else if (action === 'finish-game') {
      if (q && q.status === 'open') {
        await env.DB.prepare("UPDATE questions SET status = 'closed' WHERE id = ?").bind(q.id).run();
      }

      const pendingTie = await env.DB.prepare("SELECT 1 FROM questions WHERE game_id = ? AND is_tiebreak = 1 AND status = 'draft' LIMIT 1").bind(gid).first();
      if (pendingTie) {
        return errorResponse('Hay un empate. Inicia la pregunta de desempate antes de finalizar.', 409);
      }

      const closedRes = await env.DB.prepare("SELECT COUNT(*) as cnt FROM questions WHERE game_id = ? AND is_tiebreak = 0 AND status = 'closed'").bind(gid).first();
      const closedRegular = closedRes ? closedRes.cnt : 0;

      if (closedRegular >= game.round_size) {
        const tied = await isTopScoreTied(env.DB, gid);
        if (tied) {
          const added = await addTiebreakQuestion(env.DB, gid);
          if (!added) return errorResponse('No hay preguntas disponibles para el desempate.', 409);
          const stateData = await getGameState(env.DB, gid, { isAdmin: true });
          return jsonResponse({
            ok: true,
            tiebreak_added: true,
            message: 'Empate: se agregó una pregunta de desempate.',
            state: stateData
          });
        }
      }

      await env.DB.prepare("UPDATE games SET status = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = ?").bind(gid).run();

    } else {
      return errorResponse('Acción desconocida.', 400);
    }

    const stateData = await getGameState(env.DB, gid, { isAdmin: true });
    return jsonResponse({ ok: true, state: stateData });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

