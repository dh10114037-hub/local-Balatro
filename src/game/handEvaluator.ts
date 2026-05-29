import { HAND_SCORES } from './config/handScores';
import { RANK_VALUES } from './deck';
import type { Card, HandEvaluation, PokerHand, Rank } from './types';

type RankGroup = {
  rank: Rank;
  value: number;
  cards: Card[];
};

function getGroups(cards: Card[]): RankGroup[] {
  const groups = new Map<Rank, Card[]>();

  cards.forEach((card) => {
    groups.set(card.rank, [...(groups.get(card.rank) ?? []), card]);
  });

  return [...groups.entries()]
    .map(([rank, groupCards]) => ({
      rank,
      value: RANK_VALUES[rank],
      cards: groupCards
    }))
    .sort((left, right) => {
      if (right.cards.length !== left.cards.length) {
        return right.cards.length - left.cards.length;
      }

      return right.value - left.value;
    });
}

function isFlush(cards: Card[]): boolean {
  if (cards.length !== 5) {
    return false;
  }

  const suitedCards = cards.filter((card) => card.enhancement !== 'wild');

  if (suitedCards.length === 0) {
    return true;
  }

  return suitedCards.every((card) => card.suit === suitedCards[0].suit);
}

function getStraightHighValue(cards: Card[]): number | null {
  if (cards.length !== 5) {
    return null;
  }

  const values = [...new Set(cards.map((card) => RANK_VALUES[card.rank]))].sort((left, right) => left - right);

  if (values.length !== 5) {
    return null;
  }

  const isWheel = values.join(',') === '2,3,4,5,14';

  if (isWheel) {
    return 5;
  }

  const isSequential = values.every((value, index) => index === 0 || value === values[index - 1] + 1);

  return isSequential ? values[4] : null;
}

function selectCardsByRanks(cards: Card[], ranks: Rank[]): Card[] {
  const rankSet = new Set(ranks);
  return cards.filter((card) => rankSet.has(card.rank));
}

function evaluateWith(cards: Card[], hand: PokerHand, scoredCards: Card[]): HandEvaluation {
  return {
    hand,
    handName: HAND_SCORES[hand].name,
    scoredCards
  };
}

export function evaluateHand(cards: Card[]): HandEvaluation {
  if (cards.length === 0) {
    throw new Error('不能识别空牌组。');
  }

  const stoneCards = cards.filter((card) => card.enhancement === 'stone');
  const rankCards = cards.filter((card) => card.enhancement !== 'stone');

  if (rankCards.length === 0) {
    return evaluateWith(cards, 'high_card', stoneCards);
  }

  const includeStoneCards = (scoredCards: Card[]) => [...scoredCards, ...stoneCards];
  const groups = getGroups(rankCards);
  const flush = isFlush(rankCards);
  const straightHigh = getStraightHighValue(rankCards);
  const isRoyal = flush && straightHigh === 14 && rankCards.some((card) => card.rank === '10');
  const five = groups.find((group) => group.cards.length === 5);
  const three = groups.find((group) => group.cards.length === 3);
  const pairGroups = groups.filter((group) => group.cards.length === 2);

  if (rankCards.length === 5 && flush && five) {
    return evaluateWith(cards, 'flush_five', includeStoneCards(rankCards));
  }

  if (rankCards.length === 5 && flush && three && pairGroups.length === 1) {
    return evaluateWith(cards, 'flush_house', includeStoneCards(rankCards));
  }

  if (rankCards.length === 5 && five) {
    return evaluateWith(cards, 'five_of_a_kind', includeStoneCards(rankCards));
  }

  if (isRoyal) {
    return evaluateWith(cards, 'royal_flush', includeStoneCards(rankCards));
  }

  if (flush && straightHigh !== null) {
    return evaluateWith(cards, 'straight_flush', includeStoneCards(rankCards));
  }

  const four = groups.find((group) => group.cards.length === 4);
  if (four) {
    return evaluateWith(cards, 'four_of_a_kind', includeStoneCards(selectCardsByRanks(rankCards, [four.rank])));
  }

  if (rankCards.length === 5 && three && pairGroups.length === 1) {
    return evaluateWith(cards, 'full_house', includeStoneCards(rankCards));
  }

  if (flush) {
    return evaluateWith(cards, 'flush', includeStoneCards(rankCards));
  }

  if (straightHigh !== null) {
    return evaluateWith(cards, 'straight', includeStoneCards(rankCards));
  }

  if (three) {
    return evaluateWith(cards, 'three_of_a_kind', includeStoneCards(selectCardsByRanks(rankCards, [three.rank])));
  }

  if (pairGroups.length >= 2) {
    const topPairs = pairGroups
      .sort((left, right) => right.value - left.value)
      .slice(0, 2)
      .map((group) => group.rank);
    return evaluateWith(cards, 'two_pair', includeStoneCards(selectCardsByRanks(rankCards, topPairs)));
  }

  if (pairGroups.length === 1) {
    return evaluateWith(cards, 'pair', includeStoneCards(selectCardsByRanks(rankCards, [pairGroups[0].rank])));
  }

  const highCard = [...rankCards].sort((left, right) => RANK_VALUES[right.rank] - RANK_VALUES[left.rank])[0];
  return evaluateWith(cards, 'high_card', includeStoneCards([highCard]));
}
