#!/bin/bash

[ -z "$DOTABOD_ENV" ] && echo "DOTABOD_ENV is not set. Missing doppler or .env secrets" && exit 1

app=${2:-""}

dockerfile_set() {
    [ "$DOTABOD_ENV" = "production" ] && echo "docker-compose.yml" || echo "docker-compose.yml -f docker-compose-dev.yml"
}

docker_command() {
    if [ -z "$app" ]; then
        eval docker compose -f "$dockerfile" "$@"
    else
        eval docker compose -f "$dockerfile" "$@" "$app"
    fi
}
discord_notify() {
    json_payload=$(jq -n \
        --arg avatar_url "https://static-cdn.jtvnw.net/jtv_user_pictures/d52ea619-5491-4a66-aeeb-f180a2668049-profile_image-70x70.png" \
        --arg username "Dotabod Server" \
        --arg content "$1" \
        '{avatar_url: $avatar_url, username: $username, content: $content}')

    curl -X POST "$DISCORD_SERVER_WEBHOOK" \
        -H "Content-Type: application/json" \
        -d "$json_payload"
}

docker_login() {
    echo "$DOCKER_PAT" | docker login ghcr.io -u "$DOCKER_USER" --password-stdin
}

dockerfile=$(dockerfile_set)
COMMIT_HASH=$(git rev-parse --short HEAD)
export COMMIT_HASH

gentypes() {
    # Extract the domain and subdomain
    domain_and_subdomain=$(echo "$DB_URL" | awk -F[/:] '{print $4}')

    # Extract just the subdomain from the domain and subdomain
    PROJECT_ID=$(echo "$domain_and_subdomain" | awk -F. '{print $1}')

    # Print the subdomain
    OUTPUT_DIRS=(
        "packages/dota/src/db"
        "packages/twitch-chat/src/db"
        "packages/twitch-events/src/db"
    )

    echo "Generating types for project $PROJECT_ID on $DOTABOD_ENV"
    for OUTPUT_DIR in "${OUTPUT_DIRS[@]}"; do
        OUTPUT_FILE="$OUTPUT_DIR/supabase-types.ts"
        npx supabase gen types typescript --project-id "$PROJECT_ID" --schema public >"$OUTPUT_FILE"
        echo '' | cat - "$OUTPUT_FILE" >temp && mv temp "$OUTPUT_FILE"
        npx prettier --write "$OUTPUT_FILE"
    done
}

backup() {
    echo "Backing up database"
    DATABASE_URL=""
    echo "URL is: ${DATABASE_URL}"
    supabase db dump --db-url "${DATABASE_URL%\?*}" -f ./roles.sql --role-only
    supabase db dump --db-url "${DATABASE_URL%\?*}" -f ./schema.sql
    supabase db dump --db-url "${DATABASE_URL%\?*}" -f ./seed.sql --use-copy --data-only

    # Determine the correct pg_dump command
    if command -v pg_dump >/dev/null; then
        PG_DUMP_COMMAND=(pg_dump)
    else
        PG_DUMP_COMMAND=("C:/Program Files/PostgreSQL/15/bin/pg_dump.exe")
    fi

    "${PG_DUMP_COMMAND[@]}" -t '"cron"."job"' --data-only --column-inserts --file=cron.sql "${DATABASE_URL%\?*}"
}

restore() {
    echo "Restoring database"
    echo "URL is: ${DATABASE_URL}"
    if command -v psql >/dev/null; then
        PSQL_COMMAND=(psql)
    else
        PSQL_COMMAND=("C:/Program Files/PostgreSQL/15/bin/psql.exe")
    fi
    DB_URL=""
    "${PSQL_COMMAND[@]}" -c "DELETE FROM cron.job" "$DB_URL"
    "${PSQL_COMMAND[@]}" -c "DROP TABLE IF EXISTS public.users CASCADE" "$DB_URL"
    "${PSQL_COMMAND[@]}" -c "DROP TABLE IF EXISTS public.streams CASCADE" "$DB_URL"
    "${PSQL_COMMAND[@]}" -c "DROP TABLE IF EXISTS public.steam_accounts CASCADE" "$DB_URL"
    "${PSQL_COMMAND[@]}" -c "DROP TABLE IF EXISTS public.settings CASCADE" "$DB_URL"
    "${PSQL_COMMAND[@]}" -c "DROP TABLE IF EXISTS public.mods CASCADE" "$DB_URL"
    "${PSQL_COMMAND[@]}" -c "DROP TABLE IF EXISTS public.bets CASCADE" "$DB_URL"
    "${PSQL_COMMAND[@]}" -c "DROP TABLE IF EXISTS public.accounts CASCADE" "$DB_URL"
    # Removed for now: --file roles.sql \
    "${PSQL_COMMAND[@]}" \
        --single-transaction \
        --variable ON_ERROR_STOP=1 \
        --file schema.sql \
        --file cron.sql \
        --command 'SET session_replication_role = replica' \
        --file seed.sql \
        "$DB_URL"

    # rm -f roles.sql schema.sql data.sql
}

changelog() {
    since="2023-02-23"
    git log --pretty="* %cs %s" --author-date-order --since="$since" >changes.md
}

ip() {
    command ip addr | grep eth0 | grep inet | awk '{print $2}' | awk -F/ '{print $1}' | head -1
}

i18np() {
    echo "Parsing translation files"
    i18next -c 'services/crowdin/src/i18next-parser.config.js'
}

i18nd() {
    fam=$(uname -s)
    crowdin_bin="crowdin"
    [ "$fam" = "Windows" ] && crowdin_bin="crowdin.bat"
    $crowdin_bin download --config "./crowdin.yml"
}

i18nu() {
    fam=$(uname -s)
    crowdin_bin="crowdin"
    [ "$fam" = "Windows" ] && crowdin_bin="crowdin.bat"
    $crowdin_bin upload translations --auto-approve-imported --config "./crowdin.yml"
}

down() {
    docker_command down
}

stop() {
    down
}

restart() {
    [ "$DOTABOD_ENV" = "production" ] && discord_notify "Server update, restarting Dotabod!"
    down
    up
}

pull() {
    docker_login
    docker_command pull "$app"
}

push() {
    docker_login
    docker_command build "$app"
    docker_command push "$app"
}

buildall() {
    docker_command build
    echo "Successfully built!"
}

logs() {
    docker_command logs -f "$app"
}

build() {
    git pull || true
    docker_command build "$app"
    echo -e "Successfully built!"
}

ssh() {
    docker exec -it "$app" sh
}

login() {
    docker_login
}

up() {
    docker_login
    echo "Starting server with database $DOTABOD_ENV at $dockerfile"
    docker_command watch "$app"
}

update() {
    [ "$DOTABOD_ENV" = "production" ] && discord_notify "Server update, restarting Dotabod! Here's what's coming: https://github.com/dotabod/backend/compare/$COMMIT_HASH...master"
    git pull || true
    buildall
    up
}

# Main script
case "$1" in
gentypes) gentypes ;;
backup) backup ;;
restore) restore ;;
changelog) changelog ;;
ip) ip ;;
i18np) i18np ;;
i18nd) i18nd ;;
i18nu) i18nu ;;
down) down ;;
stop) stop ;;
restart) restart ;;
pull) pull ;;
push) push ;;
buildall) buildall ;;
logs) logs ;;
build) build ;;
ssh) ssh ;;
login) login ;;
up) up ;;
update) update ;;
*) echo "Invalid command: $1" ;;
esac
