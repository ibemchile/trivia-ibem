// Helpers para cookies y sesiones en Cloudflare Workers / Pages Functions
export function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (let cookie of cookies) {
    const [k, v] = cookie.trim().split('=');
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

export function setCookie(name, val, maxAge = 86400 * 7, isSecure = false) {
  const sec = isSecure ? '; Secure' : '';
  return `${name}=${encodeURIComponent(val)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${sec}`;
}

export function clearCookie(name, isSecure = false) {
  const sec = isSecure ? '; Secure' : '';
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${sec}`;
}

export function jsonResponse(data, status = 200, customHeaders = null) {
  const headers = customHeaders instanceof Headers ? customHeaders : new Headers(customHeaders || {});
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}

export function errorResponse(error, status = 400) {
  return jsonResponse({ error }, status);
}

export async function hashToken(token) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateId(len = 24) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').substring(0, len);
}

export function norm(value) {
  return (value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function verifyAdmin(request, env) {
  const token = getCookie(request, 'admin_token');
  if (!token) return false;
  const adminSecret = env.SESSION_SECRET || 'secret-admin-token-salt';
  const expected = await hashToken(`${env.ADMIN_USERNAME || 'admin'}:${env.ADMIN_PASSWORD || 'admin'}:${adminSecret}`);
  return token === expected;
}

export async function getActiveGame(db) {
  const res = await db.prepare("SELECT * FROM games WHERE status != 'finished' ORDER BY id DESC LIMIT 1").first();
  if (res) return res;
  return await db.prepare("SELECT * FROM games ORDER BY id DESC LIMIT 1").first();
}

export async function getLeaderboard(db, gid) {
  const { results } = await db.prepare(`
    SELECT p.id, p.nickname,
      COALESCE(SUM(a.points_awarded), 0) as score,
      COALESCE(SUM(a.is_correct), 0) as correct,
      COUNT(a.id) as answered,
      (SELECT COUNT(*) FROM questions q WHERE q.game_id = ? AND q.status IN ('closed', 'open')) - COUNT(a.id) as unanswered
    FROM participants p
    LEFT JOIN answers a ON a.participant_id = p.id AND a.game_id = p.game_id
    WHERE p.game_id = ?
    GROUP BY p.id
    ORDER BY score DESC, correct DESC, p.created_at ASC
  `).bind(gid, gid).all();

  const list = results || [];
  let rank = 0;
  let prior = null;
  const ranked = [];

  for (const item of list) {
    const key = `${item.score}_${item.correct}`;
    if (key !== prior) {
      rank = ranked.length + 1;
    }
    item.position = rank;
    ranked.push(item);
    prior = key;
  }
  return ranked;
}

export async function getGameState(db, gid, options = {}) {
  const { isAdmin = false, participantId = null, participantToken = null } = options;
  const game = await db.prepare("SELECT * FROM games WHERE id = ?").bind(gid).first();
  if (!game) return null;

  let q = null;
  if (game.current_question_id) {
    q = await db.prepare("SELECT * FROM questions WHERE id = ?").bind(game.current_question_id).first();
  }

  const data = {
    game,
    question: q ? {
      id: q.id,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      question_order: q.question_order,
      status: q.status,
      is_tiebreak: q.is_tiebreak
    } : null
  };

  if (q && q.status === 'closed') {
    data.question.correct_option = q.correct_option;
    data.question.explanation = q.explanation;
    data.question.source = q.source;
  }

  // Verificar respuesta del participante si corresponde
  if (participantId && participantToken && q) {
    const pRow = await db.prepare("SELECT * FROM participants WHERE id = ? AND game_id = ?").bind(participantId, gid).first();
    if (pRow) {
      const hashed = await hashToken(participantToken);
      if (pRow.token_hash === hashed) {
        const myAns = await db.prepare("SELECT selected_option FROM answers WHERE question_id = ? AND participant_id = ?").bind(q.id, participantId).first();
        data.my_answer = myAns ? myAns.selected_option : null;
      }
    }
  }

  if (isAdmin) {
    data.question = q;
    const participantsRes = await db.prepare(`
      SELECT p.id, p.nickname, p.last_seen_at,
        CASE WHEN (strftime('%s', 'now') - strftime('%s', p.last_seen_at)) < 20 THEN 1 ELSE 0 END as connected,
        a.selected_option, a.confirmed_at
      FROM participants p
      LEFT JOIN answers a ON a.participant_id = p.id AND a.question_id = ?
      WHERE p.game_id = ?
      ORDER BY p.nickname_key
    `).bind(q ? q.id : -1, gid).all();

    data.participants = participantsRes.results || [];
    data.answer_count = data.participants.filter(x => Boolean(x.selected_option)).length;
    data.pending_count = (q && q.status === 'open') ? (data.participants.length - data.answer_count) : 0;
    data.leaderboard = await getLeaderboard(db, gid);

    const bankQ = await db.prepare("SELECT * FROM questions WHERE game_id IS NULL ORDER BY category, difficulty, id").all();
    data.questions = bankQ.results || [];

    const roundQ = await db.prepare("SELECT * FROM questions WHERE game_id = ? ORDER BY question_order, id").bind(gid).all();
    data.round_questions = roundQ.results || [];

    const allGames = await db.prepare("SELECT id, name, status FROM games ORDER BY id DESC").all();
    data.games = allGames.results || [];
  } else if (game.status === 'finished') {
    const leaders = await getLeaderboard(db, gid);
    data.podium = leaders.slice(0, 3);
  }

  return data;
}

export async function isTopScoreTied(db, gid) {
  const leaders = await getLeaderboard(db, gid);
  return leaders.length > 1 && leaders[0].score === leaders[1].score;
}

export async function addTiebreakQuestion(db, gid) {
  let source = await db.prepare(`
    SELECT * FROM questions WHERE game_id IS NULL AND id NOT IN
    (SELECT bank_id FROM questions WHERE game_id = ? AND bank_id IS NOT NULL)
    ORDER BY RANDOM() LIMIT 1
  `).bind(gid).first();

  if (!source) {
    source = await db.prepare("SELECT * FROM questions WHERE game_id IS NULL ORDER BY RANDOM() LIMIT 1").first();
  }
  if (!source) return false;

  const maxOrder = await db.prepare("SELECT COALESCE(MAX(question_order), 0) + 1 as nxt FROM questions WHERE game_id = ?").bind(gid).first();
  const order = maxOrder ? maxOrder.nxt : 1;

  await db.prepare(`
    INSERT INTO questions (
      game_id, bank_id, question_text, option_a, option_b, option_c, option_d,
      correct_option, category, difficulty, explanation, source, question_order, status, is_tiebreak
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1)
  `).bind(
    gid, source.id, source.question_text, source.option_a, source.option_b, source.option_c, source.option_d,
    source.correct_option, source.category, source.difficulty, source.explanation, source.source, order
  ).run();

  return true;
}

