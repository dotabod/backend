# Lists Recipes
default:
  @echo $NODE_ENV
  @just --list

dockerfile := if env_var("NODE_ENV") == "production" { "docker-compose-prod.yml" } else { "docker-compose.yml" }
app := ""

GREEN  := "\\u001b[32m"
RESET  := "\\u001b[0m"
CHECK  := `/usr/bin/printf "\xE2\x9C\x94"`

i18np:
    @echo "Parsing translation files"
    @i18next -c 'web/i18next-parser.config.js'

i18nd:
    @echo "Downloading translations"
    @crowdin.bat download --config './crowdin.yml'

i18nu:
    @echo "Uploading translations"
    @crowdin.bat upload translations --config './crowdin.yml'

# Lints Web source code
test: build
    @docker compose -f {{dockerfile}} run web yarn lint
    @echo -e " {{GREEN}}{{CHECK}} All tests passed! {{CHECK}} {{RESET}}"

# Stops all containers
down:
    @docker compose -f {{dockerfile}} down

# Builds all images
build:
    @docker compose -f {{dockerfile}} build
    @echo -e " {{GREEN}}{{CHECK}} Successfully built! {{CHECK}} {{RESET}}"

logone:
    @docker logs {{app}} -f

# Builds all images
buildone:
    @echo -e "Running for {{app}} on {{dockerfile}}"
    git pull
    @docker compose -f {{dockerfile}} build {{app}}
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
    @docker compose -f {{dockerfile}} up -d

pullall:
    cd ./web && yarn pullpsql && yarn postinstall
    cd ./twitch-eventsub-listener && yarn pullpsql && yarn postinstall
    cd ./twitch-chat-listener && yarn pullpsql && yarn postinstall