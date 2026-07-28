#!/bin/bash
set -e

echo "================================================================="
echo "  Demo Portal v3 - Setup"
echo "  Portable SPCS Deployment with Key-Pair JWT Auth"
echo "================================================================="
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

check_prereqs() {
    echo -e "${BOLD}Checking prerequisites...${NC}"
    local missing=0
    for cmd in snow docker python3 openssl; do
        if ! command -v "$cmd" &>/dev/null; then
            echo -e "  ${RED}✗ $cmd not found${NC}"
            missing=1
        else
            echo -e "  ${GREEN}✓ $cmd${NC}"
        fi
    done
    docker info &>/dev/null 2>&1 || { echo -e "  ${RED}✗ Docker daemon not running${NC}"; missing=1; }
    if [ $missing -eq 1 ]; then
        echo -e "\n${RED}Please install missing prerequisites and re-run.${NC}"
        exit 1
    fi
    echo ""
}

setup_connection() {
    echo -e "${BOLD}Connection Setup${NC}"
    echo "Available connections:"
    snow connection list 2>/dev/null || true
    echo ""
    read -p "Enter connection name to use: " CONNECTION_NAME
    echo ""

    echo "Testing connection..."
    snow sql --connection "$CONNECTION_NAME" -q "SELECT CURRENT_USER()" >/dev/null 2>&1 || {
        echo -e "${RED}Connection test failed. Check your connection config.${NC}"
        exit 1
    }
    echo -e "${GREEN}Connection OK${NC}"
    echo ""

    ACCOUNT_INFO=$(snow sql --connection "$CONNECTION_NAME" -q "SELECT CURRENT_ORGANIZATION_NAME() || '-' || CURRENT_ACCOUNT_NAME() AS ACCT" --format json 2>/dev/null)
    ACCOUNT_LOCATOR=$(echo "$ACCOUNT_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['ACCT'])")
    ACCOUNT_LOWER=$(echo "$ACCOUNT_LOCATOR" | tr '[:upper:]' '[:lower:]')
    SNOWFLAKE_HOST="${ACCOUNT_LOWER}.snowflakecomputing.com"
    REGISTRY_HOST="${ACCOUNT_LOWER}.registry.snowflakecomputing.com"
    SNOWFLAKE_USER=$(snow sql --connection "$CONNECTION_NAME" -q "SELECT CURRENT_USER()" --format json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['CURRENT_USER()'])")
    SF_ACCOUNT_LOCATOR=$(snow sql --connection "$CONNECTION_NAME" -q "SELECT CURRENT_ACCOUNT()" --format json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['CURRENT_ACCOUNT()'])")

    # Verify SPCS is available (AWS only)
    CLOUD=$(snow sql --connection "$CONNECTION_NAME" -q "SELECT CURRENT_REGION()" --format json 2>/dev/null | python3 -c "import sys,json; r=json.load(sys.stdin)[0]['CURRENT_REGION()']; print('AWS' if 'aws' in r.lower() else 'AZURE' if 'azure' in r.lower() else 'GCP')" 2>/dev/null || echo "UNKNOWN")
    if [ "$CLOUD" != "AWS" ]; then
        echo -e "${YELLOW}Warning: This account is on ${CLOUD}. SPCS is currently only available on AWS.${NC}"
        read -p "Continue anyway? (y/n): " CONT
        if [[ "$CONT" != "y" && "$CONT" != "Y" ]]; then exit 1; fi
    fi

    echo -e "  Account:   ${CYAN}${ACCOUNT_LOCATOR}${NC}"
    echo -e "  Host:      ${CYAN}${SNOWFLAKE_HOST}${NC}"
    echo -e "  Registry:  ${CYAN}${REGISTRY_HOST}${NC}"
    echo -e "  User:      ${CYAN}${SNOWFLAKE_USER}${NC}"
    echo -e "  Cloud:     ${CYAN}${CLOUD}${NC}"
    echo ""
}

snow_sql() {
    if [ -n "${SNOW_WH:-}" ]; then
        snow sql --connection "$CONNECTION_NAME" --warehouse "$SNOW_WH" "$@"
    else
        snow sql --connection "$CONNECTION_NAME" "$@"
    fi
}

SNOW_WH=""

gather_config() {
    echo -e "${BOLD}Configuration${NC}"
    echo ""
    read -p "Database name [DEMO_PORTAL]: " DATABASE
    DATABASE=${DATABASE:-DEMO_PORTAL}
    read -p "Schema name [PUBLIC]: " SCHEMA
    SCHEMA=${SCHEMA:-PUBLIC}
    read -p "Warehouse name [DEMO_PORTAL_WH]: " WAREHOUSE
    WAREHOUSE=${WAREHOUSE:-DEMO_PORTAL_WH}
    read -p "Compute Pool name [DEMO_PORTAL_POOL]: " COMPUTE_POOL
    COMPUTE_POOL=${COMPUTE_POOL:-DEMO_PORTAL_POOL}
    read -p "Portal title [Demo Portal]: " PORTAL_TITLE
    PORTAL_TITLE=${PORTAL_TITLE:-Demo Portal}
    echo ""
    echo -e "  Database:      ${CYAN}${DATABASE}${NC}"
    echo -e "  Schema:        ${CYAN}${SCHEMA}${NC}"
    echo -e "  Warehouse:     ${CYAN}${WAREHOUSE}${NC}"
    echo -e "  Compute Pool:  ${CYAN}${COMPUTE_POOL}${NC}"
    echo -e "  Portal Title:  ${CYAN}${PORTAL_TITLE}${NC}"
    echo ""
    read -p "Continue? (y/n): " CONFIRM
    if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
        echo "Setup cancelled."
        exit 0
    fi
    echo ""
}

create_infrastructure() {
    echo -e "${BOLD}[1/8] Creating infrastructure...${NC}"

    local tmpdir
    tmpdir=$(mktemp -d)
    sed "s/__DATABASE__/${DATABASE}/g; s/__SCHEMA__/${SCHEMA}/g; s/__WAREHOUSE__/${WAREHOUSE}/g; s/__COMPUTE_POOL__/${COMPUTE_POOL}/g" \
        "$SCRIPT_DIR/scripts/01_infrastructure.sql" > "$tmpdir/01.sql"
    snow_sql -f "$tmpdir/01.sql"
    SNOW_WH="$WAREHOUSE"

    sed "s/__DATABASE__/${DATABASE}/g; s/__SCHEMA__/${SCHEMA}/g; s/__WAREHOUSE__/${WAREHOUSE}/g" \
        "$SCRIPT_DIR/scripts/02_tables.sql" > "$tmpdir/02.sql"
    snow_sql -f "$tmpdir/02.sql"

    # Seed portal title
    ESCAPED_TITLE=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]).replace(\"'\",\"''\"))" "$PORTAL_TITLE")
    snow_sql -q "MERGE INTO ${DATABASE}.${SCHEMA}.SETTINGS t USING (SELECT 'portal_title' AS key) s ON t.key = s.key WHEN MATCHED THEN UPDATE SET value = PARSE_JSON('${ESCAPED_TITLE}') WHEN NOT MATCHED THEN INSERT (key, value) VALUES ('portal_title', PARSE_JSON('${ESCAPED_TITLE}'));"

    REPO_URL=$(snow_sql -q "SHOW IMAGE REPOSITORIES IN SCHEMA ${DATABASE}.${SCHEMA};" --format json 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
for row in data:
    if row.get('name','').upper() == 'PORTAL_REPO':
        print(row['repository_url'])
        break
")
    echo -e "  Image repo: ${CYAN}${REPO_URL}${NC}"
    rm -rf "$tmpdir"
    echo -e "${GREEN}✓ Infrastructure created${NC}\n"
}

create_service_user() {
    echo -e "${BOLD}[2/8] Creating service user and role...${NC}"

    local tmpdir
    tmpdir=$(mktemp -d)
    sed "s/__DATABASE__/${DATABASE}/g; s/__SCHEMA__/${SCHEMA}/g; s/__WAREHOUSE__/${WAREHOUSE}/g" \
        "$SCRIPT_DIR/scripts/03_service_user.sql" > "$tmpdir/03.sql"
    snow_sql -f "$tmpdir/03.sql"
    rm -rf "$tmpdir"

    echo -e "${GREEN}✓ Service user and role created${NC}\n"
}

create_keypair() {
    echo -e "${BOLD}[3/8] Setting up key-pair authentication for DEMO_PORTAL_SVC...${NC}"
    echo ""

    EXISTING_KEY=$(snow_sql -q "DESCRIBE USER DEMO_PORTAL_SVC;" --format json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for row in data:
        if row.get('property') == 'RSA_PUBLIC_KEY':
            val = row.get('value', '')
            if val and val != 'null' and len(val) > 10:
                print('EXISTS')
                break
except: pass
" 2>/dev/null || echo "")

    if [ "$EXISTING_KEY" = "EXISTS" ]; then
        echo "  RSA key already exists on DEMO_PORTAL_SVC."
        SECRET_EXISTS=$(snow_sql -q "SHOW SECRETS LIKE 'PORTAL_PRIVATE_KEY_SECRET' IN SCHEMA ${DATABASE}.${SCHEMA};" --format json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d else 'no')" 2>/dev/null || echo "no")
        if [ "$SECRET_EXISTS" = "yes" ]; then
            echo -e "  ${GREEN}✓ Private key secret already exists - reusing${NC}"
        else
            echo -e "  ${YELLOW}Key exists but no secret found. Generating new key pair...${NC}"
            generate_new_key
        fi
    else
        generate_new_key
    fi

    snow_sql -q "GRANT READ ON SECRET ${DATABASE}.${SCHEMA}.PORTAL_PRIVATE_KEY_SECRET TO ROLE DEMO_PORTAL_ROLE;"
    echo -e "${GREEN}✓ Key-pair authentication configured${NC}\n"
}

generate_new_key() {
    echo "  Generating RSA key pair for DEMO_PORTAL_SVC..."
    TEMP_DIR=$(mktemp -d)
    openssl genrsa 2048 2>/dev/null | openssl pkcs8 -topk8 -nocrypt -out "$TEMP_DIR/key.p8" 2>/dev/null
    openssl rsa -in "$TEMP_DIR/key.p8" -pubout -out "$TEMP_DIR/key.pub" 2>/dev/null
    PUBLIC_KEY=$(grep -v "BEGIN\|END" "$TEMP_DIR/key.pub" | tr -d '\n')

    snow_sql -q "ALTER USER DEMO_PORTAL_SVC SET RSA_PUBLIC_KEY='${PUBLIC_KEY}';"
    echo -e "  ${GREEN}✓ Public key assigned to DEMO_PORTAL_SVC${NC}"

    PRIVATE_KEY=$(awk '{printf "%s\\n", $0}' "$TEMP_DIR/key.p8")
    snow_sql -q "CREATE OR REPLACE SECRET ${DATABASE}.${SCHEMA}.PORTAL_PRIVATE_KEY_SECRET TYPE = GENERIC_STRING SECRET_STRING = '${PRIVATE_KEY}';"
    echo -e "  ${GREEN}✓ Private key secret created${NC}"

    rm -rf "$TEMP_DIR"
}

create_external_access() {
    echo -e "${BOLD}[4/8] Creating network rules and external access integration...${NC}"

    S3_HOST=$(snow_sql -q "SELECT SPLIT_PART(GET_PRESIGNED_URL(@${DATABASE}.${SCHEMA}.IMAGES_STAGE, 'probe.txt'), '/', 3) AS HOST;" --format json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['HOST'])" 2>/dev/null || echo "")

    if [ -n "$S3_HOST" ]; then
        echo "  S3 stage host: $S3_HOST"
        snow_sql -q "CREATE OR REPLACE NETWORK RULE ${DATABASE}.${SCHEMA}.SNOWFLAKE_API_RULE TYPE = HOST_PORT MODE = EGRESS VALUE_LIST = ('${SNOWFLAKE_HOST}:443', '${S3_HOST}:443');"
    else
        echo -e "  ${YELLOW}Could not detect S3 stage host; using Snowflake host only${NC}"
        snow_sql -q "CREATE OR REPLACE NETWORK RULE ${DATABASE}.${SCHEMA}.SNOWFLAKE_API_RULE TYPE = HOST_PORT MODE = EGRESS VALUE_LIST = ('${SNOWFLAKE_HOST}:443');"
    fi

    snow_sql -q "CREATE OR REPLACE EXTERNAL ACCESS INTEGRATION DEMO_PORTAL_EXTERNAL_ACCESS ALLOWED_NETWORK_RULES = (${DATABASE}.${SCHEMA}.SNOWFLAKE_API_RULE) ALLOWED_AUTHENTICATION_SECRETS = (${DATABASE}.${SCHEMA}.PORTAL_PRIVATE_KEY_SECRET) ENABLED = TRUE;"

    echo -e "${GREEN}✓ External access configured${NC}\n"
}

ensure_network_policy_access() {
    echo -e "${BOLD}[5/8] Checking network policy for SPCS access...${NC}"

    CURRENT_POLICY=$(snow_sql -q "SHOW PARAMETERS LIKE 'NETWORK_POLICY' IN ACCOUNT;" --format json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data:
        print(data[0].get('value', ''))
except: pass
" 2>/dev/null || echo "")

    if [ -z "$CURRENT_POLICY" ]; then
        echo "  No account-level network policy set. SPCS access should work."
        echo -e "${GREEN}✓ No network policy blocking${NC}\n"
        return
    fi

    echo "  Account network policy: $CURRENT_POLICY"
    echo -e "  ${YELLOW}Note: If SPCS OAuth login fails, you may need to add SPCS CIDRs to your network policy.${NC}"
    echo -e "${GREEN}✓ Network policy check complete${NC}\n"
}

build_and_push() {
    echo -e "${BOLD}[6/8] Building and pushing Docker image...${NC}"

    snow spcs image-registry login --connection "$CONNECTION_NAME"

    IMAGE_TAG="v1-$(date +%s)"
    IMAGE_PATH="${REPO_URL}/demo-portal:${IMAGE_TAG}"
    echo "  Building image: ${IMAGE_PATH}"

    docker buildx build --platform linux/amd64 --no-cache \
        -t "$IMAGE_PATH" \
        -f "$SCRIPT_DIR/Dockerfile" \
        "$SCRIPT_DIR" \
        --load

    echo "  Pushing image..."
    HTTPS_PROXY="" HTTP_PROXY="" NO_PROXY="${REGISTRY_HOST}" docker push "$IMAGE_PATH"
    echo -e "${GREEN}✓ Image pushed to Snowflake registry${NC}\n"
}

deploy_service() {
    echo -e "${BOLD}[7/8] Deploying SPCS service...${NC}"

    snow_sql -q "CREATE SERVICE IF NOT EXISTS ${DATABASE}.${SCHEMA}.DEMO_PORTAL_SVC
    IN COMPUTE POOL ${COMPUTE_POOL}
    EXTERNAL_ACCESS_INTEGRATIONS = (DEMO_PORTAL_EXTERNAL_ACCESS)
    MIN_INSTANCES = 1
    MAX_INSTANCES = 1
    FROM SPECIFICATION \$\$
spec:
  containers:
    - name: demo-portal
      image: ${IMAGE_PATH}
      env:
        SNOWFLAKE_ACCOUNT: ${ACCOUNT_LOCATOR}
        SNOWFLAKE_USER: DEMO_PORTAL_SVC
        SNOWFLAKE_WAREHOUSE: ${WAREHOUSE}
        SNOWFLAKE_ROLE: DEMO_PORTAL_ROLE
      secrets:
        - snowflakeSecret:
            objectName: ${DATABASE}.${SCHEMA}.PORTAL_PRIVATE_KEY_SECRET
          secretKeyRef: secret_string
          envVarName: SNOWFLAKE_PRIVATE_KEY
      readinessProbe:
        port: 8080
        path: /api/health
  endpoints:
    - name: portal
      port: 8080
      public: true
\$\$;"

    echo "  Waiting for service to start..."
    for i in $(seq 1 30); do
        STATUS=$(snow_sql -q "SELECT SYSTEM\$GET_SERVICE_STATUS('${DATABASE}.${SCHEMA}.DEMO_PORTAL_SVC')" --format json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    status_json = json.loads(data[0][list(data[0].keys())[0]])
    print(status_json[0].get('status', 'UNKNOWN'))
except:
    print('PENDING')
" 2>/dev/null || echo "PENDING")
        echo "  Status: $STATUS ($i/30)"
        if [ "$STATUS" = "READY" ]; then
            break
        fi
        sleep 15
    done
    echo -e "${GREEN}✓ Service deployed${NC}\n"
}

show_results() {
    echo -e "${BOLD}[8/8] Getting service endpoint...${NC}"
    ENDPOINT=$(snow_sql -q "SHOW ENDPOINTS IN SERVICE ${DATABASE}.${SCHEMA}.DEMO_PORTAL_SVC;" --format json 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
for row in data:
    url = row.get('ingress_url', '')
    if url:
        print(url)
        break
" 2>/dev/null || echo "(endpoint not yet available)")

    echo ""
    echo -e "${GREEN}=================================================================${NC}"
    echo -e "${GREEN}  Setup Complete!${NC}"
    echo -e "${GREEN}=================================================================${NC}"
    echo ""
    echo -e "  App URL:       ${CYAN}https://${ENDPOINT}${NC}"
    echo -e "  Account:       ${ACCOUNT_LOCATOR}"
    echo -e "  Database:      ${DATABASE}"
    echo -e "  Schema:        ${SCHEMA}"
    echo -e "  Service:       ${DATABASE}.${SCHEMA}.DEMO_PORTAL_SVC"
    echo -e "  Service User:  DEMO_PORTAL_SVC"
    echo -e "  Pool:          ${COMPUTE_POOL}"
    echo -e "  Title:         ${PORTAL_TITLE}"
    echo ""
    echo "  To customize:  Log in > Admin > Settings (change title/logo)"
    echo "  To add demos:  Log in > Admin > Add Demo"
    echo "  To tear down:  ./teardown.sh"
    echo -e "${GREEN}=================================================================${NC}"
}

main() {
    check_prereqs
    setup_connection
    gather_config
    create_infrastructure     # Step 1: DB, schema, WH, pool, stages
    create_service_user       # Step 2: Role + user + grants
    create_keypair            # Step 3: RSA key pair + secret
    create_external_access    # Step 4: Network rule + EAI
    ensure_network_policy_access  # Step 5: Account network policy

    echo ""
    read -p "Build and push Docker image? (y/n): " BUILD_DOCKER
    if [[ "$BUILD_DOCKER" == "y" || "$BUILD_DOCKER" == "Y" ]]; then
        build_and_push        # Step 6
        deploy_service        # Step 7
        show_results          # Step 8
    else
        echo ""
        echo "To complete setup manually:"
        echo "  1. docker buildx build --platform linux/amd64 --no-cache -t demo-portal:v1 ."
        echo "  2. docker tag demo-portal:v1 $REPO_URL/demo-portal:v1"
        echo "  3. docker push $REPO_URL/demo-portal:v1"
        echo "  4. Create service via scripts/05_service.sql"
    fi
}

main
