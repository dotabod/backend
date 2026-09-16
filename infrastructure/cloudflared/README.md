# Cloudflare tunnel connector

This Compose file prepares a Cloudflare tunnel connector on the external `coolify` network. It is inactive until an operator explicitly starts it. It does not publish host ports or change the existing Dota deployment.

The image is pinned to the `2026.9.1` multi-architecture manifest. CI verifies that the manifest contains Linux ARM64, that the image reports the expected version, and that its `tunnel run` command accepts `--token-file`.

## Secret file

The tunnel token must remain in a file. Do not put it in Compose, an environment variable, or a command argument. The image runs as UID and GID `65532`, while Docker Compose file secrets retain their source file permissions. Prepare the source file for that group:

```sh
sudo install -d -o root -g 65532 -m 0750 /etc/dotabod/cloudflared
sudo install -o root -g 65532 -m 0440 /dev/null /etc/dotabod/cloudflared/tunnel-token
# Populate the file with approved secret-management tooling; do not pass the token on a command line.
export CLOUDFLARE_TUNNEL_TOKEN_FILE=/etc/dotabod/cloudflared/tunnel-token
docker compose -f infrastructure/cloudflared/compose.yml config --quiet
```

The environment variable contains only the file path. The token stays out of container metadata.

## Migration

The tunnel is remotely managed. Its origin setting is shared by every connector, so the host and bridge connectors may overlap only while both can reach the same origin. Dota must remain at one replica throughout this procedure.

1. Record the current connector version, service configuration, Dota image digest, and tunnel origin. Keep host port 5120 published through the migration and bake period.
2. Measure the existing host connector upgrade separately. Upgrade it while the origin remains `http://127.0.0.1:5120`, compare normalized CPU and error rates, and roll back the binary if its behavior regresses. Do not start the bridge connector during this measurement.
3. Freeze Dota deployments. Resolve the current Dota container IP on the `coolify` network and confirm the host can reach its port 5120:

   ```sh
   sudo docker inspect --format '{{with index .NetworkSettings.Networks "coolify"}}{{.IPAddress}}{{end}}' i8gccg8
   ```

4. Change the remote origin to that direct IP. Verify GSI requests, HTTP errors, Socket.IO upgrades and reconnects, overlay behavior, and tunnel errors. Compare connector-plus-forwarder CPU at a similar request and byte rate. Restore localhost if the direct-IP trial fails or the saving is not worthwhile.
5. With the direct-IP origin still active, start this connector:

   ```sh
   export CLOUDFLARE_TUNNEL_TOKEN_FILE=/etc/dotabod/cloudflared/tunnel-token
   docker compose -f infrastructure/cloudflared/compose.yml up -d
   ```

6. Confirm both connectors are healthy and both reach the shared direct-IP origin. After the bridge connector is serving traffic, stop and disable the host connector.
7. Change the remote origin to `http://i8gccg8:5120`. Confirm the bridge connector resolves the Dota alias and traffic remains healthy, then unfreeze deployments.
8. During an authorized hard-cutover Dota redeploy, prove the alias continues to resolve and GSI and Socket.IO traffic recover normally. Keep host port 5120 published until the rollback window closes. Removing that mapping is a later application deployment.

Expected savings are limited to the measured forwarding cost: about 0.08 of one CPU core at the observed traffic rate. The connector's separate CPU use remains and must be measured independently.

## Rollback

The bridge connector cannot use a localhost origin. Roll back in this order:

1. Freeze Dota deployments and resolve its current direct container IP.
2. Change the remote origin from the Docker alias to that direct IP.
3. Start the host connector and verify that both connectors reach the shared origin.
4. Stop the bridge connector with `CLOUDFLARE_TUNNEL_TOKEN_FILE=/etc/dotabod/cloudflared/tunnel-token docker compose -f infrastructure/cloudflared/compose.yml down`.
5. Restore the remote origin to `http://127.0.0.1:5120` and verify the host connector alone.

Do not restore localhost while the bridge connector is receiving traffic. Do not remove the host port mapping until the migration has passed its bake and rollback window.
