-- Dedication Wall · schema v1 · 2026-10-29
-- Source: design doc "Dedication Maker and Wall: Design" (rev 27) and Official Rules v3 (Oct 29).
-- Applied on every push by the build script (wrangler d1 migrations apply); additive from here on.

-- Owners and voters: one row per verified email. A voter is an owner with no entries.
CREATE TABLE IF NOT EXISTS owners (
  email            TEXT PRIMARY KEY,
  magic_token      TEXT,
  token_expires    INTEGER,            -- unix seconds
  newsletter_opt_in INTEGER NOT NULL DEFAULT 0,
  newsletter_at    INTEGER,
  created_at       INTEGER NOT NULL,
  last_seen_at     INTEGER
);

-- A posted dedication. status: pending → live | rejected | hidden (Brock's switch) | removed (owner's).
CREATE TABLE IF NOT EXISTS entries (
  id               TEXT PRIMARY KEY,   -- short public id, in /d/:id
  dog_name         TEXT NOT NULL,
  line             TEXT NOT NULL,
  mode             TEXT NOT NULL CHECK (mode IN ('for','in_memory')),
  background_id    TEXT NOT NULL,
  photo_key        TEXT NOT NULL,      -- R2: entries/<id>/original.jpg
  story_key        TEXT NOT NULL,      -- entries/<id>/story.jpg  9:16
  feed_key         TEXT NOT NULL,      -- entries/<id>/feed.jpg   4:5
  card_key         TEXT NOT NULL,      -- entries/<id>/card.jpg   1:1 (the link preview)
  owner_email      TEXT NOT NULL REFERENCES owners(email),
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','live','rejected','hidden','removed')),
  screen_result    TEXT,               -- JSON verdict from screening
  screened_at      INTEGER,
  attested_at      INTEGER NOT NULL,   -- 18+ and owner-or-permission box, Rules v3 §3
  rules_version    TEXT NOT NULL,      -- the Rules/Terms version shown at Post it
  invite_code      TEXT NOT NULL UNIQUE,
  hearts           INTEGER NOT NULL DEFAULT 0,
  live_at          INTEGER,            -- first publicly visible; the §6 tie-break timestamp
  created_at       INTEGER NOT NULL,
  removed_at       INTEGER,
  is_test          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS entries_status_live ON entries(status, live_at DESC);
CREATE INDEX IF NOT EXISTS entries_owner ON entries(owner_email);
CREATE INDEX IF NOT EXISTS entries_mode ON entries(mode, status, live_at DESC);

-- Contest consent, one row per entry per round (Rules v3 §3: a fresh opt-in for every round).
-- round_id NULL = "the next round"; assigned when a notice is published.
CREATE TABLE IF NOT EXISTS round_optins (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id         TEXT NOT NULL REFERENCES entries(id),
  round_id         INTEGER,
  consented_at     INTEGER NOT NULL,
  rules_version    TEXT NOT NULL,
  via              TEXT NOT NULL,      -- 'post_it' | 'owner_link' | 'admin'
  UNIQUE (entry_id, round_id)
);

-- Hearts: appreciation, never votes (Rules v3 §4). One per visitor per entry per day.
CREATE TABLE IF NOT EXISTS hearts (
  entry_id         TEXT NOT NULL REFERENCES entries(id),
  visitor_hash     TEXT NOT NULL,
  day              TEXT NOT NULL,      -- YYYY-MM-DD, America/Chicago
  PRIMARY KEY (entry_id, visitor_hash, day)
);

-- Rounds. A row exists from "publish notice" on; the notice and the snapshot are frozen then.
CREATE TABLE IF NOT EXISTS rounds (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  number           INTEGER NOT NULL UNIQUE,
  rules_version    TEXT NOT NULL,
  notice           TEXT NOT NULL,      -- JSON: cutoff, start, end, prize, announce_by, dispute contact
  entry_ids        TEXT NOT NULL,      -- JSON array, frozen at publish
  published_at     INTEGER NOT NULL,
  voting_start     INTEGER NOT NULL,
  voting_end       INTEGER NOT NULL,
  closed_at        INTEGER,
  results          TEXT,               -- JSON snapshot at close: counts per entry, excluded votes
  certified_at     INTEGER,            -- within 5 business days of close (§6)
  winner_entry_id  TEXT REFERENCES entries(id),
  status           TEXT NOT NULL DEFAULT 'announced'
                   CHECK (status IN ('announced','voting','closed','certified','cancelled'))
);

-- Votes: verified email only (§5). One per voter per entry per Central day.
CREATE TABLE IF NOT EXISTS votes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id         INTEGER NOT NULL REFERENCES rounds(id),
  entry_id         TEXT NOT NULL REFERENCES entries(id),
  voter_hash       TEXT NOT NULL,      -- hash of the verified email
  day              TEXT NOT NULL,
  cast_at          INTEGER NOT NULL,
  excluded         INTEGER NOT NULL DEFAULT 0,
  reason           TEXT,               -- why excluded (the review log, §5)
  UNIQUE (round_id, entry_id, voter_hash, day)
);

-- Invite links: /i/:code counts a visit, then lands on the wall.
CREATE TABLE IF NOT EXISTS invites (
  code             TEXT PRIMARY KEY,
  entry_id         TEXT NOT NULL REFERENCES entries(id),
  visits           INTEGER NOT NULL DEFAULT 0,
  votes            INTEGER NOT NULL DEFAULT 0
);

-- Dedication of the Year: one dated score sheet per finalist per judge (§9).
CREATE TABLE IF NOT EXISTS scores (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  year             INTEGER NOT NULL,
  entry_id         TEXT NOT NULL REFERENCES entries(id),
  judge            TEXT NOT NULL,
  sincerity        INTEGER NOT NULL CHECK (sincerity BETWEEN 0 AND 40),
  originality      INTEGER NOT NULL CHECK (originality BETWEEN 0 AND 30),
  photo_fit        INTEGER NOT NULL CHECK (photo_fit BETWEEN 0 AND 20),
  clarity          INTEGER NOT NULL CHECK (clarity BETWEEN 0 AND 10),
  total            INTEGER NOT NULL,
  notes            TEXT,
  scored_at        INTEGER NOT NULL,
  UNIQUE (year, entry_id, judge)
);

-- Request a background.
CREATE TABLE IF NOT EXISTS requests (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  text             TEXT NOT NULL,
  email            TEXT,
  status           TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','queued','done','declined')),
  created_at       INTEGER NOT NULL
);

-- Notices and shipments, kept as counsel asked (Compliance v3, Priority 3).
CREATE TABLE IF NOT EXISTS notices (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  kind             TEXT NOT NULL,      -- 'signin' | 'live' | 'round' | 'winner' | 'optin' | 'digest' | 'alert'
  to_email         TEXT NOT NULL,
  entry_id         TEXT,
  round_id         INTEGER,
  provider_id      TEXT,               -- Resend message id
  status           TEXT NOT NULL,      -- 'sent' | 'failed' | 'dev'
  sent_at          INTEGER NOT NULL,
  detail           TEXT
);

-- The admin switches (design doc, Oct 29): change without a deploy.
CREATE TABLE IF NOT EXISTS settings (
  key              TEXT PRIMARY KEY,
  value            TEXT NOT NULL,
  updated_at       INTEGER NOT NULL
);
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('contest_enabled',   'false', strftime('%s','now')),
  ('threshold_entries', '50',    strftime('%s','now')),
  ('threshold_days',    '45',    strftime('%s','now')),
  ('voting_days',       '14',    strftime('%s','now')),
  ('rules_version',     'draft-v3-2026-10-29', strftime('%s','now')),
  ('prize_text',        'One signed paperback of Jetson’s Journey, inscribed to the winning dog, and the Gold edition of the dedication page.', strftime('%s','now')),
  ('judge_name',        'Brock Alston', strftime('%s','now')),
  ('alternate_judge',   '', strftime('%s','now')),
  ('dog_of_the_day',    '', strftime('%s','now'));
