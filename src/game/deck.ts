import type { Card, CardEnhancement, Rank, Suit } from './types';
import type { Rng } from './random';
import { shuffleWithRng } from './random';

export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

export const SUIT_LABELS: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣'
};

export const SUIT_NAMES: Record<Suit, string> = {
  spades: '黑桃',
  hearts: '红心',
  diamonds: '方块',
  clubs: '梅花'
};

export const ENHANCEMENT_SHORT_LABELS: Record<CardEnhancement, string> = {
  bonus: '奖',
  mult: '倍',
  wild: '万',
  glass: '玻',
  steel: '钢',
  gold: '金',
  stone: '石'
};

export const RANK_VALUES: Record<Rank, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  '10': 10,
  '9': 9,
  '8': 8,
  '7': 7,
  '6': 6,
  '5': 5,
  '4': 4,
  '3': 3,
  '2': 2
};

export function createStandardDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({
      id: `${suit}-${rank}`,
      suit,
      rank
    }))
  );
}

export function createShuffledDeck(rng: Rng): Card[] {
  return shuffleWithRng(createStandardDeck(), rng);
}

export function shuffleDeck(deck: Card[], rng: Rng): Card[] {
  return shuffleWithRng(deck, rng);
}

export function drawCards(drawPile: Card[], count: number): { drawn: Card[]; remaining: Card[] } {
  return {
    drawn: drawPile.slice(0, count),
    remaining: drawPile.slice(count)
  };
}

export function getCardChips(card: Card): number {
  if (card.enhancement === 'stone') {
    return 50;
  }

  if (card.rank === 'A') {
    return 11;
  }

  if (card.rank === 'K' || card.rank === 'Q' || card.rank === 'J') {
    return 10;
  }

  return Number(card.rank);
}

export function formatCard(card: Card): string {
  return `${card.rank}${SUIT_LABELS[card.suit]}`;
}
