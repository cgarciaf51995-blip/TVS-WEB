-- Compatibility storage for the V60 portal. Access is exclusively through the authenticated server API.
CREATE TABLE crm.zip_settings (
 key text PRIMARY KEY CHECK(length(key) BETWEEN 1 AND 200),
 value text NOT NULL CHECK(octet_length(value)<=9437184),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE crm.zip_records (
 bucket text NOT NULL CHECK(bucket IN ('referrals','paperwork','applications','requests','filemeta','materials','leads')),
 record_id text NOT NULL CHECK(length(record_id) BETWEEN 1 AND 150),
 owner_id uuid REFERENCES crm.users(id),
 encrypted_payload bytea NOT NULL,
 secret_hash text,
 dedupe_key text,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz,
 PRIMARY KEY(bucket,record_id),
 UNIQUE(bucket,dedupe_key)
);
CREATE INDEX zip_records_owner_active_idx ON crm.zip_records(owner_id,bucket,created_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE crm.zip_files (
 id text PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 150),
 owner_id uuid NOT NULL REFERENCES crm.users(id),
 filename text NOT NULL,
 mime_type text NOT NULL,
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 32505856),
 encrypted_data bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz
);
CREATE INDEX zip_files_owner_idx ON crm.zip_files(owner_id) WHERE deleted_at IS NULL;
ALTER TABLE crm.zip_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.zip_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.zip_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON crm.zip_settings,crm.zip_records,crm.zip_files FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON crm.zip_settings,crm.zip_records,crm.zip_files TO tvs_backend;
CREATE POLICY tvs_backend_access ON crm.zip_settings FOR ALL TO tvs_backend USING(true) WITH CHECK(true);
CREATE POLICY tvs_backend_access ON crm.zip_records FOR ALL TO tvs_backend USING(true) WITH CHECK(true);
CREATE POLICY tvs_backend_access ON crm.zip_files FOR ALL TO tvs_backend USING(true) WITH CHECK(true);
