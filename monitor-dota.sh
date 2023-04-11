#!/bin/bash

# * 0-5 * * * /home/ec2-user/dotabod/monitor_dota.sh

# Set the memory limit in bytes (600MB)
MEMORY_LIMIT=$((600 * 1024 * 1024))

# Check for the --dry-run option
DRY_RUN=false
if [ "$1" == "--dry-run" ]; then
  DRY_RUN=true
fi

# Get the container ID of the "dota" container
CONTAINER_ID=$(docker ps --filter "name=dota" --format "{{.ID}}")

# Get the memory usage of the "dota" container
MEMORY_USAGE=$(docker stats --no-stream --format "{{.MemUsage}}" "$CONTAINER_ID" | awk -F '/' '{print $1}' | sed 's/[^0-9]*//g')

# Check if the memory usage exceeds the limit
if [ "$MEMORY_USAGE" -gt "$MEMORY_LIMIT" ]; then
  if [ "$DRY_RUN" = true ]; then
    # Dry run: Print what would be done
    echo "Dry run: Would restart the 'dota' container due to high memory usage."
  else
    # Restart the "dota" container using docker-compose
    docker compose restart dota
  fi
fi
