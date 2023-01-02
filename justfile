# Lists Recipes
default:
  @echo $NODE_ENV
  @just --list

dockerfile := if env_var("NODE_ENV") == "production" { "docker-compose-prod.yml" } else { "docker-compose.yml" }
app := ""

GREEN  := "\\u001b[32m"
RESET  := "\\u001b[0m"
CHECK  := `/usr/bin/printf "\xE2\x9C\x94"`

# Lints Web source code
test: build
    @doppler run -- @docker compose -f {{dockerfile}} run web yarn lint
    @echo -e " {{GREEN}}{{CHECK}} All tests passed! {{CHECK}} {{RESET}}"

# Stops all containers
down:
    @doppler run -- @docker compose -f {{dockerfile}} down

# Builds all images
build:
    @doppler run -- @docker compose -f {{dockerfile}} build
    @echo -e " {{GREEN}}{{CHECK}} Successfully built! {{CHECK}} {{RESET}}"

logone:
    @docker logs {{app}} -f

# Builds all images
buildone:
    @echo -e "Running for {{app}} on {{dockerfile}}"
    git pull
    @doppler run -- @docker compose -f {{dockerfile}} build {{app}}
    @echo -e " {{GREEN}}{{CHECK}} Successfully built! {{CHECK}} {{RESET}}"
    @doppler run -- @docker compose -f {{dockerfile}} up -d {{app}}
    @echo -e " {{GREEN}}{{CHECK}} Successfully ran! {{CHECK}} {{RESET}}"

# Starts images
up:
    @echo "Starting server with database $NODE_ENV at {{dockerfile}}"
    @doppler run -- @docker compose -f {{dockerfile}} up -d

update:
    git pull
    @doppler run -- @docker compose -f {{dockerfile}} build
    @echo -e " {{GREEN}}{{CHECK}} Successfully built! {{CHECK}} {{RESET}}"
    @doppler run -- @docker compose -f {{dockerfile}} up -d

pullall:
    cd ./web && yarn pullpsql && yarn postinstall
    cd ./twitch-eventsub-listener && yarn pullpsql && yarn postinstall
    cd ./twitch-chat-listener && yarn pullpsql && yarn postinstall