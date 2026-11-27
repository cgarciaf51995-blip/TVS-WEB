-- Private, server-only WhatsApp storage. No browser Data API grants.
BEGIN;
CREATE TABLE IF NOT EXISTS crm.wa_auth (key text PRIMARY KEY, encrypted_payload bytea NOT NULL);
CREATE TABLE IF NOT EXISTS crm.wa_runtime (id integer PRIMARY KEY CHECK(id=1), lease_owner text, lease_until timestamptz);
INSERT INTO crm.wa_runtime(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS crm.wa_threads (
 id text PRIMARY KEY, owner_id uuid REFERENCES crm.users(id), lead_id text,
 encrypted_payload bytea NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS crm.wa_messages (
 id text PRIMARY KEY, thread_id text NOT NULL REFERENCES crm.wa_threads(id),
 direction text NOT NULL CHECK(direction IN ('in','out')), status text NOT NULL,
 encrypted_payload bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_messages_thread_date ON crm.wa_messages(thread_id,created_at DESC);
CREATE INDEX IF NOT EXISTS wa_threads_owner_date ON crm.wa_threads(owner_id,updated_at DESC);
ALTER TABLE crm.wa_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.wa_runtime ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.wa_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.wa_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm.wa_auth,crm.wa_runtime,crm.wa_threads,crm.wa_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON crm.wa_auth,crm.wa_runtime,crm.wa_threads,crm.wa_messages TO tvs_backend;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['wa_auth','wa_runtime','wa_threads','wa_messages'] LOOP
 IF NOT EXISTS(SELECT FROM pg_policies WHERE schemaname='crm' AND tablename=t AND policyname='tvs_backend_access') THEN
 EXECUTE format('CREATE POLICY tvs_backend_access ON crm.%I FOR ALL TO tvs_backend USING(true) WITH CHECK(true)',t);
 END IF; END LOOP; END $$;
COMMIT;
