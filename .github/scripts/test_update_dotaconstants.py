import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('updater', Path(__file__).with_name('update_dotaconstants.py'))
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)
CURRENT = 'a' * 40
LATEST = 'b' * 40


class ConstantsUpdateTests(unittest.TestCase):
  def test_all_generated_datasets_and_exports_trigger_updates(self):
    for name in ['heroes', 'abilities', 'cosmetics', 'neutral_abilities', 'patchnotes', 'region', 'future_dataset']:
      with self.subTest(dataset=name):
        result = updater.scan(CURRENT, LATEST, {'files': [{'filename': f'build/{name}.json'}]})
        self.assertEqual(result['should_update'], 'true')
    self.assertEqual(updater.scan(CURRENT, LATEST, {'files': [{'filename': 'index.js'}]})['should_update'], 'true')

  def test_source_tracker_and_generator_only_changes_do_not_churn_consumers(self):
    result = updater.scan(CURRENT, LATEST, {'files': [
      {'filename': 'd2vpkr_commit'}, {'filename': 'version'}, {'filename': 'package.json'},
      {'filename': 'tasks/updateconstants.ts'},
    ]})
    self.assertEqual(result['should_update'], 'false')

  def test_manual_force_can_refresh_to_latest_commit_without_data_changes(self):
    self.assertEqual(updater.scan(CURRENT, LATEST, {}, True)['should_update'], 'true')

  def test_identical_pin_never_creates_an_update(self):
    self.assertEqual(updater.scan(CURRENT, CURRENT, {}, True)['should_update'], 'false')

  def test_scheduled_updates_do_not_downgrade_a_newer_pin(self):
    result = updater.scan(CURRENT, LATEST, {'status': 'behind', 'files': [{'filename': 'build/heroes.json'}]})
    self.assertEqual(result['should_update'], 'false')

  def test_rejects_floating_target_references(self):
    with self.assertRaises(ValueError):
      updater.scan(CURRENT, 'master', {})

  def test_reads_backend_and_frontend_exact_manifest_pins(self):
    with tempfile.TemporaryDirectory() as directory:
      for name in ['package.json', 'packages/dota/package.json']:
        path = Path(directory, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({'dependencies': {'dotaconstants': 'github:dotabod/dotaconstants#' + CURRENT}}))
        self.assertEqual(updater.extract_current_sha(path), CURRENT)

  def test_rejects_unsupported_dependency_sources(self):
    with tempfile.TemporaryDirectory() as directory:
      path = Path(directory, 'package.json')
      path.write_text(json.dumps({'dependencies': {'dotaconstants': '^10.8.0'}}))
      with self.assertRaises(ValueError):
        updater.extract_current_sha(path)
