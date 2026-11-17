#!/usr/bin/env python3
"""Detect generated data updates for either Dotabod consumer without metadata churn."""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = 'https://api.github.com/repos/dotabod/dotaconstants'
SHA_PATTERN = r'[0-9a-f]{40}'


def write_output(name: str, value: str) -> None:
  if output_path := os.getenv('GITHUB_OUTPUT'):
    with open(output_path, 'a', encoding='utf-8') as file:
      file.write(f'{name}={value}\n')


def fetch_json(path: str) -> dict:
  request = urllib.request.Request(API + path, headers={
    'Accept': 'application/vnd.github+json',
    'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'],
    'User-Agent': 'dotabod-constants-updater/1.0',
  })
  with urllib.request.urlopen(request, timeout=30) as response:
    return json.load(response)


def extract_current_sha(manifest_path: Path) -> str:
  manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
  dependency = manifest.get('dependencies', {}).get('dotaconstants', '')
  match = re.fullmatch(r'github:dotabod/dotaconstants#(' + SHA_PATTERN + ')', dependency)
  if not match:
    raise ValueError('dotaconstants must use an exact commit in the Dotabod fork')
  return match.group(1)


def changed_datasets(comparison: dict) -> list[str]:
  if comparison.get('status') == 'behind':
    return []  # Never automatically downgrade a preview/newer pin to old master.
  return sorted({file['filename'] for file in comparison.get('files', []) if (
    file['filename'].startswith('build/') and file['filename'].endswith('.json')
  ) or file['filename'] in ['index.js', 'index.ts']})


def scan(current_sha: str, latest_sha: str, comparison: dict, force: bool = False) -> dict:
  if re.fullmatch(SHA_PATTERN, latest_sha) is None:
    raise ValueError('The target constants commit must be a full SHA')
  files = changed_datasets(comparison)
  should_update = current_sha != latest_sha and (force or bool(files))
  return {'current_sha': current_sha, 'latest_sha': latest_sha,
          'should_update': str(should_update).lower(), 'changed_files': ','.join(files) or 'none'}


def main() -> None:
  current = extract_current_sha(Path(os.environ.get('MANIFEST_PATH', 'packages/dota/package.json')))
  master = fetch_json('/commits/master')['sha']
  latest = os.environ.get('CONSTANTS_SHA') or master
  if re.fullmatch(SHA_PATTERN, latest) is None:
    raise ValueError('CONSTANTS_SHA must be a full commit SHA')
  comparison = fetch_json('/compare/' + current + '...' + latest) if current != latest else {}
  result = scan(current, latest, comparison, os.environ.get('FORCE_UPDATE') == 'true')
  # PRs previewing an unmerged generator commit must remain available for review.
  target_history = fetch_json('/compare/' + latest + '...' + master)
  result['allow_automerge'] = str(target_history.get('status') in ['ahead', 'identical']).lower()
  for key, value in result.items():
    print(f'{key}={value}')
    write_output(key, value)


if __name__ == '__main__':
  try:
    main()
  except (ValueError, KeyError, urllib.error.URLError) as error:
    print(f'Constants update failed: {type(error).__name__}: {error}', file=sys.stderr)
    sys.exit(1)
