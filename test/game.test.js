import test from 'node:test';
import assert from 'node:assert/strict';
import { getBestMove, getOutcome, WINNING_LINES } from '../src/game/logic.js';

const emptyBoard = () => Array(9).fill(null);

test('recognizes each of the eight winning lines', () => {
  for (const line of WINNING_LINES) {
    const board = emptyBoard();
    for (const index of line) board[index] = 'X';
    assert.deepEqual(getOutcome(board), { winner: 'X', winningLine: line, draw: false });
  }
});

test('recognizes a full board with no winner as a draw', () => {
  const board = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'];
  assert.deepEqual(getOutcome(board), { winner: null, winningLine: [], draw: true });
});

test('does not choose an occupied square and takes a forced win', () => {
  const board = ['X', 'X', null, 'O', 'O', null, null, null, null];
  const move = getBestMove(board, 'X');
  assert.equal(move, 2);
  assert.equal(board[move], null, 'choosing a move must not mutate the source board');
});

test('perfect play never lets a human beat the computer, whichever mark starts', () => {
  for (const aiMark of ['X', 'O']) {
    const seen = new Set();

    function explore(board, turn) {
      const outcome = getOutcome(board);
      assert.notEqual(outcome.winner, aiMark === 'X' ? 'O' : 'X', `human found a win: ${board.join('')}`);
      if (outcome.winner || outcome.draw) return;

      const key = `${board.map((mark) => mark || '-').join('')}:${turn}`;
      if (seen.has(key)) return;
      seen.add(key);

      if (turn === aiMark) {
        const move = getBestMove(board, aiMark);
        assert.ok(move >= 0 && board[move] === null, 'computer must select a legal move');
        const next = [...board];
        next[move] = aiMark;
        explore(next, aiMark === 'X' ? 'O' : 'X');
        return;
      }

      for (let index = 0; index < board.length; index += 1) {
        if (board[index] !== null) continue;
        const next = [...board];
        next[index] = turn;
        explore(next, aiMark);
      }
    }

    explore(emptyBoard(), 'X');
  }
});
