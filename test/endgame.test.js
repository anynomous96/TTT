import test from 'node:test';
import assert from 'node:assert/strict';
import { getDrawCompletionSequence, getOutcome, isInevitableDraw, otherMark } from '../src/game/logic.js';

test('bot and same-device rounds auto-complete only a forced draw', () => {
  // Three empty squares remain, but every legal continuation is a draw.
  const board = ['X', 'O', 'X', null, null, null, 'O', 'X', 'O'];
  const original = [...board];
  const sequence = getDrawCompletionSequence(board, 'X');

  assert.equal(isInevitableDraw(board, 'X'), true);
  assert.equal(sequence.length, 3);
  assert.deepEqual(board, original, 'checking a forced draw must not mutate the live board');

  let turn = 'X';
  for (const move of sequence) {
    assert.equal(move.mark, turn, 'the generated completion must keep alternating turns');
    assert.equal(board[move.index], null, 'the completion must only use empty squares');
    board[move.index] = move.mark;
    assert.equal(getOutcome(board).winner, null, 'auto-completing must never create a winner');
    turn = otherMark(turn);
  }

  assert.deepEqual(getOutcome(board), { winner: null, winningLine: [], draw: true });
});

test('keeps the remaining turns playable if a win is still possible', () => {
  const board = ['X', 'O', 'X', 'O', 'X', 'O', null, null, null];

  assert.equal(isInevitableDraw(board, 'X'), false);
  assert.deepEqual(getDrawCompletionSequence(board, 'X'), []);

  // X can still win on the bottom-right square, so automatic filling would
  // incorrectly remove a legal winning move.
  board[8] = 'X';
  assert.equal(getOutcome(board).winner, 'X');
});
