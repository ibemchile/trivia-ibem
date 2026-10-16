import { verifyAdmin, jsonResponse, errorResponse } from '../../_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const isAdmin = await verifyAdmin(request, env);
    if (!isAdmin) return errorResponse('Debes iniciar sesión como administrador.', 401);

    let body = {};
    try { body = await request.json(); } catch (e) {}

    const qid = body.id ? parseInt(body.id, 10) : null;
    const text = (body.question_text || '').trim();
    const optA = (body.option_a || '').trim();
    const optB = (body.option_b || '').trim();
    const optC = (body.option_c || '').trim();
    const optD = (body.option_d || '').trim();
    const correct = (body.correct_option || 'A').toString().toUpperCase();

    if (!text || !optA || !optB || !optC || !optD || !['A', 'B', 'C', 'D'].includes(correct)) {
      return errorResponse('Completa la pregunta y las cuatro alternativas; elige una correcta.', 400);
    }

    const category = (body.category || 'General').trim().substring(0, 60);
    const difficulty = (body.difficulty || 'Básica').trim().substring(0, 20);
    const explanation = (body.explanation || '').substring(0, 500);
    const source = (body.source || '').substring(0, 300);

    if (qid) {
      const row = await env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(qid).first();
      if (!row || row.used) {
        return errorResponse('No se puede editar una pregunta ya utilizada.', 409);
      }
      await env.DB.prepare(`
        UPDATE questions SET
          question_text = ?, option_a = ?, option_b = ?, option_c = ?, option_d = ?,
          correct_option = ?, category = ?, difficulty = ?, explanation = ?, source = ?
        WHERE id = ?
      `).bind(text, optA, optB, optC, optD, correct, category, difficulty, explanation, source, qid).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO questions (
          game_id, question_text, option_a, option_b, option_c, option_d,
          correct_option, category, difficulty, explanation, source, question_order, status
        ) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'draft')
      `).bind(text, optA, optB, optC, optD, correct, category, difficulty, explanation, source).run();
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

