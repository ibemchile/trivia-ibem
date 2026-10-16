import hashlib
import hmac
from flask import request, session
from flask_socketio import join_room
from .db import get_db


def register_socket_events(socketio):
    @socketio.on("connect")
    def connected(auth=None):
        gid = session.get("game_id") or session.get("admin_game")
        if not gid:
            return
        db = get_db()
        if session.get("admin"):
            join_room(f"game_{gid}")
            return
        pid, token = session.get("participant_id"), session.get("participant_token")
        row = db.execute("SELECT token_hash FROM participants WHERE id=? AND game_id=?", (pid, gid)).fetchone() if pid and token else None
        if not row or not hmac.compare_digest(row["token_hash"], hashlib.sha256(token.encode()).hexdigest()):
            return False
        db.execute("INSERT OR REPLACE INTO socket_presence(sid,participant_id,game_id) VALUES(?,?,?)", (request.sid, pid, gid))
        db.execute("UPDATE participants SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?", (pid,))
        join_room(f"game_{gid}")
        socketio.emit("state_updated", {"connected": True}, to=f"game_{gid}")

    @socketio.on("join_admin")
    def admin_join(data):
        if not session.get("admin"):
            return {"error": "No autorizado"}
        gid = int((data or {}).get("game_id", session.get("admin_game", 1)))
        if not get_db().execute("SELECT 1 FROM games WHERE id=?", (gid,)).fetchone():
            return {"error": "Partida no encontrada"}
        join_room(f"game_{gid}")
        return {"ok": True}

    @socketio.on("disconnect")
    def disconnected(reason=None):
        row = get_db().execute("SELECT game_id FROM socket_presence WHERE sid=?", (request.sid,)).fetchone()
        get_db().execute("DELETE FROM socket_presence WHERE sid=?", (request.sid,))
        if row:
            socketio.emit("state_updated", {"connected": False}, to=f"game_{row['game_id']}")
