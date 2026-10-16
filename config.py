import os


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "")
    ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
    DATABASE_PATH = os.environ.get("DATABASE_PATH", "instance/trivia.sqlite3")
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "1").lower() not in ("0", "false", "no")
    MAX_CONTENT_LENGTH = 64 * 1024
