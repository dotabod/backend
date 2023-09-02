#!/usr/bin/env bash
# Description: Updates notable players from OpenDota API

wget https://api.opendota.com/api/proPlayers -O full.json
mongoimport --jsonArray --uri "$MONGO_URL" --collection notablePlayers --type json --mode upsert --upsertFields=account_id,channel --file "full.json"

rm full.json
