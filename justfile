set dotenv-load

dockerfile := if env_var("NODE_ENV") == "production" { "docker-compose.yml" } else { "docker-compose.yml -f docker-compose-dev.yml" }
export COMMIT_HASH := `git rev-parse --short HEAD`

GREEN  := "\\u001b[32m"
RESET  := "\\u001b[0m"
CHECK  := `/usr/bin/printf "\xE2\x9C\x94"`

# Lists Recipes
default:
  @echo Environment is $NODE_ENV on commit {{COMMIT_HASH}}
  @just --list


i18np:
    @echo "Parsing translation files"
    @i18next -c 'packages/dota/i18next-parser.config.js'

i18nd:
    @echo "Downloading translations"
    @crowdin.bat download --config './crowdin.yml'

i18nu:
    @echo "Uploading translations"
    @crowdin.bat upload translations --auto-approve-imported --config './crowdin.yml'

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
    @docker logs {{app}} -f

# Builds one image
build app="":
    @echo -e "Running for {{app}} on {{dockerfile}} with {{COMMIT_HASH}}"
    git pull
    @docker compose -f {{dockerfile}} build  {{app}}
    @echo -e " {{GREEN}}{{CHECK}} Successfully built! {{CHECK}} {{RESET}}"
    @docker compose -f {{dockerfile}} up -d {{app}}
    @echo -e " {{GREEN}}{{CHECK}} Successfully ran! {{CHECK}} {{RESET}}"

# Starts images
up:
    @echo "Starting server with database $NODE_ENV at {{dockerfile}}"
    @docker compose -f {{dockerfile}} up -d

update:
    git pull
    @docker compose -f {{dockerfile}} build
    @echo -e " {{GREEN}}{{CHECK}} Successfully built! {{CHECK}} {{RESET}}"
    @docker compose -f {{dockerfile}} up  -d

pullall:
    cd ./packages/dota && yarn pullpsql && yarn generateprisma
    cd ./packages/twitch/events && yarn pullpsql && yarn generateprisma
    cd ./packages/twitch/chat && yarn pullpsql && yarn generateprisma
