-- Demo Portal - Service Creation (Reference Template)
-- This is for manual reference. setup.sh creates the service with proper substitutions.

CREATE SERVICE __DATABASE__.__SCHEMA__.DEMO_PORTAL_SVC
  IN COMPUTE POOL __COMPUTE_POOL__
  EXTERNAL_ACCESS_INTEGRATIONS = (DEMO_PORTAL_EXTERNAL_ACCESS)
  MIN_INSTANCES = 1
  MAX_INSTANCES = 1
  FROM SPECIFICATION $$
spec:
  containers:
    - name: demo-portal
      image: /__DATABASE__/__SCHEMA__/portal_repo/demo-portal:__IMAGE_TAG__
      env:
        SNOWFLAKE_ACCOUNT: __SNOWFLAKE_ACCOUNT__
        SNOWFLAKE_USER: DEMO_PORTAL_SVC
        SNOWFLAKE_WAREHOUSE: __WAREHOUSE__
        SNOWFLAKE_ROLE: DEMO_PORTAL_ROLE
      secrets:
        - snowflakeSecret:
            objectName: __DATABASE__.__SCHEMA__.PORTAL_PRIVATE_KEY_SECRET
          secretKeyRef: secret_string
          envVarName: SNOWFLAKE_PRIVATE_KEY
      readinessProbe:
        port: 8080
        path: /api/health
  endpoints:
    - name: portal
      port: 8080
      public: true
$$;
