import { describe, expect, it } from 'vitest';
import { evaluateHand } from './handEvaluator';
import type { Card, CardEnhancement, Rank, Suit } from './types';

function card(rank: Rank, suit: Suit, enhancement?: CardEnhancement): Card {
  return {
    id: `${rank}-${suit}`,
    rank,
    suit,
    enhancement
  };
}

describe('evaluateHand', () => {
  it('recognizes a flush five after deck modification', () => {
    const result = evaluateHand([
      { ...card('A', 'hearts'), id: 'a-1' },
      { ...card('A', 'hearts'), id: 'a-2' },
      { ...card('A', 'hearts'), id: 'a-3' },
      { ...card('A', 'hearts'), id: 'a-4' },
      { ...card('A', 'hearts'), id: 'a-5' }
    ]);

    expect(result.hand).toBe('flush_five');
    expect(result.scoredCards).toHaveLength(5);
  });

  it('recognizes a flush house after deck modification', () => {
    const result = evaluateHand([
      { ...card('Q', 'spades'), id: 'q-1' },
      { ...card('Q', 'spades'), id: 'q-2' },
      { ...card('Q', 'spades'), id: 'q-3' },
      { ...card('7', 'spades'), id: '7-1' },
      { ...card('7', 'spades'), id: '7-2' }
    ]);

    expect(result.hand).toBe('flush_house');
    expect(result.scoredCards).toHaveLength(5);
  });

  it('recognizes five of a kind after deck modification', () => {
    const result = evaluateHand([
      { ...card('9', 'clubs'), id: '9-1' },
      { ...card('9', 'diamonds'), id: '9-2' },
      { ...card('9', 'hearts'), id: '9-3' },
      { ...card('9', 'spades'), id: '9-4' },
      { ...card('9', 'clubs'), id: '9-5' }
    ]);

    expect(result.hand).toBe('five_of_a_kind');
    expect(result.scoredCards).toHaveLength(5);
  });

  it('recognizes a royal flush', () => {
    const result = evaluateHand([
      card('A', 'hearts'),
      card('K', 'hearts'),
      card('Q', 'hearts'),
      card('J', 'hearts'),
      card('10', 'hearts')
    ]);

    expect(result.hand).toBe('royal_flush');
    expect(result.scoredCards).toHaveLength(5);
  });

  it('recognizes a straight flush', () => {
    const result = evaluateHand([
      card('9', 'clubs'),
      card('8', 'clubs'),
      card('7', 'clubs'),
      card('6', 'clubs'),
      card('5', 'clubs')
    ]);

    expect(result.hand).toBe('straight_flush');
  });

  it('recognizes four of a kind', () => {
    const result = evaluateHand([
      card('9', 'clubs'),
      card('9', 'diamonds'),
      card('9', 'hearts'),
      card('9', 'spades'),
      card('5', 'clubs')
    ]);

    expect(result.hand).toBe('four_of_a_kind');
    expect(result.scoredCards).toHaveLength(4);
  });

  it('recognizes a full house', () => {
    const result = evaluateHand([
      card('Q', 'clubs'),
      card('Q', 'diamonds'),
      card('Q', 'hearts'),
      card('5', 'spades'),
      card('5', 'clubs')
    ]);

    expect(result.hand).toBe('full_house');
    expect(result.scoredCards).toHaveLength(5);
  });

  it('recognizes a flush', () => {
    const result = evaluateHand([
      card('A', 'diamonds'),
      card('10', 'diamonds'),
      card('7', 'diamonds'),
      card('4', 'diamonds'),
      card('2', 'diamonds')
    ]);

    expect(result.hand).toBe('flush');
  });

  it('lets wild cards participate in a flush', () => {
    const result = evaluateHand([
      card('A', 'diamonds'),
      card('10', 'diamonds'),
      card('7', 'diamonds'),
      card('4', 'diamonds'),
      card('2', 'clubs', 'wild')
    ]);

    expect(result.hand).toBe('flush');
  });

  it('recognizes a straight', () => {
    const result = evaluateHand([
      card('8', 'spades'),
      card('7', 'hearts'),
      card('6', 'diamonds'),
      card('5', 'clubs'),
      card('4', 'spades')
    ]);

    expect(result.hand).toBe('straight');
  });

  it('recognizes an ace-low straight', () => {
    const result = evaluateHand([
      card('A', 'spades'),
      card('5', 'hearts'),
      card('4', 'diamonds'),
      card('3', 'clubs'),
      card('2', 'spades')
    ]);

    expect(result.hand).toBe('straight');
  });

  it('recognizes three of a kind', () => {
    const result = evaluateHand([
      card('J', 'clubs'),
      card('J', 'diamonds'),
      card('J', 'spades'),
      card('8', 'hearts'),
      card('2', 'clubs')
    ]);

    expect(result.hand).toBe('three_of_a_kind');
    expect(result.scoredCards).toHaveLength(3);
  });

  it('recognizes two pair', () => {
    const result = evaluateHand([
      card('K', 'clubs'),
      card('K', 'diamonds'),
      card('4', 'spades'),
      card('4', 'hearts'),
      card('2', 'clubs')
    ]);

    expect(result.hand).toBe('two_pair');
    expect(result.scoredCards).toHaveLength(4);
  });

  it('recognizes a pair', () => {
    const result = evaluateHand([card('6', 'clubs'), card('6', 'diamonds'), card('A', 'spades')]);

    expect(result.hand).toBe('pair');
    expect(result.scoredCards).toHaveLength(2);
  });

  it('recognizes a high card', () => {
    const result = evaluateHand([card('2', 'clubs'), card('9', 'diamonds'), card('K', 'spades')]);

    expect(result.hand).toBe('high_card');
    expect(result.scoredCards.map((scoredCard) => scoredCard.rank)).toEqual(['K']);
  });
});
