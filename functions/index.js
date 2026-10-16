// Entrypoint para Cloudflare Worker con Assets estáticos y rutas /api/
import * as stateEndpoint from './api/state.js';
import * as registerEndpoint from './api/register.js';
import * as answerEndpoint from './api/answer.js';
import * as adminLogin from './api/admin/login.js';
import * as adminLogout from './api/admin/logout.js';
import * as adminState from './api/admin/state.js';
import * as adminGames from './api/admin/games.js';
import * as adminRoundSize from './api/admin/round-size.js';
import * as adminDisplaySettings from './api/admin/display-settings.js';
import * as adminSelectGame from './api/admin/select-game.js';
import * as adminQuestionsIndex from './api/admin/questions/index.js';
import * as adminQuestionsDelete from './api/admin/questions/delete.js';
import * as adminControlAction from './api/admin/control/[action].js';
import * as adminResultsParticipant from './api/admin/results/[participant_id].js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Rutas de la API
    if (pathname.startsWith('/api/')) {
      const method = request.method;

      if (pathname === '/api/state' && method === 'GET') {
        return stateEndpoint.onRequestGet({ request, env, ctx });
      }
      if (pathname === '/api/register' && method === 'POST') {
        return registerEndpoint.onRequestPost({ request, env, ctx });
      }
      if (pathname === '/api/answer' && method === 'POST') {
        return answerEndpoint.onRequestPost({ request, env, ctx });
      }
      if (pathname === '/api/admin/login' && method === 'POST') {
        return adminLogin.onRequestPost({ request, env, ctx });
      }
      if (pathname === '/api/admin/logout' && method === 'POST') {
        return adminLogout.onRequestPost({ request, env, ctx });
      }
      if (pathname === '/api/admin/state' && method === 'GET') {
        return adminState.onRequestGet({ request, env, ctx });
      }
      if (pathname === '/api/admin/games' && method === 'POST') {
        return adminGames.onRequestPost({ request, env, ctx });
      }
      if (pathname === '/api/admin/round-size' && method === 'POST') {
        return adminRoundSize.onRequestPost({ request, env, ctx });
      }
      if (pathname === '/api/admin/display-settings' && method === 'POST') {
        return adminDisplaySettings.onRequestPost({ request, env, ctx });
      }
      if (pathname === '/api/admin/select-game' && method === 'POST') {
        return adminSelectGame.onRequestPost({ request, env, ctx });
      }
      if (pathname === '/api/admin/questions' && method === 'POST') {
        return adminQuestionsIndex.onRequestPost({ request, env, ctx });
      }
      if (pathname === '/api/admin/questions/delete' && method === 'POST') {
        return adminQuestionsDelete.onRequestPost({ request, env, ctx });
      }

      const controlMatch = pathname.match(/^\/api\/admin\/control\/([^/]+)$/);
      if (controlMatch && method === 'POST') {
        return adminControlAction.onRequestPost({ request, params: { action: controlMatch[1] }, env, ctx });
      }

      const resultsMatch = pathname.match(/^\/api\/admin\/results\/([^/]+)$/);
      if (resultsMatch && method === 'GET') {
        return adminResultsParticipant.onRequestGet({ request, params: { participant_id: resultsMatch[1] }, env, ctx });
      }

      return new Response(JSON.stringify({ error: 'Endpoint no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Servir assets estáticos (HTML, CSS, JS, imágenes) desde env.ASSETS
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  }
};
