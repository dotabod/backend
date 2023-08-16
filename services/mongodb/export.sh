#!/bin/bash

echo "Exporting data from MongoDB to exported_data.json"
echo "$NODE_ENV"

mongoexport --jsonArray --uri "$MONGO_URL" --collection notablePlayers --type json --out ./exported_data.json
