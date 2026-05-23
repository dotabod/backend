import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'
import { t } from 'i18next'
import { initTestI18n } from '../../../__tests__/sharedMocks.ts'

// Regression: i18next's default escape function maps `/` → `&#x2F;`. When the
// unresolved-match details ("8822... (Hero, K/D/A, ...)") were piped through
// `{{details}}` the KDA separator was HTML-entity-encoded in Twitch chat, which
// renders the entity literally. The fix is to mark the value as unescaped in
// the locale via i18next's `{{- name}}` syntax.

describe('bets.manualResolution chat rendering', () => {
  beforeAll(async () => {
    await initTestI18n()
  })
  afterAll(async () => {
    await initTestI18n()
  })

  it('does not HTML-encode the KDA forward slashes in the details segment', () => {
    const details = '8822096213 (Dark Seer, 7/3/12, 21-18, 3:43, ~0m ago)'
    const rendered = t('bets.manualResolution', {
      details,
      emote: 'PauseChamp',
      lng: 'en',
    })

    expect(rendered).toContain('7/3/12')
    expect(rendered).not.toContain('&#x2F;')
  })
})

describe('bets.unresolvedReminder chat rendering', () => {
  beforeAll(async () => {
    await initTestI18n()
  })
  afterAll(async () => {
    await initTestI18n()
  })

  it('does not HTML-encode forward slashes in the matchList segment', () => {
    const matchList = '8822096213 (Dark Seer, 7/3/12, 21-18, 41:12, ~12m ago)'
    const rendered = t('bets.unresolvedReminder', {
      count: 1,
      matchList,
      emote: 'PauseChamp',
      lng: 'en',
    })

    expect(rendered).toContain('7/3/12')
    expect(rendered).not.toContain('&#x2F;')
  })
})
