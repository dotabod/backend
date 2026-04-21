#!/usr/bin/env python3
from __future__ import annotations

import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

OWNER = 'dotabod'
REPO = 'dotaconstants'

BUN_LOCK_PATH = Path('bun.lock')
NPM_LOCK_PATH = Path('package-lock.json')

# Only files with direct gameplay / command-facing impact.
# This keeps automation focused and avoids PR noise from unrelated metadata churn.
PATCH_RELEVANT_FILES = [
  'build/heroes.json',
  'build/items.json',
  'build/item_ids.json',
  'build/abilities.json',
  'build/hero_abilities.json',
  'build/aghs_desc.json',
]


def write_output(name: str, value: str) -> None:
  output_path = os.getenv('GITHUB_OUTPUT')
  if not output_path:
    return
  with open(output_path, 'a', encoding='utf-8') as file:
    file.write(f'{name}={value}\n')


def fail(message: str) -> None:
  print(f'error: {message}', file=sys.stderr)
  write_output('should_update', 'false')
  write_output('reason', message)
  sys.exit(1)


def fetch_text(url: str, token: str | None = None) -> str:
  headers = {'Accept': 'application/vnd.github+json'}
  if token:
    headers['Authorization'] = f'Bearer {token}'
  request = urllib.request.Request(url, headers=headers)
  try:
    with urllib.request.urlopen(request, timeout=30) as response:
      return response.read().decode('utf-8')
  except urllib.error.HTTPError as error:
    fail(f'failed to fetch {url}: HTTP {error.code}')
  except urllib.error.URLError as error:
    fail(f'failed to fetch {url}: {error.reason}')
  return ''


def fetch_bytes(url: str) -> bytes:
  request = urllib.request.Request(url)
  with urllib.request.urlopen(request, timeout=30) as response:
    return response.read()


def extract_bun_sha() -> str:
  text = BUN_LOCK_PATH.read_text(encoding='utf-8')
  match = re.search(r'dotaconstants#([0-9a-f]{7,40})', text)
  if not match:
    fail('could not locate dotaconstants SHA in bun.lock')
  return match.group(1)


def extract_npm_sha() -> str:
  text = NPM_LOCK_PATH.read_text(encoding='utf-8')
  match = re.search(r'dotaconstants\.git#([0-9a-f]{40})', text)
  if not match:
    fail('could not locate dotaconstants SHA in package-lock.json')
  return match.group(1)


def get_latest_sha(token: str | None) -> str:
  url = f'https://api.github.com/repos/{OWNER}/{REPO}/commits/master'
  payload = fetch_text(url, token)
  match = re.search(r'"sha"\s*:\s*"([0-9a-f]{40})"', payload)
  if not match:
    fail('could not parse latest dotaconstants SHA from GitHub API response')
  return match.group(1)


def get_changed_patch_relevant_files(current_sha: str, latest_sha: str) -> list[str]:
  changed_files: list[str] = []
  for file_path in PATCH_RELEVANT_FILES:
    current_url = f'https://raw.githubusercontent.com/{OWNER}/{REPO}/{current_sha}/{file_path}'
    latest_url = f'https://raw.githubusercontent.com/{OWNER}/{REPO}/{latest_sha}/{file_path}'
    try:
      current_bytes = fetch_bytes(current_url)
      latest_bytes = fetch_bytes(latest_url)
    except urllib.error.HTTPError as error:
      print(
        f'warning: {file_path} unavailable during comparison ({error.code}); treating as changed',
      )
      changed_files.append(file_path)
      continue
    except urllib.error.URLError as error:
      fail(f'failed to compare {file_path}: {error.reason}')

    if current_bytes != latest_bytes:
      changed_files.append(file_path)

  return changed_files


def update_lockfiles(latest_sha: str) -> None:
  short_sha = latest_sha[:7]

  bun_text = BUN_LOCK_PATH.read_text(encoding='utf-8')
  bun_pattern = re.compile(
    r'("dotaconstants": \["dotaconstants@github:dotabod/dotaconstants#)[0-9a-f]{7,40}'
    r'(", \{\}, "dotabod-dotaconstants-)[0-9a-f]{7,40}("\],)',
  )
  bun_text, bun_replacements = bun_pattern.subn(
    rf'\g<1>{short_sha}\g<2>{short_sha}\g<3>',
    bun_text,
    count=1,
  )
  if bun_replacements != 1:
    fail('expected exactly one dotaconstants entry update in bun.lock')

  npm_text = NPM_LOCK_PATH.read_text(encoding='utf-8')
  npm_pattern = re.compile(
    r'(git\+ssh://git@github\.com/dotabod/dotaconstants\.git#)[0-9a-f]{40}',
  )
  npm_text, npm_replacements = npm_pattern.subn(rf'\g<1>{latest_sha}', npm_text, count=1)
  if npm_replacements != 1:
    fail('expected exactly one dotaconstants resolved entry update in package-lock.json')

  BUN_LOCK_PATH.write_text(bun_text, encoding='utf-8')
  NPM_LOCK_PATH.write_text(npm_text, encoding='utf-8')


def main() -> None:
  token = os.getenv('GITHUB_TOKEN')
  bun_sha = extract_bun_sha()
  npm_sha = extract_npm_sha()

  if not npm_sha.startswith(bun_sha):
    print(
      f'warning: lockfiles currently disagree (bun={bun_sha}, npm={npm_sha}); using bun as baseline',
    )

  current_sha = bun_sha
  latest_sha = get_latest_sha(token)

  print(f'current_sha={current_sha}')
  print(f'latest_sha={latest_sha}')

  write_output('current_sha', current_sha)
  write_output('latest_sha', latest_sha)

  if latest_sha.startswith(current_sha):
    print('dotaconstants is already up to date')
    write_output('should_update', 'false')
    write_output('reason', 'already_up_to_date')
    return

  changed_files = get_changed_patch_relevant_files(current_sha, latest_sha)
  changed_files_output = ','.join(changed_files) if changed_files else 'none'
  write_output('changed_files', changed_files_output)

  if not changed_files:
    print('no patch-relevant files changed; skipping lockfile bump')
    write_output('should_update', 'false')
    write_output('reason', 'no_patch_relevant_changes')
    return

  print(f'patch-relevant updates detected: {changed_files_output}')
  update_lockfiles(latest_sha)
  write_output('should_update', 'true')
  write_output('reason', 'patch_relevant_changes')


if __name__ == '__main__':
  main()
