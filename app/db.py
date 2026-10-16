import sqlite3
from flask import current_app, g

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS games (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting',
 current_question_id INTEGER, show_leaderboard_after_question INTEGER NOT NULL DEFAULT 0,
 round_size INTEGER NOT NULL DEFAULT 10,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 started_at TEXT, finished_at TEXT
);
CREATE TABLE IF NOT EXISTS participants (
 id TEXT PRIMARY KEY, game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
 nickname TEXT NOT NULL, nickname_key TEXT NOT NULL, token_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(game_id,nickname_key)
);
CREATE TABLE IF NOT EXISTS questions (
 id INTEGER PRIMARY KEY, game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
 bank_id INTEGER, question_text TEXT NOT NULL, option_a TEXT NOT NULL, option_b TEXT NOT NULL,
 option_c TEXT NOT NULL, option_d TEXT NOT NULL, correct_option TEXT NOT NULL CHECK(correct_option IN ('A','B','C','D')),
 category TEXT NOT NULL DEFAULT 'General', difficulty TEXT NOT NULL DEFAULT 'Básica',
 explanation TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', question_order INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'draft', used INTEGER NOT NULL DEFAULT 0,
 is_tiebreak INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS answers (
 id INTEGER PRIMARY KEY, game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
 question_id INTEGER NOT NULL REFERENCES questions(id), participant_id TEXT NOT NULL REFERENCES participants(id),
 selected_option TEXT NOT NULL CHECK(selected_option IN ('A','B','C','D')),
 confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, is_correct INTEGER NOT NULL DEFAULT 0,
 points_awarded INTEGER NOT NULL DEFAULT 0, UNIQUE(question_id,participant_id)
);
CREATE TABLE IF NOT EXISTS socket_presence (
 sid TEXT PRIMARY KEY, participant_id TEXT REFERENCES participants(id) ON DELETE CASCADE,
 game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE, connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_participants_game ON participants(game_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
"""

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE_PATH"], timeout=10, isolation_level=None)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys=ON")
        g.db.execute("PRAGMA journal_mode=WAL")
    return g.db

def close_db(_=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()

def init_db():
    db = get_db()
    db.executescript(SCHEMA)
    game_columns = {row["name"] for row in db.execute("PRAGMA table_info(games)")}
    if "show_leaderboard_after_question" not in game_columns:
        db.execute("ALTER TABLE games ADD COLUMN show_leaderboard_after_question INTEGER NOT NULL DEFAULT 0")
    if "round_size" not in game_columns:
        db.execute("ALTER TABLE games ADD COLUMN round_size INTEGER NOT NULL DEFAULT 10")
    question_columns = {row["name"] for row in db.execute("PRAGMA table_info(questions)")}
    if "is_tiebreak" not in question_columns:
        db.execute("ALTER TABLE questions ADD COLUMN is_tiebreak INTEGER NOT NULL DEFAULT 0")
    db.execute("DELETE FROM socket_presence")
    if db.execute("SELECT 1 FROM games LIMIT 1").fetchone() is None:
        db.execute("INSERT INTO games(name,status,round_size) VALUES(?, 'waiting',10)", ("Trivia Día de la Reforma",))
    from .seed import QUESTIONS
    if db.execute("SELECT 1 FROM questions WHERE game_id IS NULL LIMIT 1").fetchone() is None:
        db.executemany("""INSERT INTO questions(game_id,question_text,option_a,option_b,option_c,option_d,
            correct_option,category,difficulty,explanation,source,question_order,status)
            VALUES(NULL,?,?,?,?,?,?,?,?,?,?,?, 'draft')""", QUESTIONS)

def init_app(app):
    app.teardown_appcontext(close_db)
