CREATE TABLE printer_connections (
  user_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision > 0),
  payload TEXT NOT NULL CHECK (jsonb_typeof(payload::jsonb) = 'object')
);
REVOKE ALL ON printer_connections FROM PUBLIC;
