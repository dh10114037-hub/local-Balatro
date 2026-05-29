import { createStandardDeck, RANKS, SUITS } from '../deck';
import type { Card, DeckDefinition, Rank, Suit } from '../types';

export const DEFAULT_DECK_ID = 'standard';

export const DECKS: DeckDefinition[] = [
  {
    id: 'standard',
    name: '基础牌组',
    description: '没有额外修正，用来体验最干净的规则节奏。',
    modifiers: {}
  },
  {
    id: 'red',
    name: '红色牌组',
    description: '每个盲注弃牌次数 +1，更容易整理手牌。',
    modifiers: { discardsDelta: 1 }
  },
  {
    id: 'blue',
    name: '蓝色牌组',
    description: '每个盲注出牌次数 +1，容错更高。',
    modifiers: { handsDelta: 1 }
  },
  {
    id: 'yellow',
    name: '黄色牌组',
    description: '开局额外获得 $10，更早开始构筑。',
    modifiers: { startingMoney: 10 }
  },
  {
    id: 'green',
    name: '绿色牌组',
    description: '通过盲注额外获得 $1，适合稳扎稳打。',
    modifiers: { blindRewardBonus: 1 }
  },
  {
    id: 'black',
    name: '黑色牌组',
    description: '小丑槽位 +1，但每个盲注出牌次数 -1。',
    modifiers: { jokerSlotsDelta: 1, handsDelta: -1 }
  },
  {
    id: 'checkered',
    name: '棋盘牌组',
    description: '牌组只由红心和黑桃组成，打同花更稳定。',
    modifiers: {}
  },
  {
    id: 'ghost',
    name: '幽灵牌组',
    description: '消耗牌槽位 +1，并以一张万能增强牌开局。',
    modifiers: { consumableSlotsDelta: 1, startingConsumables: ['tarot_enhance_wild'] }
  },
  {
    id: 'abandoned',
    name: '废弃牌组',
    description: '移除所有 J、Q、K，更容易围绕数字牌改造。',
    modifiers: {}
  }
];

export function getDeckDefinition(deckId: string): DeckDefinition {
  const definition = DECKS.find((deck) => deck.id === deckId);

  if (!definition) {
    throw new Error(`找不到牌组定义：${deckId}`);
  }

  return definition;
}

function createCard(suit: Suit, rank: Rank, suffix = ''): Card {
  return {
    id: `${suit}-${rank}${suffix}`,
    suit,
    rank
  };
}

export function createDeckCards(deckId: string): Card[] {
  if (deckId === 'checkered') {
    const suits: Suit[] = ['hearts', 'spades'];
    return suits.flatMap((suit) =>
      RANKS.flatMap((rank) => [createCard(suit, rank), createCard(suit, rank, '-mirror')])
    );
  }

  if (deckId === 'abandoned') {
    const removedRanks = new Set<Rank>(['J', 'Q', 'K']);
    return SUITS.flatMap((suit) => RANKS.filter((rank) => !removedRanks.has(rank)).map((rank) => createCard(suit, rank)));
  }

  return createStandardDeck();
}
