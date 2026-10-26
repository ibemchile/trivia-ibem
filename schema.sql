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

INSERT INTO games (name, status, round_size) VALUES ('Trivia Día de la Reforma', 'waiting', 10);

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿En qué año se asocia tradicionalmente el inicio de la Reforma con las 95 tesis?', '1492', '1521', '1517', '1534', 'C', 'Historia', 'Básica', 'La fecha tradicional es el 31 de octubre de 1517; los detalles de la publicación en la puerta se debaten.', 'HISTORY, Martin Luther and the 95 Theses', 1, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué reformador se asocia con las 95 tesis?', 'Juan Calvino', 'Ulrico Zuinglio', 'Felipe Melanchthon', 'Martín Lutero', 'D', 'Historia', 'Básica', 'Lutero redactó las tesis para debatir la práctica de las indulgencias.', 'HISTORY, Martin Luther and the 95 Theses', 2, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿En qué ciudad desarrolló Lutero su actividad universitaria y reformadora?', 'Erfurt', 'Wittenberg', 'Leipzig', 'Worms', 'B', 'Historia', 'Básica', 'Lutero enseñó en Wittenberg, en el Sacro Imperio Romano Germánico.', 'Encyclopaedia Britannica, Martin Luther', 3, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué práctica criticaban principalmente las 95 tesis?', 'La venta y predicación de indulgencias', 'La prohibición del matrimonio clerical', 'El uso exclusivo del latín en la liturgia', 'La centralidad del papado en el derecho canónico', 'A', 'Historia', 'Básica', 'El documento cuestionó especialmente la predicación de indulgencias.', 'HISTORY, Martin Luther and the 95 Theses', 4, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿En qué reunión de 1521 se pidió a Lutero que se retractara?', 'Concilio de Trento', 'Dieta de Augsburgo', 'Dieta de Worms', 'Sínodo de Dort', 'C', 'Historia', 'Intermedia', 'Lutero compareció ante la Dieta de Worms en 1521.', 'Encyclopaedia Britannica, Diet of Worms', 5, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué príncipe protegió a Lutero en el castillo de Wartburg?', 'Carlos V', 'Felipe de Hesse', 'Juan Federico el Magnánimo', 'Federico III de Sajonia', 'D', 'Historia', 'Intermedia', 'Federico el Sabio, elector de Sajonia, contribuyó a proteger a Lutero.', 'Encyclopaedia Britannica, Frederick III', 6, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué reformador se asocia especialmente con la Reforma de Ginebra?', 'Juan Calvino', 'Heinrich Bullinger', 'Martin Bucero', 'Teodoro Beza', 'A', 'Historia', 'Básica', 'Calvino desarrolló buena parte de su ministerio reformador en Ginebra.', 'Encyclopaedia Britannica, John Calvin', 7, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿En qué ciudad suiza predicó Ulrico Zuinglio durante la Reforma?', 'Basilea', 'Berna', 'Zúrich', 'Ginebra', 'C', 'Historia', 'Básica', 'Zuinglio fue el principal reformador de Zúrich.', 'Encyclopaedia Britannica, Huldrych Zwingli', 8, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Quién fue un colaborador cercano de Lutero y autor de la Confesión de Augsburgo?', 'Johannes Bugenhagen', 'Felipe Melanchthon', 'Andreas Karlstadt', 'Justus Jonas', 'B', 'Historia', 'Intermedia', 'Melanchthon redactó la Confesión presentada en 1530.', 'Encyclopaedia Britannica, Philipp Melanchthon', 9, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿En qué año se presentó la Confesión de Augsburgo?', '1521', '1530', '1545', '1555', 'B', 'Historia', 'Intermedia', 'La confesión luterana fue presentada ante la Dieta de Augsburgo en 1530.', 'Encyclopaedia Britannica, Augsburg Confession', 10, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué tecnología ayudó a difundir rápidamente escritos reformadores en Europa?', 'El códice manuscrito iluminado', 'El sistema postal imperial de postas', 'La imprenta de tipos móviles', 'La xilografía en hojas sueltas', 'C', 'Historia', 'Básica', 'La imprenta permitió reproducir y distribuir textos a mayor escala.', 'Encyclopaedia Britannica, printing press', 11, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué tratado de 1555 reconoció el principio territorial de elección confesional en el Imperio?', 'Paz de Westfalia', 'Edicto de Nantes', 'Paz de Augsburgo', 'Tratado de Cateau-Cambrésis', 'C', 'Historia', 'Avanzada', 'La Paz de Augsburgo reguló la convivencia entre gobernantes católicos y luteranos.', 'Encyclopaedia Britannica, Peace of Augsburg', 12, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué acontecimiento se asocia con la Reforma inglesa bajo Enrique VIII?', 'Los Seis Artículos de 1539', 'El Cisma de Aviñón', 'El Edicto de Restitución', 'El Acta de Supremacía de 1534', 'D', 'Historia', 'Intermedia', 'El Acta declaró al monarca cabeza suprema de la Iglesia de Inglaterra.', 'UK Parliament, Act of Supremacy 1534', 13, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué reformador escocés fue una figura central de la Reforma en Escocia?', 'George Wishart', 'John Knox', 'Andrew Melville', 'Patrick Hamilton', 'B', 'Historia', 'Intermedia', 'Knox fue una figura destacada de la Reforma escocesa.', 'Encyclopaedia Britannica, John Knox', 14, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿En qué lengua se escribió originalmente gran parte de la Biblia hebrea?', 'Arameo antiguo', 'Fenicio', 'Hebreo', 'Copto sahídico', 'C', 'Biblia', 'Básica', 'La mayor parte del Antiguo Testamento se escribió en hebreo, con secciones en arameo.', 'Introducciones académicas al Antiguo Testamento', 15, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿En qué lengua se escribió el Nuevo Testamento?', 'Arameo palestino', 'Latín clásico', 'Griego koiné', 'Hebreo rabínico', 'C', 'Biblia', 'Básica', 'Los escritos del Nuevo Testamento fueron compuestos en griego koiné.', 'Introducciones académicas al Nuevo Testamento', 16, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Cuántos evangelios canónicos contiene el Nuevo Testamento?', 'Tres', 'Cuatro', 'Cinco', 'Siete', 'B', 'Biblia', 'Básica', 'Los evangelios canónicos son Mateo, Marcos, Lucas y Juan.', 'Mateo; Marcos; Lucas; Juan', 17, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Cuál es el primer libro del Nuevo Testamento en el orden habitual?', 'Marcos', 'Lucas', 'Mateo', 'Hechos', 'C', 'Biblia', 'Básica', 'Mateo aparece primero en el orden habitual del Nuevo Testamento.', 'Índice del Nuevo Testamento', 18, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, 'Según Efesios 2:8-9, la salvación es por gracia mediante…', 'Las obras meritorias', 'La obediencia sacramental', 'La iluminación mística', 'La fe', 'D', 'Biblia', 'Básica', 'El pasaje vincula la salvación con la gracia y la fe, no como resultado de obras.', 'Efesios 2:8-9', 19, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿En qué carta aparece la frase «el justo por la fe vivirá» citada por Pablo?', 'Gálatas', 'Romanos', 'Hebreos', 'Efesios', 'B', 'Biblia', 'Intermedia', 'Romanos 1:17 cita Habacuc 2:4.', 'Romanos 1:17; Habacuc 2:4', 20, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Quién lideró a los israelitas en el relato del éxodo desde Egipto?', 'Aarón', 'Josué', 'Moisés', 'Caleb', 'C', 'Biblia', 'Básica', 'El libro del Éxodo presenta a Moisés guiando la liberación de Israel.', 'Éxodo 3–14', 21, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Quién derrotó a Goliat según 1 Samuel?', 'Abisai', 'David', 'Jonatán', 'Elhanán', 'B', 'Biblia', 'Básica', 'El relato de 1 Samuel 17 atribuye la victoria a David.', '1 Samuel 17', 22, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Cuál de estos libros pertenece al Pentateuco?', 'Josué', 'Deuteronomio', 'Isaías', 'Jueces', 'B', 'Biblia', 'Básica', 'Deuteronomio es el quinto libro del Pentateuco.', 'Deuteronomio', 23, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿En qué ciudad nació Jesús según los relatos de Mateo y Lucas?', 'Nazaret', 'Capernaúm', 'Jerusalén', 'Belén', 'D', 'Biblia', 'Básica', 'Mateo y Lucas sitúan el nacimiento de Jesús en Belén.', 'Mateo 2:1; Lucas 2:4-7', 24, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué apóstol es tradicionalmente asociado con la autoría de Apocalipsis?', 'Pedro', 'Santiago', 'Juan', 'Pablo', 'C', 'Biblia', 'Intermedia', 'El texto identifica a su autor como Juan; su identificación histórica precisa se debate.', 'Apocalipsis 1:1, 4, 9', 25, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué libro narra la expansión inicial de la iglesia y los viajes de Pablo?', 'Romanos', 'Hechos', 'Gálatas', 'Apocalipsis', 'B', 'Biblia', 'Básica', 'Hechos relata acontecimientos de la iglesia primitiva y misiones apostólicas.', 'Hechos', 26, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué significa Sola Scriptura en la tradición reformada?', 'La tradición eclesiástica tiene igual peso que los textos', 'Solo el clero formado puede interpretar legítimamente el canon', 'La Escritura es autoridad suprema y normativa para fe y práctica', 'Los concilios ecuménicos anulan la lectura individual', 'C', 'Principios', 'Básica', 'La formulación reformada expresa la autoridad normativa de la Escritura.', 'Confesiones reformadas; 2 Timoteo 3:16-17', 27, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué expresa Sola Fide?', 'Las obras de caridad son el mérito principal de la justificación', 'La salvación se recibe únicamente a través de la fe en Cristo sin obras meritorias', 'La fe requiere la intermediación obligatoria de los santos', 'El bautismo infantil garantiza por sí mismo la gracia eterna', 'B', 'Principios', 'Básica', 'Sola Fide enfatiza la justificación por la fe, según la teología reformadora.', 'Romanos 3:28', 28, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué expresa Sola Gratia?', 'La gracia divina coopera de forma simétrica con la bondad natural humana', 'La salvación se alcanza equilibrando la penitencia y las indulgencias', 'La salvación es un don inmerecido otorgado por la soberana gracia de Dios', 'El favor divino se adquiere mediante sacrificios y votos monásticos', 'C', 'Principios', 'Básica', 'Sola Gratia destaca que la salvación depende de la gracia divina.', 'Efesios 2:8-9', 29, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué expresa Solus Christus?', 'Cristo comparte su intercesión con los santos y la Virgen María', 'La jerarquía eclesiástica es co-mediadora de la redención humana', 'Los sacramentos poseen eficacia propia independiente de la obra de Cristo', 'Cristo es el único mediador y fundamento exclusivo de la salvación', 'D', 'Principios', 'Intermedia', 'El principio enfatiza la centralidad y suficiencia de Cristo.', '1 Timoteo 2:5; Hechos 4:12', 30, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué expresa Soli Deo Gloria?', 'La honra espiritual debe atribuirse también a los santos patronos', 'Toda la gloria y la alabanza pertenecen exclusivamente a Dios', 'Las autoridades terrenales participan de la gloria divina por derecho dinástico', 'La dignidad humana contribuye a la perfección de la obra celestial', 'B', 'Principios', 'Básica', 'El principio orienta la vida y la salvación a la gloria de Dios.', 'Romanos 11:36', 31, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Cuál es la referencia de los Diez Mandamientos en Éxodo?', 'Éxodo 12', 'Éxodo 15', 'Éxodo 20', 'Éxodo 34', 'C', 'Biblia', 'Intermedia', 'Éxodo 20 contiene el Decálogo.', 'Éxodo 20:1-17', 32, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué versículo abre la Biblia?', 'El Espíritu de Dios se movía sobre la faz de las aguas', 'En el principio creó Dios los cielos y la tierra', 'Hágase la luz y la luz fue hecha', 'Y vio Dios que todo era muy bueno', 'B', 'Biblia', 'Básica', 'Es la primera oración de Génesis.', 'Génesis 1:1', 33, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Quién bautizó a Jesús según los evangelios?', 'Simón Pedro', 'Andrés el apóstol', 'Juan el Bautista', 'Felipe de Betsaida', 'C', 'Biblia', 'Básica', 'Los evangelios narran el bautismo de Jesús por Juan.', 'Marcos 1:9-11', 34, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Cuál de estos es un fruto del Espíritu en Gálatas 5?', 'Ambición piadosa', 'Paciencia', 'Venganza justa', 'Rigor doctrinal', 'B', 'Biblia', 'Básica', 'Paciencia aparece en la lista del fruto del Espíritu.', 'Gálatas 5:22-23', 35, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿En qué libro se encuentra el Sermón del Monte?', 'Marcos', 'Lucas', 'Juan', 'Mateo', 'D', 'Biblia', 'Básica', 'El Sermón del Monte ocupa Mateo 5–7.', 'Mateo 5–7', 36, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué apóstol negó conocer a Jesús tres veces antes del amanecer?', 'Tomás', 'Felipe', 'Pedro', 'Andrés', 'C', 'Biblia', 'Básica', 'Los relatos de la pasión narran las tres negaciones de Pedro.', 'Lucas 22:54-62', 37, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué traducción bíblica alemana hizo Lutero durante su estancia en Wartburg?', 'Los Salmos completos con comentarios', 'El Pentateuco y los Profetas', 'El Nuevo Testamento al alemán', 'Los Evangelios armonizados en latín', 'C', 'Historia', 'Intermedia', 'Lutero tradujo el Nuevo Testamento al alemán durante 1521–1522.', 'Lutherhaus Wittenberg; Britannica, Martin Luther', 38, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué reforma religiosa inició John Wesley en el siglo XVIII?', 'Movimiento pietista alemán', 'Movimiento metodista', 'Movimiento puritano radical', 'Movimiento bautista general', 'B', 'Protestantismo', 'Intermedia', 'Wesley fue uno de los fundadores del metodismo.', 'Encyclopaedia Britannica, John Wesley', 39, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué tradición protestante se asocia históricamente con Juan Calvino?', 'Luterana', 'Anabaptista', 'Anglicana', 'Reformada', 'D', 'Protestantismo', 'Intermedia', 'La tradición reformada recibió una influencia central de Calvino.', 'Encyclopaedia Britannica, John Calvin', 40, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué acontecimiento suele marcar el inicio del pentecostalismo moderno en EE. UU.?', 'El Gran Despertar de Nueva Inglaterra', 'El avivamiento de Cane Ridge', 'El avivamiento de Azusa Street (1906)', 'La Convención de Keswick', 'C', 'Protestantismo', 'Avanzada', 'El avivamiento de Azusa Street fue un hito importante.', 'Encyclopaedia Britannica, Pentecostalism', 42, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué denominación protestante tiene como símbolo tradicional una cruz con una llama?', 'Presbiteriana', 'Metodista', 'Luterana', 'Bautista', 'B', 'Cultura cristiana', 'Intermedia', 'La cruz y llama es un símbolo de la Iglesia Metodista Unida.', 'The United Methodist Church, Cross and Flame', 43, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué himno escribió Martín Lutero y se conoce en español como «Castillo fuerte»?', 'Nun danket alle Gott', 'Lobe den Herren', 'Ein feste Burg ist unser Gott', 'Wie schön leuchtet der Morgenstern', 'C', 'Cultura cristiana', 'Intermedia', 'El himno luterano es conocido por su primera línea alemana.', 'Himnarios luteranos; Salmo 46', 44, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué significa la palabra «evangelio» en su sentido básico?', 'Doctrina sagrada', 'Buena noticia', 'Revelación mística', 'Ley divina', 'B', 'Cultura cristiana', 'Básica', 'El término griego euangelion significa buena noticia.', 'Marcos 1:1; léxicos de griego del NT', 45, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué sacramento/práctica instituyó Jesús con pan y copa según 1 Corintios 11?', 'Bautismo en agua', 'Imposición de manos', 'Cena del Señor', 'Unción de los enfermos', 'C', 'Biblia', 'Intermedia', 'Pablo transmite la tradición de la Cena del Señor.', '1 Corintios 11:23-26', 46, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿En qué ciudad chilena se organizó oficialmente la Iglesia Metodista el 8 de diciembre de 1895?', 'Santiago', 'Valparaíso', 'Concepción', 'Iquique', 'B', 'Historia de Chile', 'Avanzada', 'La historia institucional metodista registra esa fecha para su iglesia de Valparaíso.', 'Biblioteca Metodista Chile, Valparaíso', 47, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué ciudad se asocia con el inicio del avivamiento pentecostal chileno de 1909?', 'Valparaíso', 'Temuco', 'Santiago', 'Talca', 'A', 'Historia de Chile', 'Avanzada', 'Estudios históricos sitúan el movimiento pentecostal chileno temprano en Valparaíso.', 'Revista Historia, SciELO', 48, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué año promulgó Chile una ley interpretativa que permitió el culto no católico en recintos privados?', '1845', '1865', '1888', '1907', 'B', 'Historia de Chile', 'Avanzada', 'La ley de 27 de julio de 1865 autorizó el culto en edificios particulares.', 'Ley Chile, BCN', 49, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué cambio constitucional chileno de 1925 se relaciona con la separación entre Iglesia y Estado?', 'Declaró la religión católica como oficial e intolerante', 'Estableció la separación entre Iglesia y Estado junto con la libertad de cultos', 'Prohibió la fundación de seminarios teológicos protestantes', 'Suprimió toda personería jurídica a las misiones extranjeras', 'B', 'Historia de Chile', 'Avanzada', 'La Constitución de 1925 puso fin al vínculo constitucional entre el Estado y la Iglesia Católica.', 'Biblioteca del Congreso Nacional', 50, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué fecha se conmemora tradicionalmente como Día de la Reforma?', '31 de octubre', '10 de noviembre', '25 de mayo', '15 de agosto', 'A', 'Cultura cristiana', 'Básica', 'La fecha remite tradicionalmente a las tesis de Lutero de 1517.', 'HISTORY, Martin Luther and the 95 Theses', 51, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué documento contiene la afirmación «Toda la Escritura es inspirada por Dios»?', '1 Pedro', 'Romanos', '2 Timoteo', 'Hebreos', 'C', 'Biblia', 'Intermedia', 'La frase aparece en 2 Timoteo 3:16.', '2 Timoteo 3:16', 52, 'draft');

INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status) 
VALUES (NULL, '¿Qué significa «justificación» en el uso teológico cristiano habitual?', 'La purificación progresiva de los pecados mediante obras pías', 'El acto forense de Dios mediante el cual declara justo al pecador por la fe', 'La consagración formal de un ministro para el servicio eclesiástico', 'La traducción exacta de un texto original sin alteraciones', 'B', 'Principios', 'Avanzada', 'En la teología de la Reforma, se refiere al acto de Dios de declarar justo al pecador.', 'Romanos 3–5', 53, 'draft');
INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status, is_tiebreak) 
VALUES (NULL, '¿En qué bienio se celebró el Sínodo de Dort (Dordrecht), donde se articularon dogmáticamente los "Cinco Puntos del Calvinismo"?', '1564–1565', '1618–1619', '1643–1649', '1689–1690', 'B', 'Historia', 'Avanzada', 'El Sínodo de Dort se reunió entre 1618 y 1619 en los Países Bajos para responder a la controversia arminiana.', 'Encyclopaedia Britannica, Synod of Dort', 54, 'draft', 1);
INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status, is_tiebreak) 
VALUES (NULL, '¿Cómo se denominó el decreto promulgado en 1598 por Enrique IV de Francia que reconoció derechos civiles y libertad de conciencia a los hugonotes?', 'Edicto de Milán', 'Edicto de Nantes', 'Edicto de Saint-Germain', 'Edicto de Fontainebleau', 'B', 'Historia', 'Avanzada', 'El Edicto de Nantes puso fin a las Guerras de Religión en Francia otorgando tolerancia limitada.', 'Encyclopaedia Britannica, Edict of Nantes', 55, 'draft', 1);
INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status, is_tiebreak) 
VALUES (NULL, '¿Qué influyente estándar doctrinal británico redactó la Asamblea de Westminster a partir de 1643 por mandato del Parlamento Largo?', 'Confesión de Fe de Westminster', 'Confesión de Augsburgo', 'Artículos de Esmalcalda', 'Segunda Confesión Helvética', 'A', 'Teología', 'Avanzada', 'La Asamblea elaboró la Confesión de Westminster y los catecismos asociados, pilares del presbiterianismo.', 'Westminster Assembly / Britannica', 56, 'draft', 1);
INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status, is_tiebreak) 
VALUES (NULL, '¿Qué reformador sucedió a Ulrico Zuinglio en Zúrich y redactó las Décadas y la Segunda Confesión Helvética?', 'Heinrich Bullinger', 'Martin Bucero', 'Teodoro Beza', 'William Tyndale', 'A', 'Historia', 'Avanzada', 'Bullinger consolidó la Reforma en Zúrich y fue una figura ecuménica clave en la tradición reformada.', 'Encyclopaedia Britannica, Heinrich Bullinger', 58, 'draft', 1);
INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status, is_tiebreak) 
VALUES (NULL, '¿Qué traductor inglés fue ejecutado en la hoguera en Amberes (1536) por verter el Nuevo Testamento directamente del griego al inglés?', 'John Wycliffe', 'William Tyndale', 'Myles Coverdale', 'John Rogers', 'B', 'Historia', 'Avanzada', 'Tyndale sentó las bases de la King James Version con sus traducciones impresas desde los originales.', 'Encyclopaedia Britannica, William Tyndale', 59, 'draft', 1);
INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status, is_tiebreak) 
VALUES (NULL, '¿Qué documento teológico redactó Martín Lutero en 1537 para una proyectada reunión conciliar, expresando su postura más intransigente frente al papado?', 'Artículos de Esmalcalda', 'Pequeño Catecismo', 'De servo arbitrio', 'Disputación de Heidelberg', 'A', 'Teología', 'Avanzada', 'Los Artículos de Esmalcalda se integraron posteriormente en el Libro de Concordia luterano.', 'Concordia: The Lutheran Confessions', 60, 'draft', 1);
INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status, is_tiebreak) 
VALUES (NULL, '¿Bajo qué mandato presidencial chileno se promulgó en 1999 la histórica Ley N° 19.638 sobre Constitución Jurídica de Iglesias y Organizaciones Religiosas?', 'Patricio Aylwin', 'Eduardo Frei Ruiz-Tagle', 'Ricardo Lagos', 'Michelle Bachelet', 'B', 'Historia de Chile', 'Avanzada', 'La ley de culto de 1999 otorgó personalidad jurídica propia a las entidades religiosas no católicas.', 'Biblioteca del Congreso Nacional, Ley 19638', 61, 'draft', 1);
INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status, is_tiebreak) 
VALUES (NULL, '¿Qué controversia cristológica del siglo V condenó el Concilio de Calcedonia (451), afirmando las dos naturalezas en Cristo sin confusión ni división?', 'Arrianismo', 'Monofisismo (Eutiquianismo)', 'Nestorianismo', 'Donatismo', 'B', 'Teología', 'Avanzada', 'El Tomo de León y la definición calcedonia establecieron el estándar ortodoxo sobre la persona de Cristo.', 'Encyclopaedia Britannica, Council of Chalcedon', 62, 'draft', 1);
INSERT INTO questions (game_id, question_text, option_a, option_b, option_c, option_d, correct_option, category, difficulty, explanation, source, question_order, status, is_tiebreak) 
VALUES (NULL, '¿Qué reformador de Estrasburgo destacó por sus esfuerzos ecuménicos para unir a luteranos y suizos, influyendo profundamente en el joven Juan Calvino?', 'Martin Bucero (Martin Bucer)', 'Andreas Karlstadt', 'Johannes Oecolampadius', 'Caspar Olevianus', 'A', 'Historia', 'Avanzada', 'Bucero abogó por la concordia protestante y hospedó a Calvino durante su estancia en Estrasburgo.', 'Encyclopaedia Britannica, Martin Bucer', 63, 'draft', 1);