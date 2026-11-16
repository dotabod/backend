"""Publish release metadata and deploy verified images using the Coolify API."""

import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.request

APPS = {
    'dota': 'i8gccg8',
    'steam': 'wsgwk8s',
    'twitch-chat': 'zwgkg48',
    'twitch-events': 'zwg4g4c',
}


class ReleaseError(Exception):
    pass


def emit(value):
    print(json.dumps(value), flush=True)


def request_json(url, token, method='GET', data=None):
    request = urllib.request.Request(
        url,
        method=method,
        data=json.dumps(data).encode() if data is not None else None,
        headers={
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'dotabod-release/1.0',
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Never emit response bodies, environment values, or application logs.
        raise ReleaseError('Deployment API returned HTTP ' + str(error.code)) from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        raise ReleaseError('Deployment API was unreachable or returned invalid JSON') from None


def validate_manifest(manifest, service, revision):
    if service not in APPS or re.fullmatch('[0-9a-f]{40}', revision or '') is None:
        raise ReleaseError('A known service and full commit SHA are required')
    if not isinstance(manifest, dict) or manifest.get('service') != service or manifest.get('revision') != revision:
        raise ReleaseError('The release manifest does not match the requested service and revision')
    if manifest.get('image') != 'ghcr.io/dotabod/' + service:
        raise ReleaseError('Unexpected image repository in release manifest')
    digest = manifest.get('digest', '')
    if not isinstance(digest, str) or re.fullmatch('sha256:[0-9a-f]{64}', digest) is None:
        raise ReleaseError('A published image digest is required')
    return 'sha256-' + digest.split(':', 1)[1]


def inspect_app(api, service):
    app = api('/applications/' + APPS[service])
    if app.get('uuid') != APPS[service] or app.get('build_pack') != 'dockerimage':
        raise ReleaseError('Unexpected Coolify application or build pack')
    if app.get('docker_registry_image_name') != 'ghcr.io/dotabod/' + service:
        raise ReleaseError('The application image does not match the requested service')
    if (app.get('settings') or {}).get('is_consistent_container_name_enabled') is not True:
        raise ReleaseError('Hard cutover is not configured; overlapping replicas are forbidden')
    return app


def deploy(api, service, manifest, revision, wait=time.sleep):
    tag = validate_manifest(manifest, service, revision)
    app = inspect_app(api, service)
    previous_tag = app.get('docker_registry_image_tag') or ''
    emit({'service': service, 'revision': revision, 'previous_tag': previous_tag, 'image_digest': manifest['digest']})
    path = '/applications/' + APPS[service]
    api(path, 'PATCH', {'docker_registry_image_tag': tag})
    if inspect_app(api, service).get('docker_registry_image_tag') != tag:
        raise ReleaseError('Coolify did not confirm the pinned image digest')
    # Do not retry this mutation: a lost response might already have queued a deployment.
    response = api('/deploy?uuid=' + APPS[service] + '&force=false', 'POST')
    deployments = response.get('deployments') or []
    if len(deployments) != 1 or deployments[0].get('resource_uuid') != APPS[service]:
        raise ReleaseError('Coolify did not return exactly the requested deployment')
    deployment_id = deployments[0].get('deployment_uuid')
    if not isinstance(deployment_id, str) or re.fullmatch('[A-Za-z0-9-]+', deployment_id) is None:
        raise ReleaseError('Coolify returned an invalid deployment identifier')
    previous_status = None
    for _ in range(120):
        status = api('/deployments/' + deployment_id).get('status')
        if status != previous_status:
            emit({'service': service, 'deployment_uuid': deployment_id, 'status': status})
            previous_status = status
        if status == 'finished':
            break
        if status not in ['queued', 'in_progress', 'pending']:
            raise ReleaseError('Coolify deployment failed or returned an unknown status')
        wait(5)
    else:
        raise ReleaseError('Timed out waiting for the Coolify deployment')
    for _ in range(12):
        app = inspect_app(api, service)
        if app.get('docker_registry_image_tag') != tag:
            raise ReleaseError('The configured image changed during deployment')
        if app.get('status') == 'running:healthy':
            result = {'service': service, 'deployment_uuid': deployment_id, 'revision': revision, 'digest': manifest['digest'], 'previous_tag': previous_tag, 'status': app['status']}
            emit(result)
            return result
        wait(5)
    raise ReleaseError('The deployed application did not become healthy')


def prepare(github, mode, services, revision, run_id, selected_service, manual_run_id, automatic):
    if selected_service not in ['all', *APPS]:
        raise ReleaseError('Unknown service')
    if mode == 'inspect':
        return {'services': list(APPS) if selected_service == 'all' else [selected_service], 'revision': '', 'run_id': ''}
    if mode != 'deploy':
        raise ReleaseError('Unknown release mode')
    if automatic:
        if (not isinstance(services, list) or any(service not in APPS for service in services)
                or len(services) != len(set(services))):
            raise ReleaseError('Unknown service in build output')
        if re.fullmatch('[0-9a-f]{40}', revision or '') is None:
            raise ReleaseError('Invalid release revision')
        if github('/git/ref/heads/master')['object']['sha'] != revision:
            return {'services': [], 'revision': revision, 'run_id': run_id}
    else:
        if re.fullmatch('[0-9]+', manual_run_id or '') is None:
            raise ReleaseError('Select a successful master CI run to redeploy or roll back')
        run = github('/actions/runs/' + manual_run_id)
        if (run.get('path') != '.github/workflows/ci.yml' or run.get('event') != 'push'
                or run.get('head_branch') != 'master' or run.get('conclusion') != 'success'):
            raise ReleaseError('Manual releases require a successful master CI run')
        revision, run_id = run['head_sha'], manual_run_id
        comparison = github('/compare/' + revision + '...master')
        if comparison.get('status') not in ['ahead', 'identical']:
            raise ReleaseError('The requested revision is not an ancestor of master')
        artifacts = github('/actions/runs/' + run_id + '/artifacts?per_page=100')['artifacts']
        services = [service for service in APPS if any(
            artifact['name'] == 'coolify-image-' + service and not artifact.get('expired')
            for artifact in artifacts
        ) and selected_service in ['all', service]]
        if not services:
            raise ReleaseError('No retained release manifest exists for the selected service')
    if re.fullmatch('[0-9a-f]{40}', revision or '') is None:
        raise ReleaseError('Invalid release revision')
    return {'services': services, 'revision': revision, 'run_id': run_id}


def main():
    command = sys.argv[1]
    if command == 'manifest':
        service = os.environ['RELEASE_SERVICE']
        metadata = json.loads(os.environ['BAKE_METADATA'])
        manifest = {'service': service, 'image': 'ghcr.io/dotabod/' + service,
                    'revision': os.environ['GITHUB_SHA'], 'digest': metadata[service]['containerimage.digest']}
        validate_manifest(manifest, service, manifest['revision'])
        Path('release').mkdir(exist_ok=True)
        Path('release/' + service + '.json').write_text(json.dumps(manifest) + '\n')
        return
    repository = os.environ['GITHUB_REPOSITORY']
    github = lambda path: request_json('https://api.github.com/repos/' + repository + path, os.environ['GH_TOKEN'])
    if command == 'prepare':
        if os.environ['GITHUB_REF'] != 'refs/heads/master' and os.environ['DEPLOY_MODE'] != 'inspect':
            raise ReleaseError('Production releases must use the workflow on master')
        result = prepare(github, os.environ['DEPLOY_MODE'], json.loads(os.environ['RELEASE_SERVICES']),
                         os.environ['RELEASE_REVISION'], os.environ['RELEASE_RUN_ID'],
                         os.environ['SELECTED_SERVICE'], os.environ['MANUAL_RUN_ID'],
                         os.environ['RELEASE_RUN_ID'] != '')
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            for key, value in result.items():
                output.write(key + '=' + (json.dumps(value) if isinstance(value, list) else str(value)) + '\n')
        return
    service = os.environ['RELEASE_SERVICE']
    host, key = os.environ.get('COOLIFY_HOST', '').rstrip('/'), os.environ.get('COOLIFY_API_KEY', '')
    if not host or not key:
        raise ReleaseError('COOLIFY_HOST and COOLIFY_API_KEY must be configured in the prod environment')
    if not host.startswith(('https://', 'http://')):
        host = 'https://' + host
    base = host.removesuffix('/api/v1') + '/api/v1'
    api = lambda path, method='GET', data=None: request_json(base + path, key, method, data)
    if os.environ['DEPLOY_MODE'] == 'inspect':
        app = inspect_app(api, service)
        emit({'service': service, 'status': app.get('status'), 'image_tag': app.get('docker_registry_image_tag'), 'hard_cutover': True})
        return
    revision = os.environ['RELEASE_REVISION']
    if os.environ['AUTOMATIC_RELEASE'] == 'true' and github('/git/ref/heads/master')['object']['sha'] != revision:
        emit({'service': service, 'skipped': 'Master advanced before deployment'})
        return
    manifest = json.loads(Path('release/' + service + '.json').read_text())
    result = deploy(api, service, manifest, revision)
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
        summary.write('### ' + service + '\n\n' + '\n'.join('- ' + key + ': `' + value + '`' for key, value in result.items()) + '\n')


if __name__ == '__main__':
    try:
        main()
    except (ReleaseError, KeyError, ValueError) as error:
        print('Release failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
