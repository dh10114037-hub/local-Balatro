import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, getAchievementTarget } from './config/achievements';
import {
  clearAchievementNotification,
  createDefaultProfile,
  normalizeProfile,
  recordAchievementsFromState,
  recordRunStarted,
  recordSeenFromState,
  recordStatsFromState
} from './profile';
import { createInitialGame, playSelectedCards, startCurrentBlind, toggleCardSelection } from './engine';
import type { GameState } from './types';

describe('achievement system', () => {
  it('defines a unique 40 achievement launch set with valid point values', () => {
    expect(ACHIEVEMENTS).toHaveLength(40);
    expect(new Set(ACHIEVEMENTS.map((achievement) => achievement.id)).size).toBe(ACHIEVEMENTS.length);
    ACHIEVEMENTS.forEach((achievement) => {
      expect(achievement.name).not.toBe('');
      expect(achievement.description).not.toBe('');
      expect(achievement.points).toBeGreaterThan(0);
      expect(getAchievementTarget(achievement)).toBeGreaterThan(0);
    });
  });

  it('migrates older profiles into the achievement shape without notification spam', () => {
    const migrated = normalizeProfile({
      stats: {
        highestAnte: 5,
        highestSingleHandScore: 1200,
        winCount: 0,
        lossCount: 1,
        runsStarted: 2,
        highestEndlessAnte: 0,
        deckRecords: {},
        stakeRecords: {}
      },
      collection: {
        seenJokers: Array.from({ length: 10 }, (_, index) => `joker-${index}`),
        seenConsumables: [],
        seenSpectrals: [],
        seenBosses: [],
        seenVouchers: []
      }
    } as unknown as Parameters<typeof normalizeProfile>[0]);

    expect(migrated.achievements.unlockedIds).toContain('first_run');
    expect(migrated.achievements.unlockedIds).toContain('reach_ante_5');
    expect(migrated.achievements.unlockedIds).toContain('score_1000');
    expect(migrated.achievements.notificationQueue).toHaveLength(0);
  });

  it('queues a first-run unlock and allows the UI to clear the notification', () => {
    const started = recordRunStarted(createDefaultProfile(), createInitialGame('achievement-run-start'));

    expect(started.achievements.unlockedIds).toContain('first_run');
    expect(started.achievements.notificationQueue).toEqual(['first_run']);

    const cleared = clearAchievementNotification(started, 'first_run');

    expect(cleared.achievements.notificationQueue).toHaveLength(0);
    expect(cleared.achievements.unlockedIds).toContain('first_run');
  });

  it('unlocks hand, score, shop, and blind-clear achievements from game transitions', () => {
    const started = {
      ...startCurrentBlind(createInitialGame('achievement-blind-clear')),
      hand: [
        { id: 'A-spades', rank: 'A' as const, suit: 'spades' as const, enhancement: 'bonus' as const },
        { id: 'A-hearts', rank: 'A' as const, suit: 'hearts' as const, enhancement: 'bonus' as const }
      ],
      drawPile: [],
      targetScore: 1
    };
    const selected = toggleCardSelection(toggleCardSelection(started, 'A-spades'), 'A-hearts');
    const shop = playSelectedCards(selected);
    const profile = recordAchievementsFromState(createDefaultProfile(), shop, started);

    expect(profile.achievements.unlockedIds).toContain('first_hand_played');
    expect(profile.achievements.unlockedIds).toContain('score_100');
    expect(profile.achievements.unlockedIds).toContain('first_blind_clear');
    expect(profile.achievements.unlockedIds).toContain('first_shop');
  });

  it('unlocks boss, pack, spectral, and collection achievements from state evidence', () => {
    const previous: GameState = {
      ...startCurrentBlind(createInitialGame('achievement-boss')),
      currentBlind: {
        id: 'boss-test',
        kind: 'boss',
        name: '测试首领',
        targetScore: 1,
        reward: 5,
        description: '测试'
      },
      handsRemaining: 1
    };
    const current: GameState = {
      ...previous,
      phase: 'shop',
      targetScore: 100,
      lastScoringLog: {
        hand: 'pair',
        handName: '对子',
        baseChips: 10,
        baseMult: 2,
        scoredCards: [],
        modifiers: [],
        events: [],
        finalChips: 100,
        finalMult: 3,
        finalScore: 300
      },
      packChoices: [
        {
          instanceId: 'spectral-choice',
          packId: 'spectral_pack',
          kind: 'spectral',
          definitionId: 'spectral_glass_rain'
        }
      ],
      shopRefreshCount: 1,
      jokers: [{ instanceId: 'joker-one', definitionId: 'mult_starter', level: 0 }],
      ownedVouchers: ['wide_pockets']
    };
    const seen = recordSeenFromState(recordStatsFromState(createDefaultProfile(), current), current);
    const profile = recordAchievementsFromState(seen, current, previous);

    expect(profile.achievements.unlockedIds).toContain('first_boss_clear');
    expect(profile.achievements.unlockedIds).toContain('clear_last_hand');
    expect(profile.achievements.unlockedIds).toContain('overkill_double');
    expect(profile.achievements.unlockedIds).toContain('open_pack');
    expect(profile.achievements.unlockedIds).toContain('open_spectral_pack');
    expect(profile.achievements.unlockedIds).toContain('first_joker');
    expect(profile.achievements.unlockedIds).toContain('first_voucher');
  });
});
