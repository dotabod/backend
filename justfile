set dotenv-load

dockerfile := if env_var("NODE_ENV") == "production" { "docker-compose.yml" } else { "docker-compose.yml -f docker-compose-dev.yml" }
fam := os_family()

export COMMIT_HASH := `git rev-parse --short HEAD`
export BUILDKIT_PROGRESS := "plain"

GREEN  := "\\u001b[32m"
RESET  := "\\u001b[0m"
CHECK  := `/usr/bin/printf "\xE2\x9C\x94"`

# Lists Recipes
default:
  @echo Environment is $NODE_ENV on commit {{COMMIT_HASH}}
  @just --list

changelog since="2023-02-23":
    @git log --pretty="* %cs %s" --author-date-order --since="{{since}}" > changes.md

ip:
    @ip addr | grep eth0 | grep inet | awk '{print $2}' | awk -F/ '{print $1}' | head -1

i18np:
    @echo "Parsing translation files"
    @i18next -c 'services/crowdin/src/i18next-parser.config.js'

i18nd:
    @echo "Downloading translations"
    if [[ {{fam}} == "windows" ]]; then \
        @crowdin download --config "./crowdin.yml" --verbose; \
    else \
        @crowdin download --config "./crowdin.yml"; \
    fi

i18nu:
    @echo "Uploading translations"
    if [[ {{fam}} == "windows" ]]; then \
        @crowdin.bat upload translations --auto-approve-imported --config "./crowdin.yml"; \
    else \
        @crowdin upload translations --auto-approve-imported --config "./crowdin.yml"; \
    fi

# Stops all containers
down:
    @docker compose -f {{dockerfile}} down
stop:
    @docker compose -f {{dockerfile}} down

restart:
    @docker compose -f {{dockerfile}} down
    @docker compose -f {{dockerfile}} up -d

# Builds all images
buildall:
    @docker compose -f {{dockerfile}} build
    @echo -e " {{GREEN}}{{CHECK}} Successfully built! {{CHECK}} {{RESET}}"

logs app="":
    @docker compose logs -f {{app}}

# Builds one image
build app="":
    @echo -e "Running for {{app}} on {{dockerfile}} with {{COMMIT_HASH}}"
    git pull || true
    export COMMIT_HASH=`git rev-parse --short HEAD`
    @docker compose -f {{dockerfile}} build {{app}}
    @echo -e " {{GREEN}}{{CHECK}} Successfully built! {{CHECK}} {{RESET}}"
    @docker compose -f {{dockerfile}} up -d {{app}}
    @echo -e " {{GREEN}}{{CHECK}} Successfully ran! {{CHECK}} {{RESET}}"

# ssh one image
ssh app="":
    @docker exec -it {{app}} sh

# Starts images
up:
    @echo "Starting server with database $NODE_ENV at {{dockerfile}}"
    @docker compose -f {{dockerfile}} up -d

update:
    @if [ "${NODE_ENV}" = "production" ]; then \
        curl $DISCORD_SERVER_WEBHOOK -d "avatar_url=https%3A%2F%2Fstatic-cdn.jtvnw.net%2Fjtv_user_pictures%2Fd52ea619-5491-4a66-aeeb-f180a2668049-profile_image-70x70.png&username=Dotabod Server&content=Server%20update%2C%20restarting%20Dotabod%21%20Here%27s%20what%27s%20coming%3A%20https%3A%2F%2Fgithub.com%2Fdotabod%2Fbackend%2Fcompare%2F{{COMMIT_HASH}}...master"; \
    fi
    git pull || true
    export COMMIT_HASH=`git rev-parse --short HEAD`
    @docker compose -f {{dockerfile}} build
    @echo -e " {{GREEN}}{{CHECK}} Successfully built! {{CHECK}} {{RESET}}"
    @docker compose -f {{dockerfile}} up -d

pullall:
    cd ./packages/dota && yarn pullpsql && yarn generateprisma
    cd ./packages/twitch/events && yarn pullpsql && yarn generateprisma
    cd ./packages/twitch/chat && yarn pullpsql && yarn generateprisma
