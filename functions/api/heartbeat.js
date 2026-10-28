import { getCookie, hashToken, jsonResponse, errorResponse } from './_utils.js';

export async function onRequestPost({ env, request }) {
  try {
    const participantId = getCookie(request, 'participant_id');
    const participantToken = getCookie(request, 'participant_token');
    if (!participantId || !participantToken) {
      return jsonResponse({ ok: false });
    }

    const pRow = await env.DB.prepare(
      'SELECT token_hash FROM participants WHERE id = ?'
    ).bind(participantId).first();

    if (!pRow) return jsonResponse({ ok: false });

    const hashed = await hashToken(participantToken);
    if (pRow.token_hash !== hashed) return jsonResponse({ ok: false });

    await env.DB.prepare(
      'UPDATE participants SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(participantId).run();

    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse(err.message, 500);
  }
}
