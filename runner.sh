#!/bin/bash

[ -z "$NODE_ENV" ] && echo "NODE_ENV is not set. Missing doppler or .env secrets" && exit 1

dockerfile_set() {
    [ "$NODE_ENV" = "production" ] && echo "docker-compose.yml" || echo "docker-compose.yml -f docker-compose-dev.yml"
}

docker_command() {
    docker compose -f "$dockerfile" "$@"
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

app=${2:-""}
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
        "packages/twitch/chat/src/db"
        "packages/twitch/events/src/db"
    )

    echo "Generating types for project $PROJECT_ID on $NODE_ENV"
    for OUTPUT_DIR in "${OUTPUT_DIRS[@]}"; do
        OUTPUT_FILE="$OUTPUT_DIR/supabase-types.ts"
        npx supabase gen types typescript --project-id "$PROJECT_ID" --schema public >"$OUTPUT_FILE"
        # Run prettier on the generated file
        npx prettier --write "$OUTPUT_FILE"
    done
}

backup() {
    echo "Backing up database"
    echo "URL is: ${DATABASE_URL}"
    /opt/homebrew/opt/libpq/bin/pg_dump "${DATABASE_URL%\?*}" --no-comments -F c -N _realtime -N supabase_functions >ok.sql
}

restore() {
    echo "Restoring database"
    echo "URL is: ${DATABASE_URL}"
    /opt/homebrew/opt/libpq/bin/pg_restore -d "${DATABASE_URL%\?*}" ok.sql
    rm ok.sql
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
    [ "$NODE_ENV" = "production" ] && discord_notify "Server update, restarting Dotabod!"
    down
    up
}

pull() {
    docker_login
    docker_command pull twitch-events dota twitch-chat nginx
}

push() {
    docker_login
    buildall
    docker_command push twitch-events dota twitch-chat nginx
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
    docker_command up -d "$app"
    echo -e "Successfully ran!"
}

ssh() {
    docker exec -it "$app" sh
}

login() {
    docker_login
}

up() {
    docker_login
    echo "Starting server with database $NODE_ENV at $dockerfile"
    docker_command up -d "$app"
}

update() {
    [ "$NODE_ENV" = "production" ] && discord_notify "Server update, restarting Dotabod! Here's what's coming: https://github.com/dotabod/backend/compare/$COMMIT_HASH...master"
    git pull || true
    buildall
    up
}

pullall() {
    cd ./packages/prisma && yarn pull:psql && yarn build
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
pullall) pullall ;;
*) echo "Invalid command: $1" ;;
esac