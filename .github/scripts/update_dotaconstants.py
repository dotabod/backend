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

PNPM_LOCK_PATH = Path('pnpm-lock.yaml')

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


def extract_current_sha() -> str:
  text = PNPM_LOCK_PATH.read_text(encoding='utf-8')
  match = re.search(
    r'codeload\.github\.com/dotabod/dotaconstants/tar\.gz/([0-9a-f]{40})',
    text,
  )
  if not match:
    fail('could not locate dotaconstants SHA in pnpm-lock.yaml')
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


def update_lockfile(current_sha: str, latest_sha: str) -> None:
  text = PNPM_LOCK_PATH.read_text(encoding='utf-8')
  # pnpm lockfile references the git-hosted tarball with the full SHA in
  # multiple places (specifier line, package key, resolution block). Replace
  # every occurrence atomically.
  updated_text = text.replace(current_sha, latest_sha)
  occurrences = text.count(current_sha)
  if occurrences == 0:
    fail('no dotaconstants SHA occurrences found in pnpm-lock.yaml')
  if updated_text == text:
    fail('SHA replacement produced no changes')
  PNPM_LOCK_PATH.write_text(updated_text, encoding='utf-8')
  print(f'replaced {occurrences} occurrence(s) of {current_sha[:7]} → {latest_sha[:7]}')


def main() -> None:
  token = os.getenv('GITHUB_TOKEN')
  current_sha = extract_current_sha()
  latest_sha = get_latest_sha(token)

  print(f'current_sha={current_sha}')
  print(f'latest_sha={latest_sha}')

  write_output('current_sha', current_sha)
  write_output('latest_sha', latest_sha)

  if latest_sha == current_sha:
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
  update_lockfile(current_sha, latest_sha)
  write_output('should_update', 'true')
  write_output('reason', 'patch_relevant_changes')


if __name__ == '__main__':
  main()
