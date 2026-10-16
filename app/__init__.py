import os
from flask import Flask
from flask_socketio import SocketIO
from config import Config

socketio = SocketIO(async_mode="threading", cors_allowed_origins=[])


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)
    if not app.config.get("SECRET_KEY"):
        raise RuntimeError("Configura SECRET_KEY en el entorno antes de iniciar la aplicación.")
    os.makedirs(app.instance_path, exist_ok=True)
    from .db import init_app, init_db
    init_app(app)
    with app.app_context():
        init_db()
    from .routes import bp
    app.register_blueprint(bp)
    from .sockets import register_socket_events
    register_socket_events(socketio)
    socketio.init_app(app, async_mode="threading", cors_allowed_origins=[])
    return app
