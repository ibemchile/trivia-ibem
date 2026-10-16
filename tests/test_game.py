import os
import tempfile
import unittest

from app import create_app, socketio
from app.db import get_db


class TriviaTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmp.name, "test.sqlite3")
        self.app = create_app({"TESTING": True, "SECRET_KEY": "test-secret", "DATABASE_PATH": self.db_path,
                              "ADMIN_USERNAME": "host", "ADMIN_PASSWORD": "password", "SESSION_COOKIE_SECURE": False})
        self.client = self.app.test_client()
        self.admin = self.app.test_client()

    def tearDown(self):
        self.tmp.cleanup()

    def csrf(self):
        with self.client.session_transaction() as sess:
            return sess.get("csrf")

    def post(self, url, body):
        return self.client.post(url, json=body, headers={"X-CSRF-Token": self.csrf()})

    def login(self):
        self.admin.get("/admin")
        return self.admin.post("/api/admin/login", json={"username": "host", "password": "password"}, headers={"X-CSRF-Token": self._csrf(self.admin)})

    def admin_post(self, url, body):
        return self.admin.post(url, json=body, headers={"X-CSRF-Token": self._csrf(self.admin)})

    def start_first_question(self):
        self.assertEqual(self.login().status_code, 200)
        self.assertEqual(self.admin_post("/api/admin/round-size", {"game_id": 1, "round_size": 10}).status_code, 200)
        self.assertEqual(self.admin_post("/api/admin/control/start-game", {}).status_code, 200)
        self.assertEqual(self.admin_post("/api/admin/control/start-question", {}).status_code, 200)

    def register(self, name="Ana"):
        self.client.get("/")
        return self.post("/api/register", {"nickname": name, "game_id": 1})

    def test_participant_can_register_and_case_insensitive_duplicate_is_rejected(self):
        self.assertEqual(self.register("Ana").status_code, 200)
        other = self.app.test_client()
        other.get("/")
        response = other.post("/api/register", json={"nickname": "ANA", "game_id": 1}, headers={"X-CSRF-Token": self._csrf(other)})
        self.assertEqual(response.status_code, 409)

    @staticmethod
    def _csrf(client):
        with client.session_transaction() as sess:
            return sess["csrf"]

    def test_question_is_hidden_until_started_then_has_four_choices(self):
        self.register()
        self.assertIsNone(self.client.get("/api/state?game=1").json["question"])
        self.start_first_question()
        state = self.client.get("/api/state?game=1").json
        self.assertEqual(state["question"]["status"], "open")
        self.assertTrue(all(state["question"][f"option_{letter.lower()}"] for letter in "ABCD"))
        round_questions = self.admin.get("/api/admin/state?game=1").json["round_questions"]
        self.assertEqual(len(round_questions), 10)
        self.assertEqual(len({q["bank_id"] for q in round_questions}), 10)
        self.assertTrue({q["bank_id"] for q in round_questions}.issubset({q["id"] for q in self.admin.get("/api/admin/state?game=1").json["questions"]}))

    def test_confirmed_answer_is_persisted_and_cannot_be_changed(self):
        self.register()
        self.start_first_question()
        self.assertEqual(self.post("/api/answer", {"choice": "B"}).status_code, 200)
        self.assertEqual(self.post("/api/answer", {"choice": "A"}).status_code, 409)
        with self.app.app_context():
            row = get_db().execute("SELECT selected_option FROM answers").fetchone()
            self.assertEqual(row["selected_option"], "B")

    def test_closed_question_rejects_answers_and_awards_correct_point(self):
        self.register()
        self.start_first_question()
        state = self.client.get("/api/state?game=1").json
        correct = state["question"]
        with self.app.app_context():
            answer = get_db().execute("SELECT correct_option FROM questions WHERE id=?", (correct["id"],)).fetchone()[0]
        self.assertEqual(self.post("/api/answer", {"choice": answer}).status_code, 200)
        self.assertEqual(self.admin_post("/api/admin/control/close-question", {}).status_code, 200)
        self.assertEqual(self.post("/api/answer", {"choice": "A"}).status_code, 409)
        result = self.admin.get("/api/admin/state?game=1")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json["leaderboard"][0]["score"], 1)

    def test_admin_routes_require_authentication(self):
        self.assertEqual(self.client.get("/api/admin/state").status_code, 401)
        self.assertEqual(self.client.get("/admin").status_code, 200)

    def test_participant_reconnects_with_same_identity_and_game_survives_app_restart(self):
        self.register("Reconexion")
        before = self.client.get("/api/state?game=1").json
        participant_id = None
        with self.client.session_transaction() as sess:
            participant_id = sess["participant_id"]
        self.app = create_app({"TESTING": True, "SECRET_KEY": "test-secret", "DATABASE_PATH": self.db_path,
                              "ADMIN_USERNAME": "host", "ADMIN_PASSWORD": "password", "SESSION_COOKIE_SECURE": False})
        after = self.client.get("/api/state?game=1").json
        self.assertEqual(before["game"]["id"], after["game"]["id"])
        with self.client.session_transaction() as sess:
            self.assertEqual(sess["participant_id"], participant_id)
        with self.app.app_context():
            self.assertEqual(get_db().execute("SELECT COUNT(*) FROM participants").fetchone()[0], 1)

    def test_socket_connection_authenticates_registered_participant(self):
        self.register("Socket")
        socket_client = socketio.test_client(self.app, flask_test_client=self.client)
        self.assertTrue(socket_client.is_connected())
        socket_client.disconnect()

    def test_bank_has_at_least_fifty_categorized_questions_with_sources(self):
        self.login()
        bank = self.admin.get("/api/admin/state?game=1").json["questions"]
        self.assertGreaterEqual(len(bank), 50)
        self.assertTrue(all(q["category"] and q["difficulty"] and q["explanation"] and q["source"] for q in bank))

    def test_question_correct_answer_is_hidden_before_close(self):
        self.register()
        self.start_first_question()
        public = self.client.get("/api/state?game=1").json["question"]
        self.assertNotIn("correct_option", public)
        self.admin_post("/api/admin/control/close-question", {})
        closed = self.client.get("/api/state?game=1").json["question"]
        self.assertIn(closed["correct_option"], "ABCD")

    def test_unanswered_participant_gets_zero_and_is_counted(self):
        self.register("Sin respuesta")
        self.start_first_question()
        self.admin_post("/api/admin/control/close-question", {})
        board = self.admin.get("/api/admin/state?game=1").json["leaderboard"]
        self.assertEqual(board[0]["score"], 0)
        self.assertEqual(board[0]["unanswered"], 1)

    def test_incorrect_confirmed_answer_gets_zero(self):
        self.register()
        self.start_first_question()
        state = self.client.get("/api/state?game=1").json
        with self.app.app_context():
            correct = get_db().execute("SELECT correct_option FROM questions WHERE id=?", (state["question"]["id"],)).fetchone()[0]
        wrong = next(x for x in "ABCD" if x != correct)
        self.assertEqual(self.post("/api/answer", {"choice": wrong}).status_code, 200)
        board = self.admin.get("/api/admin/state?game=1").json["leaderboard"]
        self.assertEqual(board[0]["score"], 0)
        self.assertEqual(board[0]["correct"], 0)

    def test_finished_game_rejects_new_answers(self):
        self.register()
        self.start_first_question()
        self.assertEqual(self.admin_post("/api/admin/control/finish-game", {}).status_code, 200)
        self.assertEqual(self.post("/api/answer", {"choice": "A"}).status_code, 409)

    def test_bad_nickname_and_invalid_option_are_rejected(self):
        self.client.get("/")
        self.assertEqual(self.post("/api/register", {"nickname": "x", "game_id": 1}).status_code, 400)
        self.register("Valid")
        self.start_first_question()
        self.assertEqual(self.post("/api/answer", {"choice": "Z"}).status_code, 400)

    def test_csrf_protection_rejects_missing_token(self):
        self.client.get("/")
        response = self.client.post("/api/register", json={"nickname": "NoCSRF", "game_id": 1})
        self.assertEqual(response.status_code, 400)

    def test_admin_can_create_a_question_and_game(self):
        self.login()
        question = {"question_text":"Pregunta propia", "option_a":"Uno", "option_b":"Dos", "option_c":"Tres", "option_d":"Cuatro", "correct_option":"C", "category":"Congregación", "difficulty":"Básica", "explanation":"Porque sí", "source":"Génesis 1:1"}
        self.assertEqual(self.admin_post("/api/admin/questions", question).status_code, 200)
        game = self.admin_post("/api/admin/games", {"name":"Encuentro de octubre", "round_size": 15})
        self.assertEqual(game.status_code, 200)
        self.assertGreater(game.json["game_id"], 1)
        self.assertEqual(self.admin.get(f"/api/admin/state?game={game.json['game_id']}").json["game"]["round_size"], 15)

    def test_rejoining_with_same_session_does_not_create_duplicate(self):
        self.assertEqual(self.register("Repite").status_code, 200)
        self.assertEqual(self.post("/api/register", {"nickname": "Repite", "game_id": 1}).status_code, 200)
        with self.app.app_context():
            self.assertEqual(get_db().execute("SELECT COUNT(*) FROM participants").fetchone()[0], 1)

    def test_non_admin_cannot_join_admin_socket_room(self):
        self.register("Participante")
        socket_client = socketio.test_client(self.app, flask_test_client=self.client)
        reply = socket_client.emit("join_admin", {"game_id": 1}, callback=True)
        self.assertEqual(reply["error"], "No autorizado")
        socket_client.disconnect()

    def test_room_broadcast_never_contains_correct_answer(self):
        self.register("SocketSeguro")
        participant_socket = socketio.test_client(self.app, flask_test_client=self.client)
        self.start_first_question()
        events = participant_socket.get_received()
        self.assertTrue(events)
        self.assertTrue(all("correct_option" not in str(event["args"]) for event in events))
        participant_socket.disconnect()

    def test_tied_players_share_leaderboard_position(self):
        self.register("Ana")
        second = self.app.test_client()
        second.get("/")
        second.post("/api/register", json={"nickname": "Beto", "game_id": 1}, headers={"X-CSRF-Token": self._csrf(second)})
        self.start_first_question()
        question_id = self.client.get("/api/state?game=1").json["question"]["id"]
        with self.app.app_context():
            correct = get_db().execute("SELECT correct_option FROM questions WHERE id=?", (question_id,)).fetchone()[0]
        self.post("/api/answer", {"choice": correct})
        second.post("/api/answer", json={"choice": correct}, headers={"X-CSRF-Token": self._csrf(second)})
        self.admin_post("/api/admin/control/close-question", {})
        board = self.admin.get("/api/admin/state?game=1").json["leaderboard"]
        self.assertEqual([x["position"] for x in board], [1, 1])

    def test_login_is_disabled_when_admin_password_is_missing(self):
        empty = create_app({"TESTING": True, "SECRET_KEY": "test", "DATABASE_PATH": self.db_path + ".empty", "ADMIN_PASSWORD": ""})
        client = empty.test_client()
        client.get("/admin")
        response = client.post("/api/admin/login", json={"username": "admin", "password": ""}, headers={"X-CSRF-Token": self._csrf(client)})
        self.assertEqual(response.status_code, 503)

    def test_tied_round_adds_sudden_death_question_then_podium_is_public(self):
        self.register("Ana")
        second = self.app.test_client()
        second.get("/")
        second.post("/api/register", json={"nickname":"Beto"}, headers={"X-CSRF-Token":self._csrf(second)})
        self.login()
        with self.app.app_context():
            get_db().execute("UPDATE games SET round_size=1 WHERE id=1")
        self.assertEqual(self.admin_post("/api/admin/control/start-game", {}).status_code, 200)
        self.assertEqual(self.admin_post("/api/admin/control/start-question", {}).status_code, 200)
        self.assertEqual(self.admin_post("/api/admin/control/close-question", {}).status_code, 200)
        state = self.admin.get("/api/admin/state?game=1").json
        self.assertTrue(any(q["is_tiebreak"] and q["status"]=="draft" for q in state["round_questions"]))
        self.assertEqual(self.admin_post("/api/admin/control/start-question", {}).status_code, 200)
        qid = self.client.get("/api/state").json["question"]["id"]
        with self.app.app_context():
            correct = get_db().execute("SELECT correct_option FROM questions WHERE id=?", (qid,)).fetchone()[0]
        self.post("/api/answer", {"choice":correct})
        wrong = next(letter for letter in "ABCD" if letter != correct)
        second.post("/api/answer", json={"choice":wrong}, headers={"X-CSRF-Token":self._csrf(second)})
        self.admin_post("/api/admin/control/close-question", {})
        self.assertEqual(self.admin_post("/api/admin/control/finish-game", {}).status_code, 200)
        public = self.client.get("/api/state").json
        self.assertEqual(public["game"]["status"], "finished")
        self.assertEqual(public["podium"][0]["nickname"], "Ana")

    def test_participant_cannot_choose_old_or_other_game(self):
        self.login()
        new_game = self.admin_post("/api/admin/games", {"name":"Nueva", "round_size":10})
        gid = new_game.json["game_id"]
        self.client.get("/")
        response = self.post("/api/register", {"nickname":"En la actual", "game_id":1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["state"]["game"]["id"], gid)
        self.assertEqual(self.client.get("/api/state?game=1").json["game"]["id"], gid)

    def test_public_page_does_not_link_to_admin_or_list_games(self):
        page = self.client.get("/")
        self.assertNotIn(b'href="/admin"', page.data)
        self.assertEqual(self.client.get("/api/games").status_code, 404)

    def test_second_question_requires_explicit_start_and_is_not_opened_automatically(self):
        self.register()
        self.start_first_question()
        self.admin_post("/api/admin/control/close-question", {})
        state = self.client.get("/api/state?game=1").json
        self.assertEqual(state["question"]["status"], "closed")
        self.assertEqual(self.admin_post("/api/admin/control/start-question", {}).status_code, 200)
        self.assertEqual(self.client.get("/api/state?game=1").json["question"]["status"], "open")


if __name__ == "__main__":
    unittest.main()
