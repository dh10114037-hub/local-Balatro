import type { PersistentProfile, StakeDefinition } from '../types';

export const DEFAULT_STAKE_ID = 'white';

export const STAKES: StakeDefinition[] = [
  {
    id: 'white',
    name: '白注',
    description: '标准难度。目标、奖励和商店价格都保持基础值。',
    targetMultiplier: 1,
    rewardDelta: 0,
    shopPriceDelta: 0
  },
  {
    id: 'red',
    name: '红注',
    description: '目标分提高 15%。',
    targetMultiplier: 1.15,
    rewardDelta: 0,
    shopPriceDelta: 0,
    unlockKey: 'stake_red',
    unlockDescription: '最高到达第 2 层后解锁。'
  },
  {
    id: 'green',
    name: '绿注',
    description: '目标分提高 35%，通关盲注奖励 -$1，商店价格 +$1。',
    targetMultiplier: 1.35,
    rewardDelta: -1,
    shopPriceDelta: 1,
    unlockKey: 'stake_green',
    unlockDescription: '通关 1 次后解锁。'
  },
  {
    id: 'black',
    name: '黑注',
    description: '目标分提高 60%，通关盲注奖励 -$1，商店价格 +$2。',
    targetMultiplier: 1.6,
    rewardDelta: -1,
    shopPriceDelta: 2,
    unlockKey: 'stake_black',
    unlockDescription: '在绿注中到达第 4 层后解锁。'
  }
];

export function getStakeDefinition(stakeId: string): StakeDefinition {
  const definition = STAKES.find((stake) => stake.id === stakeId);

  if (!definition) {
    throw new Error(`找不到难度定义：${stakeId}`);
  }

  return definition;
}

export function isStakeUnlocked(profile: PersistentProfile, stakeId: string): boolean {
  const definition = getStakeDefinition(stakeId);
  return !definition.unlockKey || profile.unlocks.includes(definition.unlockKey);
}
