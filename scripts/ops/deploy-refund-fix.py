"""One-off release helper; credentials stay inside the hosted Actions runner."""

import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request

APP_ID = 'i8gccg8'
key = os.environ.get('COOLIFY_API_KEY', '')
host = os.environ.get('COOLIFY_HOST', '').rstrip('/')
if not key or not host:
    raise SystemExit('Deployment unavailable: COOLIFY_API_KEY or COOLIFY_HOST is not configured.')
if not host.startswith(('https://', 'http://')):
    host = 'https://' + host
base = host.removesuffix('/api/v1') + '/api/v1'


def api(path, method='GET', data=None):
    request = urllib.request.Request(
        base + path,
        method=method,
        data=json.dumps(data).encode() if data is not None else None,
        headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit('Coolify request failed: ' + method + ' ' + path + ' HTTP ' + str(error.code)) from None
    except urllib.error.URLError:
        raise SystemExit('Coolify host is unreachable from the hosted runner.') from None


app = api('/applications/' + APP_ID)
settings = app.get('settings') or {}
summary = {name: app.get(name) for name in [
    'uuid', 'name', 'build_pack', 'status', 'docker_registry_image_name',
    'docker_registry_image_tag', 'health_check_enabled', 'health_check_path',
]}
summary['deployment_settings'] = {
    name: value for name, value in settings.items()
    if any(word in name for word in ['consistent_container_name', 'rolling', 'replica'])
}
print(json.dumps(summary), flush=True)
if os.environ['DEPLOY_MODE'] == 'inspect':
    raise SystemExit(0)

revision = os.environ['REQUESTED_REVISION']
if re.fullmatch('[0-9a-f]{40}', revision) is None:
    raise SystemExit('A full commit SHA is required.')
master = subprocess.check_output([
    'gh', 'api', 'repos/dotabod/backend/git/ref/heads/master', '--jq', '.object.sha'
], text=True).strip()
if master != revision:
    raise SystemExit('Master advanced; refusing to deploy an unexpected revision.')
if app.get('docker_registry_image_name') != 'ghcr.io/dotabod/dota':
    raise SystemExit('The application image does not match the Dota service.')
if settings.get('is_consistent_container_name_enabled') is not True:
    raise SystemExit('Hard cutover is not confirmed; refusing a potentially overlapping deployment.')

tag = 'sha-' + revision[:7]
api('/applications/' + APP_ID, 'PATCH', {'docker_registry_image_tag': tag})
app = api('/applications/' + APP_ID)
if app.get('docker_registry_image_tag') != tag:
    raise SystemExit('Image tag update was not confirmed.')
result = api('/deploy?uuid=' + APP_ID + '&force=false', 'POST')
deployments = result.get('deployments') or []
if len(deployments) != 1 or deployments[0].get('resource_uuid') != APP_ID:
    raise SystemExit('Coolify did not return exactly the requested deployment.')
deployment_id = deployments[0]['deployment_uuid']
print(json.dumps({'deployment_uuid': deployment_id, 'image_tag': tag}), flush=True)
for _ in range(60):
    deployment = api('/deployments/' + deployment_id)
    status = deployment.get('status')
    print(json.dumps({'deployment_uuid': deployment_id, 'status': status}), flush=True)
    if status == 'finished':
        app = api('/applications/' + APP_ID)
        print(json.dumps({'application_status': app.get('status'), 'image_tag': app.get('docker_registry_image_tag')}), flush=True)
        if not str(app.get('status', '')).startswith('running'):
            raise SystemExit('Deployment finished but the application is not running.')
        break
    if status in ['failed', 'cancelled', 'canceled']:
        raise SystemExit('Coolify deployment did not succeed.')
    time.sleep(5)
else:
    raise SystemExit('Timed out waiting for the deployment.')
