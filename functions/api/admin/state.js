import { verifyAdmin, getActiveGame, getGameState, jsonResponse, errorResponse } from '../_utils.js';

export async function onRequestGet({ request, env }) {
  try {
    const isAdmin = await verifyAdmin(request, env);
    if (!isAdmin) {
      return errorResponse('Debes iniciar sesión como administrador.', 401);
    }

    const url = new URL(request.url);
    const gameParam = url.searchParams.get('game');

    let gid = gameParam ? parseInt(gameParam, 10) : null;
    if (!gid) {
      const active = await getActiveGame(env.DB);
      gid = active ? active.id : 1;
    }

    const data = await getGameState(env.DB, gid, { isAdmin: true });
    if (!data) {
      return errorResponse('Partida no encontrada', 404);
    }

    return jsonResponse(data);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}

