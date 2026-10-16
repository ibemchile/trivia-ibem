import { getActiveGame, getGameState, jsonResponse, errorResponse, getCookie } from './_utils.js';

export async function onRequestGet({ env, request }) {
  try {
    const game = await getActiveGame(env.DB);
    if (!game) {
      return errorResponse('Partida no encontrada', 404);
    }

    const participantId = getCookie(request, 'participant_id');
    const participantToken = getCookie(request, 'participant_token');

    // Registrar heartbeat (last_seen_at) para que la pantalla del admin vea activo al jugador
    if (participantId) {
      try {
        await env.DB.prepare("UPDATE participants SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(participantId).run();
      } catch (e) {}
    }

    const data = await getGameState(env.DB, game.id, {
      isAdmin: false,
      participantId,
      participantToken
    });

    return jsonResponse(data);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

