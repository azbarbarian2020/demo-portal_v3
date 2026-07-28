# Troubleshooting

## Common Issues

### "Loading demos..." spinner never stops

**Cause**: The `/api/demos` endpoint is failing silently.

**Fix**:
1. Check service logs: `CALL SYSTEM$GET_SERVICE_LOGS('DEMO_PORTAL.PUBLIC.DEMO_PORTAL_SVC', '0', 'portal', 100);`
2. Look for `Query error:` or `Snowflake connection error:` messages
3. Verify grants: `SHOW GRANTS TO ROLE DEMO_PORTAL_ROLE;`
4. Ensure all tables are granted: `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA DEMO_PORTAL.PUBLIC TO ROLE DEMO_PORTAL_ROLE;`

### Admin page shows "This page couldn't load"

**Cause**: A JavaScript error crashed React rendering. Common causes:
- `null` values in topics/capabilities arrays when the frontend calls `.map()` or `.join()`
- The DEMOS table has a row with NULL in `entry_url` (which was NOT NULL in v1 but nullable in v2)

**Fix**:
1. Check browser DevTools console for the specific error
2. Ensure you're running the latest v2 image (which has null guards)
3. If updating from v1, the `entry_url` column may need its constraint relaxed:
   ```sql
   ALTER TABLE DEMO_PORTAL.PUBLIC.DEMOS ALTER COLUMN entry_url DROP NOT NULL;
   ```

### Thumbnails not showing (broken images)

**Cause**: SPCS Content Security Policy blocks external image URLs. The app proxies images through `/api/image`, which needs network egress to the S3 stage host.

**Fix**:
1. Check if S3 host is in the network rule:
   ```sql
   DESC NETWORK RULE DEMO_PORTAL.PUBLIC.SNOWFLAKE_API_RULE;
   ```
2. Use `networkPolicyConfig: allowInternetEgress: true` in the service spec (v2 default)

### `getaddrinfo ENOTFOUND sfsenorthamerica-....snowflakecomputing.com`

**Cause**: The SPCS container cannot resolve the Snowflake hostname because no External Access Integration (EAI) is configured or `allowInternetEgress` is not set.

**Fix**:
1. Verify EAI exists: `SHOW EXTERNAL ACCESS INTEGRATIONS LIKE 'DEMO_PORTAL%';`
2. Verify the service spec includes `networkPolicyConfig: allowInternetEgress: true`
3. Verify EAI is attached to service: The service must be created with `EXTERNAL_ACCESS_INTEGRATIONS = (DEMO_PORTAL_EXTERNAL_ACCESS)`

### Proxied demo shows "Demo Unavailable"

**Cause**: The internal SPCS service for the demo is not responding. This shows a friendly error page with a "Back to Demos" link.

**Fix**:
1. Check the target service is running: `SELECT SYSTEM$GET_SERVICE_STATUS('<service_fqn>');`
2. Verify the internal hostname is correct: Query `SELECT internal_host FROM DEMO_PORTAL.PUBLIC.DEMOS WHERE id = <id>;`
3. The internal DNS format should be: `<service_name>.<schema>.<db>.snowflakecomputing.internal`

### Stale cookie shows JSON error / traps user

**Cause**: Fixed in v2. If a demo is deleted while a user has an `active_demo` cookie set, the proxy route now redirects to home and clears the cookie.

If you see this in v1, upgrade to the latest v2 image.

### Service detection doesn't find the correct port

**Cause**: DEMO_PORTAL_ROLE needs ACCOUNTADMIN usage to run `SHOW ENDPOINTS IN SERVICE`.

**Fix**:
```sql
GRANT USAGE ON ROLE ACCOUNTADMIN TO ROLE DEMO_PORTAL_ROLE;
```

This is included in the v2 setup scripts. The role inherits ACCOUNTADMIN which allows it to query endpoints on any service in the account.

### Session lock stuck (demo shows "In Use" permanently)

**Cause**: The unlock beacon failed (browser crashed, network dropped) and the idle timeout hasn't expired yet.

**Fix**:
1. Wait for the idle timeout to expire (default 15 minutes). The lock will auto-clear on the next session poll.
2. Or manually clear: `DELETE FROM DEMO_PORTAL.PUBLIC.DEMO_SESSIONS WHERE demo_id = <id>;`

### Analytics page shows "No data yet"

**Cause**: The DEMO_USAGE_LOG table only populates after demos are launched with the v2 code. Historical usage from v1 is not available.

**Fix**: Launch a few demos to generate data. Each launch creates a row in DEMO_USAGE_LOG.

### Docker push fails with "unauthorized"

**Cause**: Registry login token expired.

**Fix**:
```bash
snow spcs image-registry login --connection <connection_name>
# Then retry the push
```

### Docker build uses cached layers (code changes not reflected)

**Cause**: Docker layer caching can serve stale COPY layers when source files change but package.json hasn't.

**Fix**: Always use `--no-cache` when source code has changed:
```bash
docker buildx build --platform linux/amd64 --no-cache -t demo-portal:v2 .
```

### Network policy resets every 12 hours (SE demo accounts)

**Cause**: Snowflake SE demo accounts have `ACCOUNT_LEVEL_NETWORK_POLICY_TASK` that resets the account-level network policy.

**Fix**: The setup script adds the SPCS CIDR to the account policy. If it gets reset:
```sql
SHOW PARAMETERS LIKE 'NETWORK_POLICY' IN ACCOUNT;
DESC NETWORK POLICY <policy_name>;
ALTER NETWORK POLICY <policy_name> SET ALLOWED_IP_LIST = (<existing_ips>, '153.45.59.0/24');
```

### Each external demo requires separate login

**Cause**: This is expected SPCS behavior. Each service has its own subdomain with independent OAuth cookies. Proxied demos (those with a `proxy_path`) avoid this by routing through the portal's own domain.

**Workaround**: Use the SPCS proxy feature (add demos with a service name, which auto-detects the internal host). Or configure SSO (SAML/Okta) on the account.

## Useful Commands

```sql
-- Check service status
SELECT SYSTEM$GET_SERVICE_STATUS('DEMO_PORTAL.PUBLIC.DEMO_PORTAL_SVC');

-- View service logs
CALL SYSTEM$GET_SERVICE_LOGS('DEMO_PORTAL.PUBLIC.DEMO_PORTAL_SVC', '0', 'portal', 100);

-- Get endpoint URL
SHOW ENDPOINTS IN SERVICE DEMO_PORTAL.PUBLIC.DEMO_PORTAL_SVC;

-- Restart service
ALTER SERVICE DEMO_PORTAL.PUBLIC.DEMO_PORTAL_SVC SUSPEND;
ALTER SERVICE DEMO_PORTAL.PUBLIC.DEMO_PORTAL_SVC RESUME;

-- Check grants
SHOW GRANTS TO ROLE DEMO_PORTAL_ROLE;

-- Check network rule
DESC NETWORK RULE DEMO_PORTAL.PUBLIC.SNOWFLAKE_API_RULE;

-- View active sessions
SELECT * FROM DEMO_PORTAL.PUBLIC.DEMO_SESSIONS;

-- View usage analytics
SELECT * FROM DEMO_PORTAL.PUBLIC.DEMO_USAGE_LOG ORDER BY created_at DESC LIMIT 20;

-- Clear all session locks (emergency)
DELETE FROM DEMO_PORTAL.PUBLIC.DEMO_SESSIONS;
```
