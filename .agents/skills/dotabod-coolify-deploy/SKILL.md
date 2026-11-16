---
name: dotabod-coolify-deploy
description: Deploy, inspect, verify, retry, or roll back Dotabod backend services on Coolify through GitHub Actions. Use for backend releases and CI/CD deployment failures; frontend production uses Cloudflare and is outside this skill.
---

# Dotabod backend deployment

The executable source of truth is `.github/workflows/ci.yml`,
`.github/workflows/builder.yml`, `.github/workflows/deploy.yml`, and
`scripts/deploy/coolify.py`. Prefer those workflows over temporary CI replacements,
SSH, or local builds. Follow the user's existing authorization; do not ask again
for an already-authorized release.

## Automatic release

A push to master runs quality checks, tests, and all package builds first. CI then
calls the image builder for changed services. Each published image gets a
`coolify-image-<service>` artifact containing its full commit SHA, repository, and
image digest. Only those services are deployed, using the digest rather than a
mutable branch tag. Feature branch builds never deploy to production.

CI and release concurrency must never cancel a running master cutover. Old queued
automatic releases skip deployment if master has advanced. A manual rollback
deliberately permits an older successful master release.

Watch the master CI run, including its deployment jobs:

```sh
gh run list --repo dotabod/backend --workflow ci.yml --branch master --limit 5
gh run watch <run-id> --repo dotabod/backend --exit-status
```

Do not report production deployed based only on GHCR publication or a successful
HTTP response from the deployment trigger. Require the returned deployment UUID
to reach `finished`, the app's configured digest to match, and Coolify to report
`running:healthy`. Job summaries record the revision, digest, deployment UUID,
previous image setting, and final status. Coolify's status is a platform signal;
when an app has no configured health check, it does not prove every user journey.

## Inspect without redeploying

```sh
gh workflow run deploy.yml --repo dotabod/backend --ref master \
  -f mode=inspect -f service=all
```

The service choices are `all`, `dota`, `steam`, `twitch-chat`, and `twitch-events`.

| Service | Production app UUID |
| --- | --- |
| dota | i8gccg8 |
| steam | wsgwk8s |
| twitch-chat | zwgkg48 |
| twitch-events | zwg4g4c |

Each app must use `build_pack=dockerimage`, the corresponding
`ghcr.io/dotabod/<service>` repository, and
`settings.is_consistent_container_name_enabled=true`. This forces a hard cutover.
These services are stateful singletons: never enable rolling overlap or a second
replica. The helper fails rather than silently changing these settings.

## Retry or roll back

For a failed automatic deployment, inspect the failed job and its previous-image
record. Fix the cause, then rerun failed jobs if the release is still current:

```sh
gh run rerun <run-id> --repo dotabod/backend --failed
```

To redeploy or roll back one service, choose a **successful master CI run that
built that service** and still has its release artifact:

```sh
gh workflow run deploy.yml --repo dotabod/backend --ref master \
  -f mode=deploy -f service=dota -f ci_run_id=<successful-master-ci-run-id>
```

The workflow checks that the run was push-triggered master CI, succeeded, and
belongs to master's history. It rejects expired or missing manifests. Old CI runs
from before release manifests were introduced cannot use this command. For an
older emergency rollback, use a previously recorded, trusted registry digest in
Coolify's image tag/hash field as `sha256-<64 hex characters>` and redeploy through
the authorized operator session. Never guess a digest or disable provenance checks
to make the workflow accept a different image.

Failures stop the release and keep diagnostic output bounded. They do not
automatically roll back. Matrix jobs are serialized; inspect which services
finished before retrying a partial release. If a trigger response is lost, inspect
Coolify before triggering another deployment; the helper never retries that POST.

## API and credentials

The `prod` GitHub environment supplies `COOLIFY_HOST` and `COOLIFY_API_KEY`.
Credentials stay on GitHub-hosted runners; never print or copy them into a local
file, skill, issue, or PR. The token needs application read/update, deploy, and
deployment-status access.

The proven API sequence is:

1. `GET /api/v1/applications/<uuid>` and check the app and hard-cutover settings.
2. `PATCH /api/v1/applications/<uuid>` with the desired `docker_registry_image_tag`
   in Coolify's `sha256-<digest>` format; read it back to confirm.
3. `POST /api/v1/deploy?uuid=<uuid>&force=false` and retain the returned deployment UUID.
4. Poll `GET /api/v1/deployments/<deployment-uuid>`, then read the application again.

Send `Authorization: Bearer ...`, `Accept: application/json`, JSON content type,
and an explicit User-Agent. During the first verified deployment on 2026-11-16,
an initial urllib request returned 403; a retry with Accept and User-Agent headers
worked using the same credentials. A single 403 is not proof the token is invalid.
Inspect bounded status diagnostics before replacing credentials, and never dump
application logs or response bodies that might contain user tokens.

The old `registry_package` release workflow only printed messages because its
deploy request was commented out. Do not restore it: registry events alone do not
establish that the image passed CI or identify a complete release.
