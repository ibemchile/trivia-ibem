import { getActiveGame, getGameState, jsonResponse, errorResponse, getCookie, hashToken } from './_utils.js';

// Caché en memoria del Edge: clave gameId → {data, expiresAt}
const stateCache = new Map();
const CACHE_TTL_MS = 2000; // 2 segundos

export async function onRequestGet({ env, request }) {
  try {
    const game = await getActiveGame(env.DB);
    if (!game) {
      return errorResponse('Partida no encontrada', 404);
    }

    const gid = game.id;
    const participantId = getCookie(request, 'participant_id');
    const participantToken = getCookie(request, 'participant_token');

    // La parte pública del estado (pregunta activa, status del juego) es
    // idéntica para todos los participantes → se sirve desde caché del edge.
    // La respuesta personal (my_answer) se añade encima sin ir a D1 extra.
    const cacheKey = `state:${gid}`;
    const now = Date.now();
    let cached = stateCache.get(cacheKey);

    if (!cached || now > cached.expiresAt) {
      // Caché expirada o inexistente → consultar D1
      const freshData = await getGameState(env.DB, gid, { isAdmin: false });
      cached = { data: freshData, expiresAt: now + CACHE_TTL_MS };
      stateCache.set(cacheKey, cached);
    }

    // Clonar para no mutar la caché compartida
    const response = JSON.parse(JSON.stringify(cached.data));

    if (response.question?.is_tiebreak) {
      const eligible = participantId ? await env.DB.prepare(
        'SELECT 1 FROM tiebreak_eligibility WHERE question_id = ? AND participant_id = ?'
      ).bind(response.question.id, participantId).first() : null;
      if (!eligible) response.question = null;
    }

    // Añadir respuesta personal del participante (dos SELECTs rápidos por índice)
    if (participantId && participantToken && response.question) {
      try {
        const pRow = await env.DB.prepare(
          'SELECT token_hash FROM participants WHERE id = ? AND game_id = ?'
        ).bind(participantId, gid).first();

        if (pRow) {
          const hashed = await hashToken(participantToken);
          if (pRow.token_hash === hashed) {
            const myAns = await env.DB.prepare(
              'SELECT selected_option FROM answers WHERE question_id = ? AND participant_id = ?'
            ).bind(response.question.id, participantId).first();
            response.my_answer = myAns ? myAns.selected_option : null;
          }
        }
      } catch (e) {}
    }

    return jsonResponse(response);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

