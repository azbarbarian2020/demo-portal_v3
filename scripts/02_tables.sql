-- Demo Portal - Tables and Settings
-- Creates DEMOS table, SETTINGS table, and seeds default settings

USE WAREHOUSE __WAREHOUSE__;

CREATE TABLE IF NOT EXISTS __DATABASE__.__SCHEMA__.DEMOS (
  id INTEGER AUTOINCREMENT,
  name VARCHAR(500) NOT NULL,
  description VARCHAR(5000),
  short_description VARCHAR(1000),
  thumbnail_stage_path VARCHAR(1000),
  entry_url VARCHAR(2000),
  demo_type VARCHAR(50) DEFAULT 'SPCS',
  topics ARRAY,
  capabilities ARRAY,
  click_script_stage_path VARCHAR(1000),
  video_url VARCHAR(2000),
  status VARCHAR(50) DEFAULT 'PUBLISHED',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  created_by VARCHAR(100),
  internal_host VARCHAR(500),
  proxy_path VARCHAR(100),
  idle_timeout_minutes INTEGER DEFAULT 15,
  service_name VARCHAR(500),
  compute_pool VARCHAR(500),
  schedule_start VARCHAR(10),
  schedule_stop VARCHAR(10),
  schedule_days VARCHAR(200),
  schedule_timezone VARCHAR(100),
  auto_resume_enabled BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS __DATABASE__.__SCHEMA__.SETTINGS (
  key VARCHAR(100) PRIMARY KEY,
  value VARIANT
);

MERGE INTO __DATABASE__.__SCHEMA__.SETTINGS t
USING (SELECT 'topics' AS KEY, PARSE_JSON('["Predictive Maintenance","Quality Control","Supply Chain Optimization","Production Planning","Asset Management","Energy & Sustainability","Digital Twin","Warehouse & Logistics"]') AS VALUE) s
ON t.KEY = s.KEY
WHEN NOT MATCHED THEN INSERT (KEY, VALUE) VALUES (s.KEY, s.VALUE);

MERGE INTO __DATABASE__.__SCHEMA__.SETTINGS t
USING (SELECT 'capabilities' AS KEY, PARSE_JSON('["Cortex AI","Cortex Agents","Snowpark","Streamlit","SPCS","Dynamic Tables","Notebooks","Iceberg","Data Sharing","Snowpipe Streaming","ML/Model Registry","Document AI","Geospatial","Time Series"]') AS VALUE) s
ON t.KEY = s.KEY
WHEN NOT MATCHED THEN INSERT (KEY, VALUE) VALUES (s.KEY, s.VALUE);

MERGE INTO __DATABASE__.__SCHEMA__.SETTINGS t
USING (SELECT 'portal_title' AS KEY, PARSE_JSON('"Demo Portal"') AS VALUE) s
ON t.KEY = s.KEY
WHEN NOT MATCHED THEN INSERT (KEY, VALUE) VALUES (s.KEY, s.VALUE);

CREATE TABLE IF NOT EXISTS __DATABASE__.__SCHEMA__.DEMO_SESSIONS (
  demo_id INTEGER PRIMARY KEY,
  locked_by VARCHAR(200) NOT NULL,
  locked_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  last_activity TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS __DATABASE__.__SCHEMA__.DEMO_USAGE_LOG (
  id INTEGER AUTOINCREMENT,
  demo_id INTEGER NOT NULL,
  user_name VARCHAR(200) NOT NULL,
  event_type VARCHAR(50) NOT NULL DEFAULT 'launch',
  started_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  ended_at TIMESTAMP_NTZ,
  duration_seconds INTEGER,
  created_at TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Stored procedure to auto-grant permissions on new demo services
-- Owned by ACCOUNTADMIN, runs with owner privileges to issue GRANT statements
CREATE OR REPLACE PROCEDURE __DATABASE__.__SCHEMA__.GRANT_DEMO_ACCESS(
  p_service_name VARCHAR,
  p_compute_pool VARCHAR
)
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
BEGIN
  EXECUTE IMMEDIATE 'GRANT OPERATE ON SERVICE ' || :p_service_name || ' TO ROLE DEMO_PORTAL_ROLE';
  EXECUTE IMMEDIATE 'GRANT MONITOR ON SERVICE ' || :p_service_name || ' TO ROLE DEMO_PORTAL_ROLE';
  IF (:p_compute_pool IS NOT NULL AND :p_compute_pool != '') THEN
    EXECUTE IMMEDIATE 'GRANT OPERATE ON COMPUTE POOL ' || :p_compute_pool || ' TO ROLE DEMO_PORTAL_ROLE';
  END IF;
  LET parts ARRAY := SPLIT(:p_service_name, '.');
  LET db_name VARCHAR := GET(parts, 0)::VARCHAR;
  LET schema_name VARCHAR := GET(parts, 1)::VARCHAR;
  EXECUTE IMMEDIATE 'GRANT USAGE ON DATABASE ' || :db_name || ' TO ROLE DEMO_PORTAL_ROLE';
  EXECUTE IMMEDIATE 'GRANT USAGE ON SCHEMA ' || :db_name || '.' || :schema_name || ' TO ROLE DEMO_PORTAL_ROLE';
  RETURN 'Grants applied successfully';
END;
$$;

GRANT USAGE ON PROCEDURE __DATABASE__.__SCHEMA__.GRANT_DEMO_ACCESS(VARCHAR, VARCHAR) TO ROLE DEMO_PORTAL_ROLE;
