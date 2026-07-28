# Demo Portal v3

A self-service portal for browsing, filtering, and launching demos running on any Snowflake account. Built with Next.js 16 and deployed on Snowpark Container Services (SPCS). Fully portable — install to any AWS-region Snowflake account with a single `./setup.sh` command.

## Features

| Feature | Description |
|---------|-------------|
| Demo browsing & filtering | Browse demos by topic and capability with search |
| Configurable branding | Set portal title and upload a logo via Admin Settings |
| SPCS proxy (iframe embedding) | Launch SPCS demos inline without a separate OAuth login |
| Session locking | Single-user access with configurable idle timeout |
| Service scheduling | Auto start/stop SPCS services on a CRON schedule to save compute costs |
| Auto-resume on launch | Click Launch on an inactive demo to auto-start it |
| Live status badges | Active/Inactive badges update every 30s |
| Analytics dashboard | Usage metrics, top demos, top users, session duration |
| Auto-detection | Discover SPCS services and Streamlit apps in the account |
| Admin wizard | 6-step guided demo publishing flow |

## Architecture

```
SPCS Container (port 8080)
+----------------------------------------------------+
|  Nginx (port 8080) -> reverse proxy                |
|    |                                               |
|  Next.js App (port 3000)                           |
|    -> API Routes (Snowflake SDK, key-pair JWT)     |
|    -> SPCS Proxy (/apps/:slug/*) -> internal DNS   |
|    -> Image proxy (/api/image)                     |
|    -> Analytics (/api/analytics)                   |
|    -> Service detection (SHOW ENDPOINTS)           |
+----------------------------------------------------+
         |
         v
  PORTAL_PRIVATE_KEY_SECRET (mounted as env var)
         |
         v
  Snowflake SDK (SNOWFLAKE_JWT authenticator)
         |
         v
  DEMO_PORTAL database
    -> DEMOS table (registry + scheduling columns)
    -> DEMO_SESSIONS table (active locks)
    -> DEMO_USAGE_LOG table (analytics history)
    -> SETTINGS table (title, logo, topics, capabilities)
    -> IMAGES_STAGE / SCRIPTS_STAGE
    -> GRANT_DEMO_ACCESS procedure (auto-grants permissions)
    -> PORTAL_START / PORTAL_STOP tasks (portal schedule)
    -> DEMO_{ID}_START / DEMO_{ID}_STOP tasks (per-demo schedule)
```

## Prerequisites

- Snowflake account on **AWS** (SPCS requires AWS)
- ACCOUNTADMIN role (or equivalent privileges)
- Docker Desktop (for building the container image)
- Snowflake CLI (`pip install snowflake-cli`)
- Python 3.11+ (for JSON parsing in setup script)
- openssl (for RSA key generation)

## Quick Start

```bash
git clone https://github.com/azbarbarian2020/demo-portal_v3.git
cd demo-portal_v3
./setup.sh
```

The setup script will:

1. Verify prerequisites (snow CLI, Docker, openssl, python3)
2. Test your Snowflake CLI connection and detect account details
3. Verify SPCS availability (AWS check)
4. Prompt for database, schema, warehouse, compute pool names, and portal title
5. Create all infrastructure (database, schema, warehouse, compute pool, image repo, stages)
6. Create service user (DEMO_PORTAL_SVC) with role and grants
7. Generate RSA key-pair and create Snowflake secret
8. Create network rules and external access integration
9. Build and push the Docker image (linux/amd64)
10. Deploy the SPCS service and print the application URL

## Customization

After deployment, navigate to **Admin > Settings** to:

### Portal Title
Change the title displayed in the header. Updates immediately.

### Portal Logo
Upload any image (PNG, SVG, JPG) as your portal logo. The logo is stored in a Snowflake stage and served through the portal's image proxy — no Docker rebuild needed.

### Topics & Capabilities
Add or remove the filter categories shown on the landing page.

### Portal Schedule
Configure when the portal service itself auto-starts and auto-stops (saves compute costs outside working hours).

## CLI Connection Setup

The setup script uses the Snowflake CLI (`snow`) with key-pair JWT authentication.

### 1. Generate an RSA Key Pair (if you don't have one)

```bash
mkdir -p ~/.snowflake/keys
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt > ~/.snowflake/keys/<connection_name>.p8
chmod 600 ~/.snowflake/keys/<connection_name>.p8
```

Assign the public key to your Snowflake user:

```bash
openssl rsa -in ~/.snowflake/keys/<connection_name>.p8 -pubout -out /tmp/key.pub
PUBLIC_KEY=$(grep -v 'BEGIN\|END' /tmp/key.pub | tr -d '\n')
```

```sql
ALTER USER <username> SET RSA_PUBLIC_KEY='<PUBLIC_KEY>';
```

### 2. Configure `~/.snowflake/connections.toml`

```toml
[<connection_name>]
account = "<ORG>-<ACCOUNT>"
user = "<USERNAME>"
authenticator = "SNOWFLAKE_JWT"
private_key_file = "~/.snowflake/keys/<connection_name>.p8"
role = "ACCOUNTADMIN"
```

### 3. Verify

```bash
snow sql --connection <connection_name> -q "SELECT CURRENT_USER()"
```

## Using the Portal

### Adding Demos

1. Navigate to the portal URL and log in via OAuth
2. Click **Admin** in the header
3. Click **Add Demo** to launch the 6-step wizard:
   - **Basic Info**: Name, description
   - **Source**: Select SPCS service or Streamlit app (auto-detected)
   - **Categories**: Topics and capabilities
   - **Files**: Screenshot and click-script (optional)
   - **Schedule**: Auto start/stop times (optional)
   - **Review**: Confirm and publish

### Demo Types

| Type | Behavior | Session Tracking |
|------|----------|-----------------|
| SPCS (proxied) | Loads inline within the portal | Full lock + idle timeout |
| Streamlit (external) | Opens in new tab | Lock acquired, auto-expires |
| External URL | Opens in new tab | Lock acquired, auto-expires |

### Service Scheduling

When publishing a demo, you can configure:
- **Start/Stop times**: CRON-based daily schedule
- **Active days**: Select which days of the week
- **Auto-resume**: Allow users to start an inactive demo by clicking Launch

The portal creates Snowflake TASKs (`DEMO_{ID}_START`, `DEMO_{ID}_STOP`) that automatically resume/suspend the service and compute pool.

## Local Development

```bash
cp .env.example .env.local
# Edit .env.local with your credentials
npm install
npm run dev
# Access at http://localhost:3000
```

### Environment Variables (.env.local)

```
SNOWFLAKE_ACCOUNT=<ORG>-<ACCOUNT>
SNOWFLAKE_USER=<USERNAME>
SNOWFLAKE_WAREHOUSE=<WAREHOUSE>
SNOWFLAKE_PRIVATE_KEY_PATH=~/.snowflake/keys/<connection>.p8
SNOWFLAKE_ROLE=ACCOUNTADMIN
```

## Updating an Existing Deployment

```bash
# 1. Build new image
docker buildx build --platform linux/amd64 --no-cache -t demo-portal:v2 .

# 2. Login and push
snow spcs image-registry login --connection <conn>
REGISTRY=<org-account>.registry.snowflakecomputing.com
docker tag demo-portal:v2 $REGISTRY/<db>/<schema>/portal_repo/demo-portal:v2
docker push $REGISTRY/<db>/<schema>/portal_repo/demo-portal:v2

# 3. Update service
snow sql --connection <conn> -q "ALTER SERVICE <db>.<schema>.DEMO_PORTAL_SVC FROM SPECIFICATION \$\$
spec:
  containers:
    - name: demo-portal
      image: /<db>/<schema>/portal_repo/demo-portal:v2
      env:
        SNOWFLAKE_ACCOUNT: <ORG>-<ACCOUNT>
        SNOWFLAKE_USER: DEMO_PORTAL_SVC
        SNOWFLAKE_WAREHOUSE: <WAREHOUSE>
        SNOWFLAKE_ROLE: DEMO_PORTAL_ROLE
      secrets:
        - snowflakeSecret:
            objectName: <db>.<schema>.PORTAL_PRIVATE_KEY_SECRET
          secretKeyRef: secret_string
          envVarName: SNOWFLAKE_PRIVATE_KEY
      readinessProbe:
        port: 8080
        path: /api/health
  endpoints:
    - name: portal
      port: 8080
      public: true
\$\$"
```

## Scripts

| Script | Purpose |
|--------|---------|
| `./setup.sh` | Full automated deployment (interactive prompts) |
| `./teardown.sh` | Safe cleanup (suspends tasks, removes all portal objects) |

## Snowflake Objects Created

| Object | Type | Purpose |
|--------|------|---------|
| DEMO_PORTAL | Database | All portal data |
| DEMOS | Table | Demo registry (scheduling, proxy config, metadata) |
| DEMO_SESSIONS | Table | Active session locks |
| DEMO_USAGE_LOG | Table | Usage history for analytics |
| SETTINGS | Table | Branding (title, logo), topics, capabilities |
| IMAGES_STAGE | Stage | Screenshots and logo storage |
| SCRIPTS_STAGE | Stage | Click-script file storage |
| PORTAL_PRIVATE_KEY_SECRET | Secret | RSA private key for service auth |
| PORTAL_REPO | Image Repository | Docker image storage |
| DEMO_PORTAL_SVC | Service | The running portal app |
| DEMO_PORTAL_POOL | Compute Pool | CPU_X64_XS node |
| DEMO_PORTAL_ROLE | Role | Service access + task scheduling |
| DEMO_PORTAL_SVC | User (SERVICE) | Dedicated service account |
| DEMO_PORTAL_EXTERNAL_ACCESS | EAI | Network egress |
| GRANT_DEMO_ACCESS | Procedure | Auto-grants on new services |
| PORTAL_START / PORTAL_STOP | Tasks | Portal auto-schedule |
| DEMO_{ID}_START / STOP | Tasks | Per-demo schedules |

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues and fixes.

## License

MIT License
