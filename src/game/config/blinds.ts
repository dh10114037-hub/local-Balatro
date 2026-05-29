import type { BlindDefinition, BlindKind } from '../types';
import { getBossForAnte } from './bosses';

export const MAX_ANTE = 8;
export const BLIND_SEQUENCE: BlindKind[] = ['small', 'big', 'boss'];

const BLIND_META: Record<BlindKind, { name: string; reward: number; description: string }> = {
  small: {
    name: '小盲',
    reward: 3,
    description: '本轮的低压目标，用来热身和赚第一笔钱。'
  },
  big: {
    name: '大盲',
    reward: 4,
    description: '目标更高，需要更认真地组织牌型。'
  },
  boss: {
    name: '首领盲注',
    reward: 5,
    description: '当前层级的收尾战。首领特殊规则会迫使你临时调整打法。'
  }
};

export function getBlindKind(blindIndex: number): BlindKind {
  return BLIND_SEQUENCE[blindIndex] ?? 'small';
}

export function getBlindDefinition(ante: number, blindIndex: number, seed = '默认首领种子'): BlindDefinition {
  const kind = getBlindKind(blindIndex);
  const meta = BLIND_META[kind];
  const baseTarget = kind === 'small' ? 120 + ante * 15 : kind === 'big' ? 180 + ante * 20 : 240 + ante * 25;
  const endlessMultiplier = ante <= MAX_ANTE ? 1 : Math.pow(1.35, ante - MAX_ANTE);
  const targetScore = Math.floor(baseTarget * endlessMultiplier);
  const boss = kind === 'boss' ? getBossForAnte(seed, ante) : null;

  return {
    id: `ante-${ante}-${kind}`,
    kind,
    name: meta.name,
    targetScore,
    reward: meta.reward,
    description: meta.description,
    bossId: boss?.id
  };
}

export function getAnteBlinds(ante: number, seed?: string): BlindDefinition[] {
  return BLIND_SEQUENCE.map((_, index) => getBlindDefinition(ante, index, seed));
}
