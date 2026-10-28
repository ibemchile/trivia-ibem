import { findPodiumTie, partitionNeedsAnotherRound, splitTiebreakGroup } from './_tiebreak.mjs';

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
      COALESCE(SUM(CASE WHEN q.is_tiebreak = 0 THEN a.points_awarded ELSE 0 END), 0) as score,
      COUNT(a.id) as answered,
      (SELECT COUNT(*) FROM questions q WHERE q.game_id = ? AND q.status IN ('closed', 'open')) - COUNT(a.id) as unanswered,
      NULL as last_tiebreak_correct, NULL as last_tiebreak_at
    FROM participants p
    LEFT JOIN answers a ON a.participant_id = p.id AND a.game_id = p.game_id
    LEFT JOIN questions q ON q.id = a.question_id
    WHERE p.game_id = ?
    GROUP BY p.id
    ORDER BY score DESC, p.created_at ASC, p.id ASC
  `).bind(gid, gid).all();

  const list = results || [];
  const placementRows = await db.prepare(`
    SELECT m.participant_id, g.position_start
    FROM tiebreak_group_members m JOIN tiebreak_groups g ON g.id = m.group_id
    WHERE g.game_id = ?
      AND g.id = (SELECT MAX(g2.id) FROM tiebreak_group_members m2 JOIN tiebreak_groups g2 ON g2.id = m2.group_id WHERE m2.participant_id = m.participant_id AND g2.game_id = ?)
  `).bind(gid, gid).all();
  const placement = new Map((placementRows.results || []).map(row => [row.participant_id, row.position_start]));
  const ranked = [];

  for (const [index, item] of list.entries()) {
    const prior = ranked[index - 1];
    const rawPosition = prior && prior.score === item.score ? prior.rawPosition : index + 1;
    item.rawPosition = rawPosition;
    item.position = placement.get(item.id) || rawPosition;
    ranked.push(item);
  }
  return ranked.sort((a, b) => a.position - b.position || b.score - a.score || a.nickname.localeCompare(b.nickname))
    .map(({ rawPosition, ...item }) => item);
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

  if (q?.is_tiebreak && participantId) {
    const eligible = await db.prepare('SELECT 1 FROM tiebreak_eligibility WHERE question_id = ? AND participant_id = ?').bind(q.id, participantId).first();
    if (!eligible) data.question = null;
  }

  if (q && q.status === 'closed') {
    if (data.question) {
      data.question.correct_option = q.correct_option;
      data.question.explanation = q.explanation;
      data.question.source = q.source;
    }
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
      WHERE p.game_id = ? AND (? = 0 OR EXISTS (SELECT 1 FROM tiebreak_eligibility e WHERE e.question_id = ? AND e.participant_id = p.id))
      ORDER BY p.nickname_key
    `).bind(q ? q.id : -1, gid, q?.is_tiebreak ? 1 : 0, q ? q.id : -1).all();

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

export async function hasUnresolvedLeaderboardTie(db, gid) {
  const active = await db.prepare("SELECT 1 FROM tiebreak_groups WHERE game_id = ? AND status = 'active' AND position_start <= 3 LIMIT 1").bind(gid).first();
  if (active) return true;
  const leaders = await getLeaderboard(db, gid);
  for (let i = 0; i < leaders.length; i++) {
    if (i + 1 > 3) break;
    if (leaders[i + 1] && leaders[i].score === leaders[i + 1].score && leaders[i].position === leaders[i + 1].position) return true;
  }
  return false;
}

export async function resolveTiebreakRound(db, question) {
  const group = await db.prepare('SELECT * FROM tiebreak_groups WHERE id = ? AND status = \'active\'').bind(question.tiebreak_group_id).first();
  if (!group) {
    await db.prepare("UPDATE questions SET status = 'closed' WHERE id = ? AND status = 'open'").bind(question.id).run();
    return;
  }
  const memberRows = await db.prepare('SELECT participant_id FROM tiebreak_group_members WHERE group_id = ? AND active = 1 ORDER BY participant_id').bind(group.id).all();
  const members = memberRows.results || [];
  const answers = await db.prepare('SELECT participant_id, is_correct FROM answers WHERE question_id = ?').bind(question.id).all();
  const resultByPlayer = new Map((answers.results || []).map(answer => [answer.participant_id, Number(answer.is_correct)]));
  // No response is not a loss. Keep the whole group intact and ask again.
  if (members.some(member => !resultByPlayer.has(member.participant_id))) {
    await db.prepare("UPDATE questions SET status = 'closed' WHERE id = ? AND status = 'open'").bind(question.id).run();
    return;
  }
  const partitions = splitTiebreakGroup(group, members, resultByPlayer);
  if (!partitions) {
    await db.prepare("UPDATE questions SET status = 'closed' WHERE id = ? AND status = 'open'").bind(question.id).run();
    return; // unanimity leaves the dispute unresolved
  }

  const statements = [
    db.prepare("UPDATE questions SET status = 'closed' WHERE id = ? AND status = 'open'").bind(question.id),
    db.prepare("UPDATE tiebreak_groups SET status = 'resolved' WHERE id = ? AND status = 'active'").bind(group.id),
    db.prepare('UPDATE tiebreak_group_members SET active = 0 WHERE group_id = ?').bind(group.id)
  ];
  for (const partition of partitions) {
    const groupIsActive = partitionNeedsAnotherRound(partition);
    statements.push(db.prepare("INSERT OR IGNORE INTO tiebreak_groups (game_id, position_start, position_end, status, parent_group_id) VALUES (?, ?, ?, ?, ?)")
      .bind(group.game_id, partition.start, partition.end, groupIsActive ? 'active' : 'resolved', group.id));
    for (const member of partition.members) {
      statements.push(db.prepare(`INSERT OR IGNORE INTO tiebreak_group_members (group_id, participant_id, active)
        SELECT id, ?, ? FROM tiebreak_groups WHERE parent_group_id = ? AND position_start = ? LIMIT 1`)
        .bind(member.participant_id, groupIsActive ? 1 : 0, group.id, partition.start));
    }
  }
  await db.batch(statements);
}

export async function addTiebreakQuestion(db, gid) {
  const alreadyPending = await db.prepare("SELECT id FROM questions WHERE game_id = ? AND is_tiebreak = 1 AND status IN ('draft','open') LIMIT 1").bind(gid).first();
  if (alreadyPending) return true;
  let group = await db.prepare("SELECT id FROM tiebreak_groups WHERE game_id = ? AND status = 'active' AND position_start <= 3 ORDER BY position_start, id LIMIT 1").bind(gid).first();
  if (!group) {
    const leaders = await getLeaderboard(db, gid);
    const tie = findPodiumTie(leaders);
    if (!tie) return false;
    const groupStatements = [db.prepare("INSERT OR IGNORE INTO tiebreak_groups (game_id, position_start, position_end, status) VALUES (?, ?, ?, 'active')").bind(gid, tie.start, tie.end)];
    for (const player of tie.members) groupStatements.push(db.prepare(`INSERT OR IGNORE INTO tiebreak_group_members (group_id, participant_id, active)
      SELECT id, ?, 1 FROM tiebreak_groups WHERE game_id = ? AND position_start = ? AND position_end = ? AND status = 'active' ORDER BY id DESC LIMIT 1`)
      .bind(player.id, gid, tie.start, tie.end));
    await db.batch(groupStatements);
    group = await db.prepare("SELECT id FROM tiebreak_groups WHERE game_id = ? AND position_start = ? AND position_end = ? AND status = 'active' ORDER BY id DESC LIMIT 1").bind(gid, tie.start, tie.end).first();
  }
  // 1. Intentar buscar una pregunta de dificultad Avanzada que no haya sido usada en esta partida
  let source = await db.prepare(`
    SELECT * FROM questions WHERE game_id IS NULL AND difficulty = 'Avanzada' AND id NOT IN
    (SELECT bank_id FROM questions WHERE game_id = ? AND bank_id IS NOT NULL)
    ORDER BY RANDOM() LIMIT 1
  `).bind(gid).first();

  // 2. Si ya se usaron todas las avanzadas, permitir reutilizar una avanzada aleatoria del banco
  if (!source) {
    source = await db.prepare("SELECT * FROM questions WHERE game_id IS NULL AND difficulty = 'Avanzada' ORDER BY RANDOM() LIMIT 1").first();
  }

  // 3. Fallback absoluto por si no hubiera ninguna avanzada en el banco (opcional)
  if (!source) {
    source = await db.prepare("SELECT * FROM questions WHERE game_id IS NULL ORDER BY RANDOM() LIMIT 1").first();
  }

  if (!source) return false;

  const maxOrder = await db.prepare("SELECT COALESCE(MAX(question_order), 0) + 1 as nxt FROM questions WHERE game_id = ?").bind(gid).first();
  const order = maxOrder ? maxOrder.nxt : 1;

  try { await db.batch([db.prepare(`
    INSERT INTO questions (
      game_id, bank_id, question_text, option_a, option_b, option_c, option_d,
      correct_option, category, difficulty, explanation, source, question_order, status, is_tiebreak, tiebreak_group_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?)
  `).bind(
    gid, source.id, source.question_text, source.option_a, source.option_b, source.option_c, source.option_d,
    source.correct_option, source.category, source.difficulty, source.explanation, source.source, order, group.id
  ), db.prepare(`INSERT INTO tiebreak_eligibility (question_id, participant_id)
    SELECT q.id, m.participant_id FROM questions q JOIN tiebreak_group_members m ON m.group_id = q.tiebreak_group_id
    WHERE q.game_id = ? AND q.question_order = ? AND q.is_tiebreak = 1`).bind(gid, order)]); } catch (err) {
    const raced = await db.prepare("SELECT id FROM questions WHERE game_id = ? AND is_tiebreak = 1 AND status IN ('draft','open') LIMIT 1").bind(gid).first();
    if (raced) return true;
    throw err;
  }

  return true;
}

