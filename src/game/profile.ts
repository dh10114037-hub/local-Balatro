import type { CollectionState, GameSettings, GameState, PersistentProfile, ProfileRunRecord, ProfileStats } from './types';

export const PROFILE_SAVE_VERSION = 3;

const DEFAULT_COLLECTION: CollectionState = {
  seenJokers: [],
  seenConsumables: [],
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

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 70,
  animationMode: 'normal',
  animationSpeed: 1,
  showDetailedScoring: true,
  soundEnabled: true,
  fastMode: false
};

export function createDefaultProfile(): PersistentProfile {
  return {
    saveVersion: PROFILE_SAVE_VERSION,
    collection: { ...DEFAULT_COLLECTION },
    unlocks: [],
    stats: { ...DEFAULT_STATS, deckRecords: {}, stakeRecords: {} },
    settings: { ...DEFAULT_SETTINGS }
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
    fastMode: usePreset ? preset.fastMode : (settings?.fastMode ?? preset.fastMode)
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

  return refreshProfileUnlocks({
    saveVersion: PROFILE_SAVE_VERSION,
    collection: {
      seenJokers: unique(parsed?.collection?.seenJokers ?? fallback.collection.seenJokers),
      seenConsumables: unique(parsed?.collection?.seenConsumables ?? fallback.collection.seenConsumables),
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
    settings: normalizeSettings(parsed?.settings)
  });
}

export function refreshProfileUnlocks(profile: PersistentProfile): PersistentProfile {
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
    ...profile,
    unlocks: unique(unlocks)
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
  const seenBosses = [state.currentBlind?.bossId ?? '', state.activeBossId ?? ''];
  const seenVouchers = [
    ...state.ownedVouchers,
    ...state.shopOffers.filter((offer) => offer.kind === 'voucher').map((offer) => offer.definitionId ?? '')
  ];

  const collection: CollectionState = {
    seenJokers: addUnique(profile.collection.seenJokers, seenJokers),
    seenConsumables: addUnique(profile.collection.seenConsumables, seenConsumables),
    seenBosses: addUnique(profile.collection.seenBosses, seenBosses),
    seenVouchers: addUnique(profile.collection.seenVouchers, seenVouchers)
  };

  if (
    sameArray(collection.seenJokers, profile.collection.seenJokers) &&
    sameArray(collection.seenConsumables, profile.collection.seenConsumables) &&
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
