# Lists Recipes
default:
  @just --list

df := ""
dockerfile := if df == "" {
    "docker-compose.yml"
} else {
    "docker-compose-"+ df + ".yml"
}

GREEN  := "\\u001b[32m"
RESET  := "\\u001b[0m"
CHECK  := `/usr/bin/printf "\xE2\x9C\x94"`

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
    git pull
    @docker compose -f {{dockerfile}} build {{app}}
    @echo -e " {{GREEN}}{{CHECK}} Successfully built! {{CHECK}} {{RESET}}"
    @docker compose -f {{dockerfile}} up -d {{app}}
    @echo -e " {{GREEN}}{{CHECK}} Successfully ran! {{CHECK}} {{RESET}}"

# Starts images
up:
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