CREATE TABLE libraries (
  user_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision > 0),
  payload TEXT NOT NULL CHECK (jsonb_typeof(payload::jsonb -> 'items') = 'array'),
  request_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE phone_batches (
  user_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision > 0),
  payload TEXT NOT NULL CHECK (jsonb_typeof(payload::jsonb) = 'object'),
  request_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

REVOKE ALL ON libraries, phone_batches FROM PUBLIC;
