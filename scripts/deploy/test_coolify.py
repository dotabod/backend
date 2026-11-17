import unittest
from unittest.mock import patch

from coolify import APPS, ReleaseError, deploy, inspect_app, prepare, validate_manifest

REVISION = 'a' * 40
DIGEST = 'sha256:' + 'b' * 64
TAG = 'sha256-' + 'b' * 64


def manifest(**overrides):
    return {'service': 'dota', 'revision': REVISION, 'image': 'ghcr.io/dotabod/dota',
            'digest': DIGEST, **overrides}


class CoolifyFake:
    def __init__(self, statuses=None, **overrides):
        self.app = {'uuid': APPS['dota'], 'build_pack': 'dockerimage',
                    'docker_registry_image_name': 'ghcr.io/dotabod/dota',
                    'docker_registry_image_tag': 'old-image', 'status': 'running:healthy',
                    'settings': {'is_consistent_container_name_enabled': True}, **overrides}
        self.statuses = list(statuses or ['queued', 'in_progress', 'finished'])
        self.calls = []
        self.confirm_pin = True
        self.resource_uuid = APPS['dota']
        self.deployment_finished = False
        self.health_states = []

    def __call__(self, path, method='GET', data=None):
        self.calls.append((method, path, data))
        if method == 'PATCH':
            if self.confirm_pin:
                self.app.update(data)
            return {'uuid': APPS['dota']}
        if method == 'POST':
            return {'deployments': [{'resource_uuid': self.resource_uuid, 'deployment_uuid': 'deploy-1'}]}
        if path.startswith('/deployments/'):
            status = self.statuses[0]
            if len(self.statuses) > 1:
                self.statuses.pop(0)
            self.deployment_finished = status == 'finished'
            return {'status': status}
        if self.deployment_finished and self.health_states:
            return {**self.app, 'status': self.health_states.pop(0)}
        return self.app.copy()

    def mutations(self):
        return [call for call in self.calls if call[0] != 'GET']


class CoolifyReleaseTests(unittest.TestCase):
    def setUp(self):
        self.output = patch('coolify.emit').start()
        self.addCleanup(patch.stopall)

    def test_release_pins_digest_and_waits_for_healthy_completion(self):
        api = CoolifyFake()
        waits = []
        result = deploy(api, 'dota', manifest(), REVISION, wait=waits.append)
        self.assertEqual(api.mutations(), [
            ('PATCH', '/applications/i8gccg8', {'docker_registry_image_tag': TAG}),
            ('POST', '/deploy?uuid=i8gccg8&force=false', None),
        ])
        self.assertEqual(result['digest'], DIGEST)
        self.assertEqual(result['previous_tag'], 'old-image')
        self.assertEqual(result['status'], 'running:healthy')
        self.assertEqual(waits, [5, 5])

    def test_invalid_release_manifests_never_reach_the_application(self):
        for bad in [manifest(service='steam'), manifest(revision='c' * 40),
                    manifest(image='ghcr.io/other/dota'), manifest(digest=None),
                    manifest(digest='sha256:short'), []]:
            with self.subTest(manifest=bad):
                api = CoolifyFake()
                with self.assertRaises(ReleaseError):
                    deploy(api, 'dota', bad, REVISION)
                self.assertEqual(api.calls, [])

    def test_unsafe_application_configuration_never_mutates_production(self):
        for override in [
            {'settings': {'is_consistent_container_name_enabled': False}},
            {'settings': {}}, {'uuid': 'different-app'}, {'build_pack': 'dockercompose'},
            {'docker_registry_image_name': 'ghcr.io/dotabod/steam'},
        ]:
            with self.subTest(override=override):
                api = CoolifyFake(**override)
                with self.assertRaises(ReleaseError):
                    deploy(api, 'dota', manifest(), REVISION)
                self.assertEqual(api.mutations(), [])

    def test_inspection_is_read_only(self):
        api = CoolifyFake()
        self.assertEqual(inspect_app(api, 'dota')['status'], 'running:healthy')
        self.assertEqual(api.mutations(), [])

    def test_pin_must_be_confirmed_before_queuing_deployment(self):
        api = CoolifyFake()
        api.confirm_pin = False
        with self.assertRaisesRegex(ReleaseError, 'confirm'):
            deploy(api, 'dota', manifest(), REVISION)
        self.assertEqual([call[0] for call in api.mutations()], ['PATCH'])

    def test_failure_cancel_and_unknown_status_do_not_report_success(self):
        for status in ['failed', 'cancelled', 'canceled', 'unknown']:
            with self.subTest(status=status):
                api = CoolifyFake(statuses=[status])
                with self.assertRaises(ReleaseError):
                    deploy(api, 'dota', manifest(), REVISION, wait=lambda _: None)
                self.assertEqual(len([c for c in api.calls if c[0] == 'POST']), 1)

    def test_deployment_timeout_is_bounded_and_does_not_requeue(self):
        api = CoolifyFake(statuses=['in_progress'])
        waits = []
        with self.assertRaisesRegex(ReleaseError, 'Timed out'):
            deploy(api, 'dota', manifest(), REVISION, wait=waits.append)
        self.assertEqual(len(waits), 120)
        self.assertEqual(len([c for c in api.calls if c[0] == 'POST']), 1)

    def test_finished_but_unhealthy_is_a_release_failure(self):
        api = CoolifyFake(statuses=['finished'], status='running:unhealthy')
        with self.assertRaisesRegex(ReleaseError, 'healthy'):
            deploy(api, 'dota', manifest(), REVISION, wait=lambda _: None)

    def test_waits_through_docker_startup_grace_without_redeploying(self):
        api = CoolifyFake(statuses=['finished'])
        api.health_states = ['running:starting'] * 30 + ['running:healthy']
        waits = []

        result = deploy(api, 'dota', manifest(), REVISION, wait=waits.append)

        self.assertEqual(result['status'], 'running:healthy')
        self.assertEqual(waits, [5] * 30)
        self.assertEqual(len([call for call in api.calls if call[0] == 'POST']), 1)

    def test_health_timeout_remains_bounded_without_redeploying(self):
        api = CoolifyFake(statuses=['finished'], status='running:unhealthy')
        waits = []

        with self.assertRaisesRegex(ReleaseError, 'healthy'):
            deploy(api, 'dota', manifest(), REVISION, wait=waits.append)

        self.assertEqual(waits, [5] * 60)
        self.assertEqual(len([call for call in api.calls if call[0] == 'POST']), 1)

    def test_different_returned_resource_is_a_release_failure(self):
        api = CoolifyFake()
        api.resource_uuid = 'another-app'
        with self.assertRaisesRegex(ReleaseError, 'exactly'):
            deploy(api, 'dota', manifest(), REVISION)

    def test_valid_manifest_uses_coolify_digest_format(self):
        self.assertEqual(validate_manifest(manifest(), 'dota', REVISION), TAG)


class ReleaseSelectionTests(unittest.TestCase):
    def setUp(self):
        self.run = {'path': '.github/workflows/ci.yml', 'event': 'push', 'head_branch': 'master',
                    'conclusion': 'success', 'head_sha': REVISION}
        self.comparison = 'ahead'
        self.artifacts = [
            {'name': 'coolify-image-dota', 'expired': False},
            {'name': 'coolify-image-steam', 'expired': True},
            {'name': 'unrelated-artifact', 'expired': False},
        ]

    def github(self, path):
        if path == '/git/ref/heads/master':
            return {'object': {'sha': REVISION}}
        if path.startswith('/compare/'):
            return {'status': self.comparison}
        if path.endswith('/artifacts?per_page=100'):
            return {'artifacts': self.artifacts}
        return self.run

    def select(self, **overrides):
        args = {'mode': 'deploy', 'services': [], 'revision': '', 'run_id': '',
                'selected_service': 'all', 'manual_run_id': '123', 'automatic': False, **overrides}
        return prepare(self.github, **args)

    def test_automatic_release_uses_only_changed_services(self):
        result = self.select(automatic=True, services=['dota'], revision=REVISION, run_id='123')
        self.assertEqual(result, {'services': ['dota'], 'revision': REVISION, 'run_id': '123'})

    def test_outdated_automatic_release_is_skipped(self):
        result = self.select(automatic=True, services=['dota'], revision='c' * 40, run_id='123')
        self.assertEqual(result['services'], [])

    def test_unknown_or_duplicate_services_are_rejected(self):
        for services in [['other'], ['dota', 'dota']]:
            with self.assertRaises(ReleaseError):
                self.select(automatic=True, services=services, revision=REVISION)

    def test_inspect_does_not_require_a_previous_release(self):
        self.assertEqual(self.select(mode='inspect', selected_service='steam', manual_run_id='')['services'], ['steam'])

    def test_manual_release_downloads_only_retained_known_manifests(self):
        self.assertEqual(self.select()['services'], ['dota'])

    def test_manual_release_requires_successful_master_push_ci(self):
        for field, value in [('path', '.github/workflows/builder.yml'), ('event', 'pull_request'),
                             ('head_branch', 'feature'), ('conclusion', 'failure')]:
            with self.subTest(field=field):
                saved = self.run[field]
                self.run[field] = value
                with self.assertRaises(ReleaseError):
                    self.select()
                self.run[field] = saved

    def test_manual_release_requires_master_ancestry(self):
        self.comparison = 'diverged'
        with self.assertRaises(ReleaseError):
            self.select()

    def test_expired_or_missing_selected_image_is_rejected(self):
        with self.assertRaises(ReleaseError):
            self.select(selected_service='steam')

    def test_manual_release_requires_explicit_run(self):
        with self.assertRaises(ReleaseError):
            self.select(manual_run_id='')
