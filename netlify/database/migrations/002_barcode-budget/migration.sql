CREATE TABLE service_limits (
  name TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision > 0),
  payload TEXT NOT NULL CHECK (jsonb_typeof(payload::jsonb) = 'array')
);

REVOKE ALL ON service_limits FROM PUBLIC;
