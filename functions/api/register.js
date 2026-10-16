import { getActiveGame, getGameState, jsonResponse, errorResponse, norm, hashToken, generateId, setCookie, getCookie } from './_utils.js';

export async function onRequestPost({ request, env }) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch (e) {}

    const nickname = (body.nickname || '').trim().replace(/\s+/g, ' ').substring(0, 32);
    if (nickname.length < 2) {
      return errorResponse('El apodo debe tener entre 2 y 32 caracteres.', 400);
    }

    const active = await getActiveGame(env.DB);
    if (!active) {
      return errorResponse('El administrador aún no ha creado una partida.', 409);
    }

    if (active.status === 'finished') {
      return errorResponse('La partida ya ha finalizado.', 400);
    }

    const gid = active.id;
    const currentPid = getCookie(request, 'participant_id');
    const currentToken = getCookie(request, 'participant_token');

    if (currentPid && currentToken) {
      const existing = await env.DB.prepare('SELECT * FROM participants WHERE id = ? AND game_id = ?').bind(currentPid, gid).first();
      if (existing) {
        const hashed = await hashToken(currentToken);
        if (existing.token_hash === hashed) {
          await env.DB.prepare('UPDATE participants SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').bind(currentPid).run();
          const stateData = await getGameState(env.DB, gid, { participantId: currentPid, participantToken: currentToken });
          return jsonResponse({
            ok: true,
            state: {
              ...stateData,
              participant_name: existing.nickname
            }
          });
        }
      }
    }

    const pid = generateId(18);
    const token = generateId(32);
    const tokenHash = await hashToken(token);
    const key = norm(nickname);

    try {
      await env.DB.prepare(
        'INSERT INTO participants (id, game_id, nickname, nickname_key, token_hash) VALUES (?, ?, ?, ?, ?)'
      ).bind(pid, gid, nickname, key, tokenHash).run();
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) {
        return errorResponse('Ese apodo ya está en uso en esta partida.', 409);
      }
      throw e;
    }

    const stateData = await getGameState(env.DB, gid, { participantId: pid, participantToken: token });
    const isSecure = new URL(request.url).protocol === 'https:';
    const headers = new Headers();
    headers.append('Set-Cookie', setCookie('participant_id', pid, 86400 * 7, isSecure));
    headers.append('Set-Cookie', setCookie('participant_token', token, 86400 * 7, isSecure));

    return jsonResponse({
      ok: true,
      state: {
        ...stateData,
        participant_name: nickname
      }
    }, 200, headers);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

