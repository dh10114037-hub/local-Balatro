import { ACHIEVEMENTS, getAchievementTarget } from './config/achievements';
import type { AchievementState, CollectionState, GameSettings, GameState, PersistentProfile, ProfileRunRecord, ProfileStats } from './types';

export const PROFILE_SAVE_VERSION = 4;

const DEFAULT_COLLECTION: CollectionState = {
  seenJokers: [],
  seenConsumables: [],
  seenSpectrals: [],
  seenBosses: [],
  seenVouchers: []
};

const DEFAULT_RUN_RECORD: ProfileRunRecord = {
  highestAnte: 1,
  highestSingleHandScore: 0,
  winCount: 0,
  lossCount: 0,
  runsStarted: 0
};

const DEFAULT_STATS: ProfileStats = {
  ...DEFAULT_RUN_RECORD,
  highestEndlessAnte: 0,
  deckRecords: {},
  stakeRecords: {}
};

const DEFAULT_ACHIEVEMENTS: AchievementState = {
  unlockedIds: [],
  progress: {},
  unlockedAt: {},
  notificationQueue: []
};

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 70,
  animationMode: 'normal',
  animationSpeed: 1,
  showDetailedScoring: true,
  soundEnabled: true,
  fastMode: false,
  tutorialDismissed: []
};

export function createDefaultProfile(): PersistentProfile {
  return {
    saveVersion: PROFILE_SAVE_VERSION,
    collection: { ...DEFAULT_COLLECTION },
    unlocks: [],
    stats: { ...DEFAULT_STATS, deckRecords: {}, stakeRecords: {} },
    settings: { ...DEFAULT_SETTINGS },
    achievements: {
      unlockedIds: [],
      progress: {},
      unlockedAt: {},
      notificationQueue: []
    }
  };
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function addUnique(items: string[], additions: string[]): string[] {
  return unique([...items, ...additions]);
}

function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

const ANIMATION_PRESETS: Record<GameSettings['animationMode'], Pick<GameSettings, 'animationSpeed' | 'fastMode'>> = {
  normal: { animationSpeed: 1, fastMode: false },
  fast: { animationSpeed: 2, fastMode: false },
  instant: { animationSpeed: 3, fastMode: true }
};

function normalizeAnimationMode(settings?: Partial<GameSettings>): GameSettings['animationMode'] {
  if (settings?.animationMode === 'normal' || settings?.animationMode === 'fast' || settings?.animationMode === 'instant') {
    return settings.animationMode;
  }

  if (settings?.fastMode) {
    return 'instant';
  }

  return (settings?.animationSpeed ?? DEFAULT_SETTINGS.animationSpeed) >= 2 ? 'fast' : 'normal';
}

function normalizeSettings(settings?: Partial<GameSettings>): GameSettings {
  const animationMode = normalizeAnimationMode(settings);
  const preset = ANIMATION_PRESETS[animationMode];
  const usePreset = Boolean(settings?.animationMode) || settings?.fastMode === true;

  return {
    volume: Math.max(0, Math.min(100, settings?.volume ?? DEFAULT_SETTINGS.volume)),
    animationMode,
    animationSpeed: Math.max(0.25, Math.min(3, usePreset ? preset.animationSpeed : (settings?.animationSpeed ?? preset.animationSpeed))),
    showDetailedScoring: settings?.showDetailedScoring ?? DEFAULT_SETTINGS.showDetailedScoring,
    soundEnabled: settings?.soundEnabled ?? DEFAULT_SETTINGS.soundEnabled,
    fastMode: usePreset ? preset.fastMode : (settings?.fastMode ?? preset.fastMode),
    tutorialDismissed: unique(settings?.tutorialDismissed ?? DEFAULT_SETTINGS.tutorialDismissed)
  };
}

function normalizeAchievements(achievements?: Partial<AchievementState>): AchievementState {
  const validIds = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));
  const unlockedIds = unique(achievements?.unlockedIds ?? DEFAULT_ACHIEVEMENTS.unlockedIds).filter((id) => validIds.has(id));
  const progress = Object.fromEntries(
    Object.entries(achievements?.progress ?? DEFAULT_ACHIEVEMENTS.progress)
      .filter(([id]) => validIds.has(id))
      .map(([id, value]) => [id, Math.max(0, Math.floor(Number(value) || 0))])
  );
  const unlockedAt = Object.fromEntries(
    Object.entries(achievements?.unlockedAt ?? DEFAULT_ACHIEVEMENTS.unlockedAt).filter(([id, value]) => validIds.has(id) && Boolean(value))
  );
  const notificationQueue = unique(achievements?.notificationQueue ?? DEFAULT_ACHIEVEMENTS.notificationQueue).filter((id) =>
    validIds.has(id)
  );

  return {
    unlockedIds,
    progress,
    unlockedAt,
    notificationQueue
  };
}

function normalizeRunRecord(record?: Partial<ProfileRunRecord>): ProfileRunRecord {
  return {
    highestAnte: Math.max(1, record?.highestAnte ?? DEFAULT_RUN_RECORD.highestAnte),
    highestSingleHandScore: Math.max(0, record?.highestSingleHandScore ?? DEFAULT_RUN_RECORD.highestSingleHandScore),
    winCount: Math.max(0, record?.winCount ?? DEFAULT_RUN_RECORD.winCount),
    lossCount: Math.max(0, record?.lossCount ?? DEFAULT_RUN_RECORD.lossCount),
    runsStarted: Math.max(0, record?.runsStarted ?? DEFAULT_RUN_RECORD.runsStarted)
  };
}

function normalizeRunRecords(records?: Record<string, Partial<ProfileRunRecord>>): Record<string, ProfileRunRecord> {
  return Object.fromEntries(Object.entries(records ?? {}).map(([id, record]) => [id, normalizeRunRecord(record)]));
}

function updateRunRecord(
  records: Record<string, ProfileRunRecord>,
  id: string,
  update: (record: ProfileRunRecord) => ProfileRunRecord
): Record<string, ProfileRunRecord> {
  return {
    ...records,
    [id]: update(records[id] ?? normalizeRunRecord())
  };
}

export function normalizeProfile(parsed?: Partial<PersistentProfile>): PersistentProfile {
  const fallback = createDefaultProfile();

  return refreshProfileUnlocks(
    {
      saveVersion: PROFILE_SAVE_VERSION,
      collection: {
        seenJokers: unique(parsed?.collection?.seenJokers ?? fallback.collection.seenJokers),
        seenConsumables: unique(parsed?.collection?.seenConsumables ?? fallback.collection.seenConsumables),
        seenSpectrals: unique(parsed?.collection?.seenSpectrals ?? fallback.collection.seenSpectrals),
        seenBosses: unique(parsed?.collection?.seenBosses ?? fallback.collection.seenBosses),
        seenVouchers: unique(parsed?.collection?.seenVouchers ?? fallback.collection.seenVouchers)
      },
      unlocks: unique(parsed?.unlocks ?? fallback.unlocks),
      stats: {
        highestAnte: Math.max(1, parsed?.stats?.highestAnte ?? fallback.stats.highestAnte),
        highestSingleHandScore: Math.max(0, parsed?.stats?.highestSingleHandScore ?? fallback.stats.highestSingleHandScore),
        winCount: Math.max(0, parsed?.stats?.winCount ?? fallback.stats.winCount),
        lossCount: Math.max(0, parsed?.stats?.lossCount ?? fallback.stats.lossCount),
        runsStarted: Math.max(0, parsed?.stats?.runsStarted ?? fallback.stats.runsStarted),
        highestEndlessAnte: Math.max(0, parsed?.stats?.highestEndlessAnte ?? fallback.stats.highestEndlessAnte),
        deckRecords: normalizeRunRecords(parsed?.stats?.deckRecords),
        stakeRecords: normalizeRunRecords(parsed?.stats?.stakeRecords)
      },
      settings: normalizeSettings(parsed?.settings),
      achievements: normalizeAchievements(parsed?.achievements)
    },
    { notifyAchievements: false }
  );
}

type AchievementRefreshOptions = {
  notifyAchievements?: boolean;
  now?: string;
};

function withAchievementProgress(profile: PersistentProfile, achievementId: string, rawValue: number, options: AchievementRefreshOptions = {}) {
  const definition = ACHIEVEMENTS.find((achievement) => achievement.id === achievementId);

  if (!definition) {
    return profile;
  }

  const target = getAchievementTarget(definition);
  const value = Math.max(0, Math.min(target, Math.floor(rawValue)));
  const currentValue = profile.achievements.progress[achievementId] ?? 0;
  const progress = value > currentValue ? { ...profile.achievements.progress, [achievementId]: value } : profile.achievements.progress;
  const alreadyUnlocked = profile.achievements.unlockedIds.includes(achievementId);

  if (value < target || alreadyUnlocked) {
    return progress === profile.achievements.progress
      ? profile
      : {
          ...profile,
          achievements: {
            ...profile.achievements,
            progress
          }
        };
  }

  const unlockedIds = unique([...profile.achievements.unlockedIds, achievementId]);
  const notificationQueue =
    options.notifyAchievements === false || profile.achievements.notificationQueue.includes(achievementId)
      ? profile.achievements.notificationQueue
      : [...profile.achievements.notificationQueue, achievementId];

  return {
    ...profile,
    achievements: {
      ...profile.achievements,
      unlockedIds,
      progress,
      unlockedAt: {
        ...profile.achievements.unlockedAt,
        [achievementId]: options.now ?? new Date().toISOString()
      },
      notificationQueue
    }
  };
}

function refreshProfileAchievements(profile: PersistentProfile, options: AchievementRefreshOptions = {}): PersistentProfile {
  const consumableSeenCount = profile.collection.seenConsumables.length;
  const checks: Array<[string, number]> = [
    ['first_run', profile.stats.runsStarted],
    ['reach_ante_2', profile.stats.highestAnte],
    ['reach_ante_3', profile.stats.highestAnte],
    ['reach_ante_5', profile.stats.highestAnte],
    ['reach_ante_8', profile.stats.highestAnte],
    ['win_standard_run', profile.stats.winCount],
    ['endless_ante_9', profile.stats.highestEndlessAnte],
    ['score_100', profile.stats.highestSingleHandScore],
    ['score_1000', profile.stats.highestSingleHandScore],
    ['score_10000', profile.stats.highestSingleHandScore],
    ['score_100000', profile.stats.highestSingleHandScore],
    ['first_joker', profile.collection.seenJokers.length],
    ['first_voucher', profile.collection.seenVouchers.length],
    ['see_10_jokers', profile.collection.seenJokers.length],
    ['see_25_jokers', profile.collection.seenJokers.length],
    ['see_10_consumables', consumableSeenCount],
    ['see_5_spectrals', profile.collection.seenSpectrals.length],
    ['see_10_bosses', profile.collection.seenBosses.length],
    ['see_8_vouchers', profile.collection.seenVouchers.length]
  ];

  return checks.reduce((next, [achievementId, value]) => withAchievementProgress(next, achievementId, value, options), profile);
}

export function refreshProfileUnlocks(profile: PersistentProfile, options: AchievementRefreshOptions = {}): PersistentProfile {
  const unlocks = [...profile.unlocks];

  if (profile.stats.highestAnte >= 2) {
    unlocks.push('stake_red');
  }

  if (profile.stats.winCount >= 1) {
    unlocks.push('stake_green');
  }

  if (profile.stats.highestAnte >= 4 && profile.stats.winCount >= 1) {
    unlocks.push('stake_black');
  }

  if (profile.collection.seenJokers.length >= 10) {
    unlocks.push('collector_jokers');
  }

  return {
    ...refreshProfileAchievements(profile, options),
    unlocks: unique(unlocks)
  };
}

function isClearedBlindTransition(previousState: GameState | null | undefined, state: GameState): boolean {
  return (
    previousState?.phase === 'playing' &&
    (state.phase === 'shop' || state.phase === 'run_won') &&
    Boolean(state.currentBlind)
  );
}

export function recordAchievementsFromState(
  profile: PersistentProfile,
  state: GameState,
  previousState?: GameState | null,
  options: AchievementRefreshOptions = {}
): PersistentProfile {
  let next = refreshProfileAchievements(profile, options);
  const latestScore = Math.max(state.lastScoringLog?.finalScore ?? 0, state.runHighestSingleHandScore);
  const clearedBlind = isClearedBlindTransition(previousState, state);

  const checks: Array<[string, number]> = [
    ['first_blind_clear', state.phase === 'shop' || state.phase === 'run_won' ? 1 : 0],
    ['first_boss_clear', (state.phase === 'shop' || state.phase === 'run_won') && state.currentBlind?.kind === 'boss' ? 1 : 0],
    ['first_hand_played', state.lastScoringLog ? 1 : 0],
    ['score_100', latestScore],
    ['score_1000', latestScore],
    ['score_10000', latestScore],
    ['score_100000', latestScore],
    ['play_pair', state.lastScoringLog?.hand === 'pair' ? 1 : 0],
    ['play_two_pair', state.lastScoringLog?.hand === 'two_pair' ? 1 : 0],
    ['play_flush', state.lastScoringLog?.hand === 'flush' ? 1 : 0],
    ['play_straight', state.lastScoringLog?.hand === 'straight' ? 1 : 0],
    ['play_full_house', state.lastScoringLog?.hand === 'full_house' ? 1 : 0],
    ['play_four_kind', state.lastScoringLog?.hand === 'four_of_a_kind' ? 1 : 0],
    ['first_shop', state.phase === 'shop' ? 1 : 0],
    ['first_joker', state.jokers.length],
    ['first_voucher', state.ownedVouchers.length],
    ['first_reroll', state.shopRefreshCount],
    ['money_25', state.money],
    ['money_50', state.money],
    ['five_jokers', state.jokers.length],
    ['full_consumables', state.consumableSlots > 0 && state.consumables.length >= state.consumableSlots ? 1 : 0],
    [
      'clear_no_discards',
      clearedBlind && previousState && state.discardsRemaining === previousState.discardsRemaining ? 1 : 0
    ],
    ['clear_last_hand', clearedBlind && previousState?.handsRemaining === 1 ? 1 : 0],
    [
      'overkill_double',
      clearedBlind && state.lastScoringLog && state.lastScoringLog.finalScore >= state.targetScore * 2 ? 1 : 0
    ],
    ['first_sell', previousState && previousState.jokers.length > state.jokers.length ? 1 : 0],
    ['open_pack', state.packChoices.length > 0 ? 1 : 0],
    ['open_spectral_pack', state.packChoices.some((choice) => choice.kind === 'spectral') ? 1 : 0]
  ];

  checks.forEach(([achievementId, value]) => {
    next = withAchievementProgress(next, achievementId, value, options);
  });

  return next;
}

export function clearAchievementNotification(profile: PersistentProfile, achievementId?: string): PersistentProfile {
  const notificationQueue = achievementId
    ? profile.achievements.notificationQueue.filter((id) => id !== achievementId)
    : profile.achievements.notificationQueue.slice(1);

  if (notificationQueue.length === profile.achievements.notificationQueue.length) {
    return profile;
  }

  return {
    ...profile,
    achievements: {
      ...profile.achievements,
      notificationQueue
    }
  };
}

export function recordSeenFromState(profile: PersistentProfile, state: GameState): PersistentProfile {
  const seenJokers = [
    ...state.jokers.map((joker) => joker.definitionId),
    ...state.packChoices.filter((choice) => choice.kind === 'joker').map((choice) => choice.definitionId),
    ...state.shopOffers.filter((offer) => offer.kind === 'joker').map((offer) => offer.definitionId ?? '')
  ];
  const seenConsumables = [
    ...state.consumables.map((consumable) => consumable.definitionId),
    ...state.packChoices.filter((choice) => choice.kind === 'consumable').map((choice) => choice.definitionId),
    ...state.shopOffers.filter((offer) => offer.kind === 'consumable').map((offer) => offer.definitionId ?? '')
  ];
  const seenSpectrals = state.packChoices.filter((choice) => choice.kind === 'spectral').map((choice) => choice.definitionId);
  const seenBosses = [state.currentBlind?.bossId ?? '', state.activeBossId ?? ''];
  const seenVouchers = [
    ...state.ownedVouchers,
    ...state.shopOffers.filter((offer) => offer.kind === 'voucher').map((offer) => offer.definitionId ?? '')
  ];

  const collection: CollectionState = {
    seenJokers: addUnique(profile.collection.seenJokers, seenJokers),
    seenConsumables: addUnique(profile.collection.seenConsumables, seenConsumables),
    seenSpectrals: addUnique(profile.collection.seenSpectrals, seenSpectrals),
    seenBosses: addUnique(profile.collection.seenBosses, seenBosses),
    seenVouchers: addUnique(profile.collection.seenVouchers, seenVouchers)
  };

  if (
    sameArray(collection.seenJokers, profile.collection.seenJokers) &&
    sameArray(collection.seenConsumables, profile.collection.seenConsumables) &&
    sameArray(collection.seenSpectrals, profile.collection.seenSpectrals) &&
    sameArray(collection.seenBosses, profile.collection.seenBosses) &&
    sameArray(collection.seenVouchers, profile.collection.seenVouchers)
  ) {
    return refreshProfileUnlocks(profile);
  }

  return refreshProfileUnlocks({
    ...profile,
    collection
  });
}

export function recordStatsFromState(profile: PersistentProfile, state: GameState): PersistentProfile {
  const highestSingleHandScore = Math.max(profile.stats.highestSingleHandScore, state.lastScoringLog?.finalScore ?? 0, state.runHighestSingleHandScore);
  const stats: ProfileStats = {
    ...profile.stats,
    highestAnte: Math.max(profile.stats.highestAnte, state.ante),
    highestEndlessAnte: state.endless ? Math.max(profile.stats.highestEndlessAnte, state.ante) : profile.stats.highestEndlessAnte,
    highestSingleHandScore,
    deckRecords: updateRunRecord(profile.stats.deckRecords, state.deckId, (record) => ({
      ...record,
      highestAnte: Math.max(record.highestAnte, state.ante),
      highestSingleHandScore: Math.max(record.highestSingleHandScore, state.lastScoringLog?.finalScore ?? 0, state.runHighestSingleHandScore)
    })),
    stakeRecords: updateRunRecord(profile.stats.stakeRecords, state.stakeId, (record) => ({
      ...record,
      highestAnte: Math.max(record.highestAnte, state.ante),
      highestSingleHandScore: Math.max(record.highestSingleHandScore, state.lastScoringLog?.finalScore ?? 0, state.runHighestSingleHandScore)
    }))
  };

  if (JSON.stringify(stats) === JSON.stringify(profile.stats)) {
    return refreshProfileUnlocks(profile);
  }

  return refreshProfileUnlocks({
    ...profile,
    stats
  });
}

export function recordRunStarted(profile: PersistentProfile, state?: Pick<GameState, 'deckId' | 'stakeId'>): PersistentProfile {
  const stats: ProfileStats = {
    ...profile.stats,
    runsStarted: profile.stats.runsStarted + 1,
    deckRecords: state
      ? updateRunRecord(profile.stats.deckRecords, state.deckId, (record) => ({
          ...record,
          runsStarted: record.runsStarted + 1
        }))
      : profile.stats.deckRecords,
    stakeRecords: state
      ? updateRunRecord(profile.stats.stakeRecords, state.stakeId, (record) => ({
          ...record,
          runsStarted: record.runsStarted + 1
        }))
      : profile.stats.stakeRecords
  };

  return refreshProfileUnlocks({
    ...profile,
    stats
  });
}

export function recordRunResult(profile: PersistentProfile, won: boolean, state?: Pick<GameState, 'deckId' | 'stakeId'>): PersistentProfile {
  const applyResult = (record: ProfileRunRecord): ProfileRunRecord => ({
    ...record,
    winCount: record.winCount + (won ? 1 : 0),
    lossCount: record.lossCount + (won ? 0 : 1)
  });
  const stats: ProfileStats = {
    ...profile.stats,
    winCount: profile.stats.winCount + (won ? 1 : 0),
    lossCount: profile.stats.lossCount + (won ? 0 : 1),
    deckRecords: state ? updateRunRecord(profile.stats.deckRecords, state.deckId, applyResult) : profile.stats.deckRecords,
    stakeRecords: state ? updateRunRecord(profile.stats.stakeRecords, state.stakeId, applyResult) : profile.stats.stakeRecords
  };

  return refreshProfileUnlocks({
    ...profile,
    stats
  });
}

export function updateProfileSettings(profile: PersistentProfile, settings: Partial<GameSettings>): PersistentProfile {
  const mergedSettings: Partial<GameSettings> = {
    ...profile.settings,
    ...settings
  };

  if (!('animationMode' in settings) && ('animationSpeed' in settings || 'fastMode' in settings)) {
    delete mergedSettings.animationMode;
  }

  return {
    ...profile,
    settings: normalizeSettings(mergedSettings)
  };
}

export function resetPersistentProfile(): PersistentProfile {
  return createDefaultProfile();
}
