import hashlib
import hmac
import secrets
import sqlite3
import unicodedata
from functools import wraps

from flask import Blueprint, current_app, jsonify, render_template, request, session

from . import socketio
from .db import get_db

bp = Blueprint("main", __name__)
LETTERS = "ABCD"
ROUND_SIZES = (10, 15, 20)


def active_game(db=None):
    db = db or get_db()
    row = db.execute("SELECT * FROM games WHERE status!='finished' ORDER BY id DESC LIMIT 1").fetchone()
    return row or db.execute("SELECT * FROM games ORDER BY id DESC LIMIT 1").fetchone()


def top_score_tied(gid):
    leaders = leaderboard(gid)
    return len(leaders) > 1 and leaders[0]["score"] == leaders[1]["score"]


def add_tiebreak_question(db, gid):
    unused = db.execute("""SELECT * FROM questions WHERE game_id IS NULL AND id NOT IN
        (SELECT bank_id FROM questions WHERE game_id=? AND bank_id IS NOT NULL) ORDER BY RANDOM() LIMIT 1""", (gid,)).fetchone()
    source = unused or db.execute("SELECT * FROM questions WHERE game_id IS NULL ORDER BY RANDOM() LIMIT 1").fetchone()
    if not source:
        return False
    order = db.execute("SELECT COALESCE(MAX(question_order),0)+1 FROM questions WHERE game_id=?", (gid,)).fetchone()[0]
    db.execute("""INSERT INTO questions(game_id,bank_id,question_text,option_a,option_b,option_c,option_d,
        correct_option,category,difficulty,explanation,source,question_order,status,is_tiebreak)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',1)""", (gid,source["id"],source["question_text"],source["option_a"],source["option_b"],source["option_c"],source["option_d"],source["correct_option"],source["category"],source["difficulty"],source["explanation"],source["source"],order))
    return True


def norm(value):
    return " ".join(unicodedata.normalize("NFKC", value).strip().split()).casefold()


def csrf_ok():
    return hmac.compare_digest(str(session.get("csrf", "")), str(request.headers.get("X-CSRF-Token", "")))


def protected(fn):
    @wraps(fn)
    def inner(*args, **kwargs):
        if not session.get("admin"):
            return jsonify(error="Debes iniciar sesión como administrador."), 401
        if request.method not in ("GET", "HEAD", "OPTIONS") and not csrf_ok():
            return jsonify(error="Token CSRF inválido."), 400
        return fn(*args, **kwargs)
    return inner


def participant():
    pid, gid, token = session.get("participant_id"), session.get("game_id"), session.get("participant_token")
    if not pid or not gid or not token:
        return None
    row = get_db().execute("SELECT * FROM participants WHERE id=? AND game_id=?", (pid, gid)).fetchone()
    if row and hmac.compare_digest(row["token_hash"], hashlib.sha256(token.encode()).hexdigest()):
        return row
    return None


def public_question(row):
    if not row:
        return None
    return {key: row[key] for key in ("id", "question_text", "option_a", "option_b", "option_c", "option_d", "question_order", "status", "is_tiebreak")}


def leaderboard(gid):
    rows = get_db().execute("""SELECT p.id,p.nickname,COALESCE(SUM(a.points_awarded),0) score,
        COALESCE(SUM(a.is_correct),0) correct,COUNT(a.id) answered,
        (SELECT COUNT(*) FROM questions q WHERE q.game_id=? AND q.status IN ('closed','open'))-COUNT(a.id) unanswered
        FROM participants p LEFT JOIN answers a ON a.participant_id=p.id AND a.game_id=p.game_id
        WHERE p.game_id=? GROUP BY p.id ORDER BY score DESC,correct DESC,p.created_at ASC""", (gid, gid))
    result, rank, prior = [], 0, None
    for row in rows:
        item = dict(row)
        key = (item["score"], item["correct"])
        if key != prior:
            rank = len(result) + 1
        item["position"] = rank
        result.append(item)
        prior = key
    return result


def state(gid, admin=False):
    db = get_db()
    game = db.execute("SELECT * FROM games WHERE id=?", (gid,)).fetchone()
    if not game:
        return None
    q = db.execute("SELECT * FROM questions WHERE id=?", (game["current_question_id"],)).fetchone() if game["current_question_id"] else None
    data = {"game": dict(game), "question": public_question(q)}
    if q and q["status"] == "closed":
        data["question"].update({"correct_option": q["correct_option"], "explanation": q["explanation"], "source": q["source"]})
    p = participant()
    if p:
        ans = db.execute("SELECT selected_option FROM answers WHERE question_id=? AND participant_id=?", (q["id"], p["id"])).fetchone() if q else None
        data["my_answer"] = ans[0] if ans else None
    if admin:
        data["question"] = dict(q) if q else None
        data["participants"] = [dict(x) for x in db.execute("""SELECT p.id,p.nickname,p.last_seen_at,
            CASE WHEN s.sid IS NULL THEN 0 ELSE 1 END connected,a.selected_option,a.confirmed_at
            FROM participants p LEFT JOIN
            (SELECT participant_id,MAX(sid) sid FROM socket_presence GROUP BY participant_id) s ON s.participant_id=p.id
            LEFT JOIN answers a ON a.participant_id=p.id AND a.question_id=?
            WHERE p.game_id=? ORDER BY p.nickname_key""", (q["id"] if q else -1, gid))]
        data["answer_count"] = sum(bool(x["selected_option"]) for x in data["participants"])
        data["pending_count"] = len(data["participants"]) - data["answer_count"] if q and q["status"] == "open" else 0
        data["leaderboard"] = leaderboard(gid)
        data["questions"] = [dict(x) for x in db.execute("SELECT * FROM questions WHERE game_id IS NULL ORDER BY category,difficulty,id")]
        data["round_questions"] = [dict(x) for x in db.execute("SELECT * FROM questions WHERE game_id=? ORDER BY question_order,id", (gid,))]
        data["games"] = [dict(x) for x in db.execute("SELECT id,name,status FROM games ORDER BY id DESC")]
    elif game["status"] == "finished":
        data["podium"] = leaderboard(gid)[:3]
    return data


def emit_game(gid, event="state_updated"):
    # El evento solo invalida la vista: cada cliente vuelve a pedir el estado
    # permitido por su propia sesión. Nunca publicar la clave correcta en la sala.
    socketio.emit(event, {"updated": True}, to=f"game_{gid}")


@bp.before_app_request
def setup_csrf():
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(24)


@bp.get("/")
def home():
    return render_template("participant.html", csrf=session["csrf"])


@bp.get("/admin")
def admin_page():
    return render_template("admin.html", csrf=session["csrf"])


@bp.get("/admin/proyeccion")
def projection():
    return render_template("projection.html", csrf=session["csrf"])


@bp.post("/api/admin/login")
def admin_login():
    if not csrf_ok():
        return jsonify(error="Token CSRF inválido."), 400
    body = request.get_json(silent=True) or {}
    if not current_app.config["ADMIN_PASSWORD"]:
        return jsonify(error="Configura ADMIN_PASSWORD en el entorno antes de iniciar."), 503
    valid = hmac.compare_digest(str(body.get("username", "")), str(current_app.config["ADMIN_USERNAME"]))
    valid &= hmac.compare_digest(str(body.get("password", "")), str(current_app.config["ADMIN_PASSWORD"]))
    if not valid:
        return jsonify(error="Credenciales incorrectas."), 401
    session.clear()
    session["admin"] = True
    current = active_game()
    session["admin_game"] = current["id"] if current else 1
    session["csrf"] = secrets.token_urlsafe(24)
    return jsonify(ok=True, csrf=session["csrf"])


@bp.post("/api/admin/logout")
@protected
def logout():
    session.clear()
    return jsonify(ok=True)


@bp.get("/api/state")
def public_state():
    game = active_game()
    data = state(game["id"]) if game else None
    return (jsonify(data), 200) if data else (jsonify(error="Partida no encontrada"), 404)


@bp.get("/api/admin/state")
@protected
def admin_state():
    gid = request.args.get("game", type=int) or session.get("admin_game", 1)
    data = state(gid, admin=True)
    return (jsonify(data), 200) if data else (jsonify(error="Partida no encontrada"), 404)


@bp.post("/api/register")
def register():
    if not csrf_ok():
        return jsonify(error="Token CSRF inválido."), 400
    body = request.get_json(silent=True) or {}
    nickname = " ".join(str(body.get("nickname", "")).strip().split())[:32]
    if len(nickname) < 2:
        return jsonify(error="El apodo debe tener entre 2 y 32 caracteres."), 400
    db = get_db()
    active = active_game(db)
    if not active:
        return jsonify(error="El administrador aún no ha creado una partida."), 409
    gid = active["id"]
    if not db.execute("SELECT 1 FROM games WHERE id=? AND status!='finished'", (gid,)).fetchone():
        return jsonify(error="La partida no está disponible."), 400
    existing = participant()
    if existing and existing["game_id"] == gid:
        db.execute("UPDATE participants SET last_seen_at=CURRENT_TIMESTAMP WHERE id=?", (existing["id"],))
        return jsonify(ok=True, state=state(gid))
    pid, token = secrets.token_urlsafe(18), secrets.token_urlsafe(32)
    try:
        db.execute("INSERT INTO participants(id,game_id,nickname,nickname_key,token_hash) VALUES(?,?,?,?,?)", (pid, gid, nickname, norm(nickname), hashlib.sha256(token.encode()).hexdigest()))
    except sqlite3.IntegrityError:
        return jsonify(error="Ese apodo ya está en uso en esta partida."), 409
    session["participant_id"], session["game_id"], session["participant_token"] = pid, gid, token
    emit_game(gid)
    return jsonify(ok=True, state=state(gid))


@bp.post("/api/answer")
def answer():
    if not csrf_ok():
        return jsonify(error="Token CSRF inválido."), 400
    p = participant()
    if not p:
        return jsonify(error="Identidad de participante no válida; vuelve a ingresar."), 401
    choice = str((request.get_json(silent=True) or {}).get("choice", "")).upper()
    if choice not in LETTERS:
        return jsonify(error="Alternativa inválida."), 400
    db = get_db()
    try:
        db.execute("BEGIN IMMEDIATE")
        game = db.execute("SELECT * FROM games WHERE id=?", (p["game_id"],)).fetchone()
        q = db.execute("SELECT * FROM questions WHERE id=?", (game["current_question_id"],)).fetchone() if game and game["current_question_id"] else None
        if not game or game["status"] != "running" or not q or q["status"] != "open":
            db.rollback()
            return jsonify(error="La pregunta está cerrada."), 409
        correct = int(choice == q["correct_option"])
        db.execute("INSERT INTO answers(game_id,question_id,participant_id,selected_option,is_correct,points_awarded) VALUES(?,?,?,?,?,?)", (game["id"], q["id"], p["id"], choice, correct, correct))
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return jsonify(error="Ya confirmaste una respuesta para esta pregunta."), 409
    emit_game(p["game_id"], "answer_confirmed")
    return jsonify(ok=True)


@bp.post("/api/admin/games")
@protected
def create_game():
    body = request.get_json(silent=True) or {}
    name = str(body.get("name", "")).strip()[:80]
    round_size = body.get("round_size", 10)
    if not name:
        return jsonify(error="Escribe un nombre para la partida."), 400
    if round_size not in ROUND_SIZES:
        return jsonify(error="La ronda debe tener 10, 15 o 20 preguntas."), 400
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    for previous in db.execute("SELECT id,current_question_id FROM games WHERE status!='finished'").fetchall():
        if previous["current_question_id"]:
            db.execute("UPDATE questions SET status='closed' WHERE id=? AND status='open'", (previous["current_question_id"],))
        db.execute("UPDATE games SET status='finished',finished_at=CURRENT_TIMESTAMP WHERE id=?", (previous["id"],))
    cur = db.execute("INSERT INTO games(name,status,round_size) VALUES(?,'waiting',?)", (name, round_size))
    gid = cur.lastrowid
    db.commit()
    session["admin_game"] = gid
    socketio.emit("active_game_changed", {"game_id": gid})
    return jsonify(ok=True, game_id=gid)


@bp.post("/api/admin/select-game")
@protected
def select_game():
    gid = (request.get_json(silent=True) or {}).get("game_id")
    if not get_db().execute("SELECT 1 FROM games WHERE id=?", (gid,)).fetchone():
        return jsonify(error="Partida desconocida."), 404
    session["admin_game"] = int(gid)
    return jsonify(ok=True)


@bp.post("/api/admin/display-settings")
@protected
def display_settings():
    body = request.get_json(silent=True) or {}
    gid = int(body.get("game_id") or session.get("admin_game", 1))
    value = int(bool(body.get("show_leaderboard_after_question")))
    cur = get_db().execute("UPDATE games SET show_leaderboard_after_question=? WHERE id=? AND status!='finished'", (value, gid))
    if not cur.rowcount:
        return jsonify(error="Partida finalizada o desconocida."), 409
    emit_game(gid)
    return jsonify(ok=True)


@bp.post("/api/admin/round-size")
@protected
def set_round_size():
    body = request.get_json(silent=True) or {}
    gid = int(body.get("game_id") or session.get("admin_game", 1))
    size = body.get("round_size")
    if size not in ROUND_SIZES:
        return jsonify(error="La ronda debe tener 10, 15 o 20 preguntas."), 400
    cur = get_db().execute("UPDATE games SET round_size=? WHERE id=? AND status='waiting'", (size, gid))
    return (jsonify(ok=True), 200) if cur.rowcount else (jsonify(error="La ronda solo se puede cambiar antes de comenzar."), 409)


@bp.post("/api/admin/questions")
@protected
def save_question():
    body = request.get_json(silent=True) or {}
    qid = body.get("id")
    fields = [str(body.get(k, "")).strip() for k in ("question_text", "option_a", "option_b", "option_c", "option_d")]
    correct = str(body.get("correct_option", "A")).upper()
    if any(not f for f in fields) or correct not in LETTERS:
        return jsonify(error="Completa la pregunta y las cuatro alternativas; elige una correcta."), 400
    category = str(body.get("category", "General")).strip()[:60]
    difficulty = str(body.get("difficulty", "Básica"))[:20]
    explanation, source = str(body.get("explanation", ""))[:500], str(body.get("source", ""))[:300]
    db = get_db()
    if qid:
        row = db.execute("SELECT * FROM questions WHERE id=?", (qid,)).fetchone()
        if not row or row["used"]:
            return jsonify(error="No se puede editar una pregunta ya utilizada."), 409
        db.execute("UPDATE questions SET question_text=?,option_a=?,option_b=?,option_c=?,option_d=?,correct_option=?,category=?,difficulty=?,explanation=?,source=? WHERE id=?", (*fields, correct, category, difficulty, explanation, source, qid))
    else:
        db.execute("INSERT INTO questions(game_id,question_text,option_a,option_b,option_c,option_d,correct_option,category,difficulty,explanation,source,question_order,status) VALUES(NULL,?,?,?,?,?,?,?,?,?,?,0,'draft')", (*fields, correct, category, difficulty, explanation, source))
    return jsonify(ok=True)


@bp.post("/api/admin/questions/delete")
@protected
def delete_question():
    qid = (request.get_json(silent=True) or {}).get("id")
    cur = get_db().execute("DELETE FROM questions WHERE id=? AND used=0 AND game_id IS NULL", (qid,))
    return (jsonify(ok=True), 200) if cur.rowcount else (jsonify(error="Pregunta utilizada o no encontrada."), 409)


@bp.post("/api/admin/control/<action>")
@protected
def control(action):
    db = get_db()
    gid = int((request.get_json(silent=True) or {}).get("game_id") or session.get("admin_game", 1))
    game = db.execute("SELECT * FROM games WHERE id=?", (gid,)).fetchone()
    if not game:
        return jsonify(error="Partida no encontrada."), 404
    q = db.execute("SELECT * FROM questions WHERE id=?", (game["current_question_id"],)).fetchone() if game["current_question_id"] else None
    try:
        db.execute("BEGIN IMMEDIATE")
        if action == "start-game":
            if game["status"] != "waiting": raise ValueError("La partida ya comenzó.")
            bank = db.execute("SELECT * FROM questions WHERE game_id IS NULL ORDER BY RANDOM() LIMIT ?", (game["round_size"],)).fetchall()
            if len(bank) < game["round_size"]: raise ValueError("El banco no tiene suficientes preguntas para esta ronda.")
            db.execute("DELETE FROM questions WHERE game_id=?", (gid,))
            for order, item in enumerate(bank, 1):
                db.execute("""INSERT INTO questions(game_id,bank_id,question_text,option_a,option_b,option_c,option_d,
                    correct_option,category,difficulty,explanation,source,question_order,status)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')""", (gid,item["id"],item["question_text"],item["option_a"],item["option_b"],item["option_c"],item["option_d"],item["correct_option"],item["category"],item["difficulty"],item["explanation"],item["source"],order))
            db.execute("UPDATE games SET status='running',started_at=CURRENT_TIMESTAMP WHERE id=?", (gid,))
        elif action == "start-question":
            if game["status"] != "running" or (q and q["status"] != "closed"): raise ValueError("Cierra la pregunta actual antes de iniciar otra.")
            nxt = db.execute("SELECT * FROM questions WHERE game_id=? AND status='draft' ORDER BY question_order,id LIMIT 1", (gid,)).fetchone()
            if not nxt: raise ValueError("No quedan preguntas pendientes.")
            db.execute("UPDATE questions SET status='open',used=1 WHERE id=?", (nxt["id"],))
            if nxt["bank_id"]:
                db.execute("UPDATE questions SET used=1 WHERE id=? AND game_id IS NULL", (nxt["bank_id"],))
            db.execute("UPDATE games SET current_question_id=? WHERE id=?", (nxt["id"], gid))
        elif action == "close-question":
            if not q or q["status"] != "open": raise ValueError("No hay una pregunta abierta.")
            db.execute("UPDATE questions SET status='closed' WHERE id=?", (q["id"],))
            if q["is_tiebreak"] or q["question_order"] >= game["round_size"]:
                if top_score_tied(gid) and not add_tiebreak_question(db, gid):
                    raise ValueError("No hay preguntas disponibles para el desempate.")
        elif action == "finish-game":
            if q and q["status"] == "open":
                db.execute("UPDATE questions SET status='closed' WHERE id=?", (q["id"],))
            pending_tiebreak = db.execute("SELECT 1 FROM questions WHERE game_id=? AND is_tiebreak=1 AND status='draft' LIMIT 1", (gid,)).fetchone()
            if pending_tiebreak: raise ValueError("Hay un empate. Inicia la pregunta de desempate antes de finalizar.")
            closed_regular = db.execute("SELECT COUNT(*) FROM questions WHERE game_id=? AND is_tiebreak=0 AND status='closed'", (gid,)).fetchone()[0]
            if closed_regular >= game["round_size"] and top_score_tied(gid):
                if not add_tiebreak_question(db, gid): raise ValueError("No hay preguntas disponibles para el desempate.")
                db.commit()
                emit_game(gid)
                return jsonify(ok=True, tiebreak_added=True, message="Empate: se agregó una pregunta de desempate.", state=state(gid,admin=True))
            db.execute("UPDATE games SET status='finished',finished_at=CURRENT_TIMESTAMP WHERE id=?", (gid,))
        else:
            raise ValueError("Acción desconocida.")
        db.commit()
    except ValueError as e:
        db.rollback()
        return jsonify(error=str(e)), 409
    emit_game(gid)
    return jsonify(ok=True, state=state(gid, admin=True))


@bp.get("/api/admin/results/<participant_id>")
@protected
def participant_results(participant_id):
    gid = request.args.get("game", type=int) or session.get("admin_game", 1)
    rows = [dict(r) for r in get_db().execute("""SELECT q.question_order,q.question_text,q.correct_option,q.explanation,q.source,
        a.selected_option,a.is_correct,a.points_awarded FROM answers a JOIN questions q ON q.id=a.question_id
        WHERE a.participant_id=? AND a.game_id=? ORDER BY q.question_order""", (participant_id, gid))]
    return jsonify(answers=rows)
