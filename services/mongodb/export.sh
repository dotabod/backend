#!/bin/bash

mongoexport --jsonArray --uri "$MONGO_URL" --collection notablePlayers --type json --out ./exported_data.json
