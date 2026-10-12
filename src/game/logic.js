export const WINNING_LINES = Object.freeze([
  Object.freeze([0, 1, 2]),
  Object.freeze([3, 4, 5]),
  Object.freeze([6, 7, 8]),
  Object.freeze([0, 3, 6]),
  Object.freeze([1, 4, 7]),
  Object.freeze([2, 5, 8]),
  Object.freeze([0, 4, 8]),
  Object.freeze([2, 4, 6]),
]);

const MARKS = new Set(['X', 'O']);
const MOVE_ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7];

export const AUTO_COMPLETE_THRESHOLD = 3;

export function otherMark(mark) {
  return mark === 'X' ? 'O' : 'X';
}

export function getOutcome(board) {
  for (const line of WINNING_LINES) {
    const mark = board[line[0]];
    if (mark && line.every((index) => board[index] === mark)) {
      return { winner: mark, winningLine: [...line], draw: false };
    }
  }

  const draw = board.every((cell) => cell === 'X' || cell === 'O');
  return { winner: null, winningLine: [], draw };
}

/**
 * Returns the computer's optimal move. Minimax searches the full game tree,
 * so the computer never loses: it wins when offered a mistake and otherwise
 * guarantees a draw.
 */
export function getBestMove(board, aiMark) {
  if (!Array.isArray(board) || board.length !== 9 || !MARKS.has(aiMark)) return -1;
  const outcome = getOutcome(board);
  if (outcome.winner || outcome.draw) return -1;

  let bestMove = -1;
  let bestScore = -Infinity;
  const workingBoard = [...board];

  for (const index of MOVE_ORDER) {
    if (workingBoard[index] !== null) continue;
    workingBoard[index] = aiMark;
    const score = minimax(workingBoard, otherMark(aiMark), aiMark, 1, -Infinity, Infinity);
    workingBoard[index] = null;

    if (score > bestScore) {
      bestScore = score;
      bestMove = index;
    }
  }

  return bestMove;
}

/**
 * True only when every legal continuation ends in a draw. This deliberately
 * differs from a minimax draw: it will not skip a player's remaining moves if
 * any legal sequence could still produce a winner.
 */
export function isInevitableDraw(board, nextMark) {
  if (!Array.isArray(board) || board.length !== 9 || !MARKS.has(nextMark)) return false;
  const position = [...board];
  const memo = new Map();

  function visit(turn) {
    const outcome = getOutcome(position);
    if (outcome.winner) return false;
    if (outcome.draw) return true;

    const key = `${position.map((mark) => mark || '-').join('')}:${turn}`;
    if (memo.has(key)) return memo.get(key);

    for (const index of MOVE_ORDER) {
      if (position[index] !== null) continue;
      position[index] = turn;
      const continuationIsDraw = visit(otherMark(turn));
      position[index] = null;
      if (!continuationIsDraw) {
        memo.set(key, false);
        return false;
      }
    }

    memo.set(key, true);
    return true;
  }

  return visit(nextMark);
}

/** Get the remaining placements for an already unavoidable draw. */
export function getDrawCompletionSequence(board, nextMark) {
  if (!isInevitableDraw(board, nextMark)) return [];
  const workingBoard = [...board];
  const sequence = [];
  let turn = nextMark;

  for (const index of MOVE_ORDER) {
    if (workingBoard[index] !== null) continue;
    workingBoard[index] = turn;
    sequence.push({ index, mark: turn });
    turn = otherMark(turn);
  }

  return sequence;
}

function minimax(board, turn, aiMark, depth, alpha, beta) {
  const outcome = getOutcome(board);
  if (outcome.winner === aiMark) return 10 - depth;
  if (outcome.winner) return depth - 10;
  if (outcome.draw) return 0;

  let best;
  if (turn === aiMark) {
    best = -Infinity;
    for (const index of MOVE_ORDER) {
      if (board[index] !== null) continue;
      board[index] = turn;
      best = Math.max(best, minimax(board, otherMark(turn), aiMark, depth + 1, alpha, beta));
      board[index] = null;
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  best = Infinity;
  for (const index of MOVE_ORDER) {
    if (board[index] !== null) continue;
    board[index] = turn;
    best = Math.min(best, minimax(board, otherMark(turn), aiMark, depth + 1, alpha, beta));
    board[index] = null;
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}
