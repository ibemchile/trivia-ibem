CREATE TABLE tiebreak_groups (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  position_start INTEGER NOT NULL,
  position_end INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolved')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE questions ADD COLUMN tiebreak_group_id INTEGER REFERENCES tiebreak_groups(id);
ALTER TABLE tiebreak_groups ADD COLUMN parent_group_id INTEGER REFERENCES tiebreak_groups(id);
CREATE TABLE tiebreak_group_members (
  group_id INTEGER NOT NULL REFERENCES tiebreak_groups(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(group_id, participant_id)
);
CREATE TABLE tiebreak_eligibility (
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  PRIMARY KEY(question_id, participant_id)
);
WITH scores AS (
  SELECT p.id, p.game_id, COALESCE(SUM(CASE WHEN q.is_tiebreak = 0 THEN a.points_awarded ELSE 0 END), 0) AS score
  FROM participants p LEFT JOIN answers a ON a.participant_id = p.id AND a.game_id = p.game_id
  LEFT JOIN questions q ON q.id = a.question_id GROUP BY p.id
), buckets AS (
  SELECT game_id, score, COUNT(*) AS player_count FROM scores GROUP BY game_id, score
), ranked AS (
  SELECT game_id, score, player_count,
    COALESCE(SUM(player_count) OVER (PARTITION BY game_id ORDER BY score DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) + 1 AS position_start,
    SUM(player_count) OVER (PARTITION BY game_id ORDER BY score DESC) AS position_end
  FROM buckets
), chosen AS (
  SELECT game_id, score, position_start, MIN(3, position_end) AS position_end
  FROM ranked WHERE player_count > 1 AND position_start <= 3
), first_tie AS (
  SELECT game_id, MIN(position_start) AS position_start FROM chosen GROUP BY game_id
)
INSERT INTO tiebreak_groups (game_id, position_start, position_end, status)
SELECT c.game_id, c.position_start, c.position_end, 'active' FROM chosen c
JOIN first_tie f ON f.game_id = c.game_id AND f.position_start = c.position_start
WHERE EXISTS (SELECT 1 FROM questions q WHERE q.game_id = c.game_id AND q.is_tiebreak = 1 AND q.status IN ('draft','open'));
UPDATE questions SET tiebreak_group_id = (SELECT id FROM tiebreak_groups g WHERE g.game_id = questions.game_id ORDER BY id DESC LIMIT 1)
WHERE is_tiebreak = 1 AND status IN ('draft','open');
WITH scores AS (
  SELECT p.id, p.game_id, COALESCE(SUM(CASE WHEN q.is_tiebreak = 0 THEN a.points_awarded ELSE 0 END), 0) AS score
  FROM participants p LEFT JOIN answers a ON a.participant_id = p.id AND a.game_id = p.game_id
  LEFT JOIN questions q ON q.id = a.question_id GROUP BY p.id
), buckets AS (
  SELECT game_id, score, COUNT(*) AS player_count FROM scores GROUP BY game_id, score
), ranked AS (
  SELECT game_id, score, player_count,
    COALESCE(SUM(player_count) OVER (PARTITION BY game_id ORDER BY score DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) + 1 AS position_start,
    SUM(player_count) OVER (PARTITION BY game_id ORDER BY score DESC) AS position_end
  FROM buckets
), chosen AS (
  SELECT game_id, score, position_start, MIN(3, position_end) AS position_end
  FROM ranked WHERE player_count > 1 AND position_start <= 3
), first_tie AS (
  SELECT game_id, MIN(position_start) AS position_start FROM chosen GROUP BY game_id
)
INSERT OR IGNORE INTO tiebreak_group_members (group_id, participant_id, active)
SELECT g.id, s.id, 1 FROM tiebreak_groups g JOIN first_tie f ON f.game_id = g.game_id AND f.position_start = g.position_start
JOIN chosen c ON c.game_id = f.game_id AND c.position_start = f.position_start
JOIN scores s ON s.game_id = c.game_id AND s.score = c.score;
INSERT OR IGNORE INTO tiebreak_eligibility (question_id, participant_id)
SELECT q.id, m.participant_id FROM questions q JOIN tiebreak_group_members m ON m.group_id = q.tiebreak_group_id
WHERE q.is_tiebreak = 1 AND q.status IN ('draft','open');
UPDATE questions SET status = 'closed' WHERE is_tiebreak = 1 AND status IN ('draft','open') AND tiebreak_group_id IS NULL;
UPDATE questions SET status = 'closed' WHERE is_tiebreak = 1 AND status IN ('draft','open')
AND id NOT IN (SELECT MIN(id) FROM questions WHERE is_tiebreak = 1 AND status IN ('draft','open') GROUP BY game_id);
CREATE UNIQUE INDEX idx_one_active_tiebreak ON questions(game_id) WHERE is_tiebreak = 1 AND status IN ('draft','open');
CREATE UNIQUE INDEX idx_active_tiebreak_position ON tiebreak_groups(game_id, position_start) WHERE status = 'active';
CREATE UNIQUE INDEX idx_tiebreak_child_position ON tiebreak_groups(parent_group_id, position_start) WHERE parent_group_id IS NOT NULL;
