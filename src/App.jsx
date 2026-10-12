import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  Check,
  CircleHelp,
  Copy,
  DoorOpen,
  Gamepad2,
  Link2,
  MessageCircle,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { AUTO_COMPLETE_THRESHOLD, getBestMove, getDrawCompletionSequence, getOutcome, isInevitableDraw, otherMark } from './game/logic.js';
import { MarkIcon } from './components/Mark.jsx';
import { getStoredRoom, usePrivateRoom } from './hooks/usePrivateRoom.js';

const EMPTY_GAME = (startingMark = 'X') => ({
  board: Array(9).fill(null),
  turn: startingMark,
  winner: null,
  winningLine: [],
});

const MODE_DETAILS = {
  bot: {
    title: 'Perfect opponent',
    subtitle: 'An impossible-to-beat computer. Draw if you can; one mistake is all it needs.',
    label: 'SOLO MATCH',
  },
  local: {
    title: 'Pass & play',
    subtitle: 'Two players, one screen. Hand it over when the turn changes.',
    label: 'SAME DEVICE',
  },
  private: {
    title: 'Private room',
    subtitle: 'Invite one person with a private code. No matchmaking, no strangers.',
    label: 'PRIVATE MATCH',
  },
};

function readValue(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeValue(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the current session playable when storage is disabled.
  }
}

function readString(key, fallback) {
  const value = readValue(key, fallback);
  return typeof value === 'string' ? value : fallback;
}

function normalizeCode(value) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : '';
}

function SiteHeader({ onHome, onRules, room, connection }) {
  return (
    <header className="site-header">
      <button className="brand-button" type="button" onClick={onHome} aria-label="Back to mode selection">
        <span className="brand-glyph" aria-hidden="true"><MarkIcon mark="X" /><MarkIcon mark="O" /></span>
        <span className="brand-word">THREEFOLD<span> / PLAY</span></span>
      </button>
      <div className="header-actions">
        {room && (
          <span className={`room-status ${connection === 'connected' ? 'is-online' : connection === 'reconnecting' || connection === 'connecting' ? 'is-reconnecting' : ''}`}>
            {connection === 'connected' ? <Wifi size={14} /> : connection === 'reconnecting' || connection === 'connecting' ? <WifiOff size={14} /> : <span className="status-dot" />}
            {connection === 'connected' ? 'Room live' : connection === 'reconnecting' || connection === 'connecting' ? 'Reconnecting' : 'Room paused'}
          </span>
        )}
        <button className="header-help" type="button" onClick={onRules} aria-label="How to play"><CircleHelp size={16} /><span>How to play</span></button>
      </div>
    </header>
  );
}

function PageIntro({ eyebrow, title, accent, detail, backTo = '/', backLabel = 'Back' }) {
  return (
    <div className="page-intro">
      <Link className="back-link" to={backTo}><ArrowLeft size={16} />{backLabel}</Link>
      <div className="page-intro-copy">
        <p className="eyebrow"><span className="eyebrow-mark" />{eyebrow}</p>
        <h1>{title} <em>{accent}</em></h1>
        {detail && <p className="page-intro-detail">{detail}</p>}
      </div>
    </div>
  );
}

function PageFooter() {
  return (
    <footer className="page-footer">
      <span>THREEFOLD</span>
      <span>A little game, a lot of rematches.</span>
      <span className="footer-spark">✳</span>
    </footer>
  );
}

function ModeSelectionPage() {
  return (
    <main className="mode-page page-enter">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-mark" />THE CLASSIC, WITH A LITTLE MORE LIFE</p>
          <h1>Choose your<br /><em>kind of rivalry.</em></h1>
          <p className="hero-description">A familiar little game, made for a quick challenge and one more rematch. Pick your opponent and make the first move.</p>
          <div className="hero-trust-row"><span><ShieldCheck size={15} /> Free to play</span><i /> <span>No sign-up needed</span></div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="visual-note"><Sparkles size={15} /> ONE MORE ROUND?</div>
          <div className="mini-board">
            <div><MarkIcon mark="X" /></div><div><MarkIcon mark="O" /></div><div />
            <div /><div><MarkIcon mark="X" /></div><div />
            <div><MarkIcon mark="O" /></div><div /><div><MarkIcon mark="X" /></div>
          </div>
          <span className="visual-caption">X · O · AGAIN</span>
        </div>
        <div className="hero-index">01 <span>/ 03</span></div>
      </section>

      <section className="mode-section">
        <div className="section-heading">
          <div><p className="eyebrow">PICK YOUR PLAY STYLE</p><h2>Who’s playing today?</h2></div>
          <span className="section-aside">Three ways to play <ArrowDownRight size={15} /></span>
        </div>
        <div className="mode-grid">
          <Link className="mode-card mode-card-bot" to="/setup/bot">
            <div className="mode-card-top"><span className="mode-icon"><Bot size={20} /></span><span className="mode-number">01</span></div>
            <span className="mode-overline">SOLO · PERFECT PLAY</span>
            <h3>Take on the<br />computer.</h3>
            <p>Outsmart the only opponent that never misses a line.</p>
            <span className="mode-card-action">Play solo <ArrowUpRight size={17} /></span>
          </Link>
          <Link className="mode-card mode-card-local" to="/setup/local">
            <div className="mode-card-top"><span className="mode-icon"><UsersRound size={20} /></span><span className="mode-number">02</span></div>
            <span className="mode-overline">TWO PLAYERS · ONE SCREEN</span>
            <h3>Pass it<br />around.</h3>
            <p>A little local rivalry. No accounts, no waiting for a turn.</p>
            <span className="mode-card-action">Play together <ArrowUpRight size={17} /></span>
          </Link>
          <Link className="mode-card mode-card-room" to="/room">
            <div className="mode-card-top"><span className="mode-icon"><MessageCircle size={20} /></span><span className="mode-number">03</span></div>
            <span className="mode-overline">ONLINE · INVITE ONLY</span>
            <h3>Meet in a<br />private room.</h3>
            <p>Share a code, play live, and chat between moves.</p>
            <span className="mode-card-action">Create or join <ArrowUpRight size={17} /></span>
          </Link>
        </div>
      </section>

      <section className="home-footer-note">
        <span className="tiny-mark"><MarkIcon mark="X" /></span>
        <p><strong>Simple rules. Good company.</strong><span>Three in a row wins. A full board is a draw.</span></p>
        <span className="note-right">BUILT FOR THE REMATCH <span>↗</span></span>
      </section>
    </main>
  );
}

function SetupRoute({ selectedMark, setSelectedMark, playerOneName, setPlayerOneName, playerTwoName, setPlayerTwoName, onStart }) {
  const { mode } = useParams();
  if (mode !== 'bot' && mode !== 'local') return <Navigate to="/" replace />;
  return <SetupPage mode={mode} selectedMark={selectedMark} setSelectedMark={setSelectedMark} playerOneName={playerOneName} setPlayerOneName={setPlayerOneName} playerTwoName={playerTwoName} setPlayerTwoName={setPlayerTwoName} onStart={() => onStart(mode)} />;
}

function SetupPage({ mode, selectedMark, setSelectedMark, playerOneName, setPlayerOneName, playerTwoName, setPlayerTwoName, onStart }) {
  const isBot = mode === 'bot';
  const description = MODE_DETAILS[mode];
  const firstMark = 'X';
  const opener = isBot
    ? selectedMark === 'X' ? 'You open as X.' : 'The computer opens as X.'
    : selectedMark === 'X' ? `${playerOneName.trim() || 'Player 1'} opens as X.` : `${playerTwoName.trim() || 'Player 2'} opens as X.`;

  return (
    <main className="setup-page page-enter">
      <PageIntro eyebrow="02 / GET SET" title={isBot ? 'Pick your' : 'Set the'} accent={isBot ? 'side.' : 'players.'} detail={description.subtitle} />
      <div className="setup-layout">
        <section className="setup-card panel">
          <div className="setup-card-header"><span className="setup-mode-icon">{isBot ? <Bot size={19} /> : <UsersRound size={19} />}</span><div><span className="panel-overline">{description.label}</span><h2>{isBot ? 'How do you want to play?' : 'Who’s on the couch?'}</h2></div></div>

          {isBot ? (
            <>
              <div className="difficulty-callout"><span className="difficulty-icon"><BadgeCheck size={17} /></span><div><strong>Impossible difficulty</strong><span>Perfect-play minimax. It can win or draw, but it won’t lose.</span></div><span className="difficulty-lock">FIXED</span></div>
              <div className="form-block">
                <div className="field-label-row"><label>Choose your mark</label><span>There are no wrong answers.</span></div>
                <MarkPicker selectedMark={selectedMark} setSelectedMark={setSelectedMark} optionLabels={['X / CROSS', 'O / CIRCLE']} />
              </div>
              <div className="opening-note"><MarkIcon mark={firstMark} /><span><strong>{opener}</strong><small>On an empty board, X always takes the first turn.</small></span></div>
            </>
          ) : (
            <>
              <div className="form-block player-fields">
                <label className="field-label" htmlFor="setup-p1">Player one</label>
                <div className="player-name-input"><MarkIcon mark={selectedMark} /><input id="setup-p1" value={playerOneName} maxLength={18} onChange={(event) => setPlayerOneName(event.target.value)} placeholder="Player 1" /></div>
                <label className="field-label" htmlFor="setup-p2">Player two</label>
                <div className="player-name-input"><MarkIcon mark={otherMark(selectedMark)} /><input id="setup-p2" value={playerTwoName} maxLength={18} onChange={(event) => setPlayerTwoName(event.target.value)} placeholder="Player 2" /></div>
              </div>
              <div className="form-block">
                <div className="field-label-row"><label>Player one uses</label><span>Switch sides any time before you start.</span></div>
                <MarkPicker selectedMark={selectedMark} setSelectedMark={setSelectedMark} optionLabels={['X / CROSS', 'O / CIRCLE']} />
              </div>
              <div className="opening-note"><MarkIcon mark="X" /><span><strong>{opener}</strong><small>The first player switches each rematch to keep it fair.</small></span></div>
            </>
          )}
          <button className="primary-button setup-start" type="button" onClick={onStart}>Start the game <ArrowRight size={18} /></button>
        </section>

        <aside className={`setup-preview ${isBot ? 'setup-preview-bot' : 'setup-preview-local'}`}>
          <div className="preview-art"><div className="preview-glow" /><div className="setup-mini-board">
            <div><MarkIcon mark="X" /></div><div /><div><MarkIcon mark="O" /></div>
            <div /><div><MarkIcon mark="X" /></div><div />
            <div><MarkIcon mark="O" /></div><div /><div />
          </div></div>
          <div className="preview-copy"><span className="panel-overline">A QUICK REMINDER</span><h3>{isBot ? <>You can draw.<br />You can’t win.</> : <>Take turns.<br />Talk a little trash.</>}</h3><p>{isBot ? 'The computer checks every possible line. A perfect game from you ends level.' : 'X goes first. Three marks in a line wins. No squares left? Shake hands.'}</p></div>
          <div className="preview-bottom"><span>THREEFOLD / {isBot ? 'SOLO' : 'LOCAL'}</span><Sparkles size={16} /></div>
        </aside>
      </div>
    </main>
  );
}

function MarkPicker({ selectedMark, setSelectedMark, optionLabels }) {
  return (
    <div className="mark-picker" role="group" aria-label="Choose a mark">
      {['X', 'O'].map((mark, index) => (
        <button key={mark} className={`mark-picker-option ${selectedMark === mark ? 'is-selected' : ''}`} type="button" aria-pressed={selectedMark === mark} onClick={() => setSelectedMark(mark)}>
          <MarkIcon mark={mark} /><span>{optionLabels[index]}</span>{selectedMark === mark && <Check className="picker-check" size={15} />}
        </button>
      ))}
    </div>
  );
}

function RoomEntryPage({ playerName, setPlayerName, joinCode, setJoinCode, createRoom, joinRoom, actionPending, connection, roomError, clearRoomError, hasInvite }) {
  const [formError, setFormError] = useState('');
  const creating = actionPending === 'create';
  const joining = actionPending === 'join';
  const pending = Boolean(actionPending);

  function submitCreate(event) {
    event.preventDefault();
    const name = playerName.trim().replace(/\s+/g, ' ').slice(0, 18);
    if (!name) return setFormError('Add your name first so your friend knows who opened the room.');
    setFormError('');
    clearRoomError();
    createRoom(name);
  }

  function submitJoin(event) {
    event.preventDefault();
    const name = playerName.trim().replace(/\s+/g, ' ').slice(0, 18);
    const code = normalizeCode(joinCode);
    if (!name) return setFormError('Add your name before joining.');
    if (code.length !== 6) return setFormError('Room codes are six characters long.');
    setFormError('');
    clearRoomError();
    joinRoom(code, name);
  }

  return (
    <main className="room-entry-page page-enter">
      <PageIntro eyebrow="PRIVATE PLAY / 03" title="Make it a" accent="two-player game." detail="Host a room for a friend or enter the code they sent. Your board appears once you’re in the room." />
      <div className="room-entry-layout">
        <section className="room-entry-main panel">
          <div className="room-entry-intro"><span className="setup-mode-icon room-mode-icon"><Link2 size={19} /></span><div><span className="panel-overline">PRIVATE ROOM</span><h2>First, who are you?</h2><p>Choose a name to show in the room and the chat.</p></div></div>
          <label className="field-label" htmlFor="room-player-name">Your name</label>
          <input className="text-input room-name-input" id="room-player-name" value={playerName} maxLength={18} autoComplete="nickname" onChange={(event) => { setPlayerName(event.target.value); setFormError(''); clearRoomError(); }} placeholder="e.g. Alex" />

          {hasInvite && <div className="invite-callout"><Link2 size={15} /><span>Invite code found — enter your name, then join below.</span></div>}
          {(formError || roomError) && <p className="form-alert" role="alert">{formError || roomError}</p>}

          <div className="room-actions-grid">
            <form className="room-action-card create-room-card" onSubmit={submitCreate}>
              <span className="room-action-icon"><UsersRound size={19} /></span>
              <span className="panel-overline">YOU’RE THE HOST</span>
              <h3>Start a new room.</h3>
              <p>We’ll make a private six-character code to share.</p>
              <button className="primary-button room-create-button" type="submit" disabled={pending}>
                {creating && <span className="button-spinner" aria-hidden="true" />}
                <span>{creating ? 'Creating room…' : 'Create room'}</span>
                {!creating && <ArrowUpRight size={17} />}
              </button>
            </form>

            <form className="room-action-card join-room-card" onSubmit={submitJoin}>
              <span className="room-action-icon"><Link2 size={19} /></span>
              <span className="panel-overline">YOUR FRIEND HOSTED</span>
              <h3>Enter their code.</h3>
              <p>Six letters or numbers. Room codes are private invites.</p>
              <label className="field-label code-label" htmlFor="join-room-code">ROOM CODE</label>
              <div className="code-entry-row">
                <input className="text-input room-code-input" id="join-room-code" value={joinCode} onChange={(event) => { setJoinCode(normalizeCode(event.target.value)); setFormError(''); clearRoomError(); }} maxLength={6} autoComplete="off" placeholder="ABC123" aria-label="Six character room code" />
                <button className="join-submit-button" type="submit" aria-label="Join private room" disabled={pending}>
                  {joining ? <span className="button-spinner" aria-hidden="true" /> : <ArrowRight size={18} />}
                </button>
              </div>
              <span className="code-hint">Enter the six-character code from your friend’s invite.</span>
            </form>
          </div>
          {actionPending && <p className="room-connection-note" role="status"><span className="status-dot status-dot-live" />{joining ? 'Checking the code and joining your friend…' : 'Setting up your room…'}</p>}
          {(connection === 'reconnecting' || (connection === 'connecting' && !actionPending)) && <p className="room-connection-note" role="status"><span className="status-dot status-dot-live" />{connection === 'reconnecting' ? 'Reconnecting to your room…' : 'Restoring your saved room…'}</p>}
          <p className="private-note"><ShieldCheck size={15} /> Your room is invite-only. It won’t appear in public search.</p>
        </section>

        <aside className="room-side-card">
          <div className="room-side-art"><div className="chat-orbit"><MessageCircle size={26} /></div><span className="orbit-dot dot-left" /><span className="orbit-dot dot-right" /><MarkIcon mark="X" /><MarkIcon mark="O" /></div>
          <span className="panel-overline">A ROOM FOR TWO</span>
          <h3>Board first.<br />Chat whenever.</h3>
          <p>Join the room, see who has the first move, then keep the banter right beside the board.</p>
          <div className="room-side-points"><span><Check size={14} /> Live score</span><span><Check size={14} /> Private chat</span><span><Check size={14} /> One invite code</span></div>
          <div className="side-card-foot">NO ACCOUNT NEEDED <span>✳</span></div>
        </aside>
      </div>
    </main>
  );
}

function GameRoute({ room, connection, roomError, clearRoomError, yourMark, send, onHome, gameProps }) {
  const { mode } = useParams();
  const location = useLocation();
  if (!['bot', 'local', 'private'].includes(mode)) return <Navigate to="/" replace />;

  if (mode === 'private' && !room) {
    if (connection === 'connecting' || connection === 'reconnecting') {
      return <RoomReconnectScreen error={roomError} />;
    }
    const code = normalizeCode(new URLSearchParams(location.search).get('room'));
    return <Navigate to={`/room${code ? `?room=${code}` : ''}`} replace />;
  }

  return (
    <GamePage
      mode={mode}
      room={room}
      connection={connection}
      roomError={roomError}
      clearRoomError={clearRoomError}
      yourMark={yourMark}
      sendRoomMessage={send}
      onHome={onHome}
      {...gameProps}
    />
  );
}

function RoomReconnectScreen({ error }) {
  return (
    <main className="reconnect-screen page-enter" aria-live="polite">
      <span className="reconnect-icon"><Wifi size={24} /></span>
      <p className="eyebrow">PRIVATE ROOM</p>
      <h1>Finding your<br /><em>board again.</em></h1>
      <p>{error || 'Reconnecting to your friend and restoring the latest room state.'}</p>
      <span className="reconnect-track"><i /></span>
    </main>
  );
}

function GamePage({ mode, room, connection, roomError, clearRoomError, yourMark, sendRoomMessage, reconnectToRoom, onHome, game, localRound, localStarter, applyLocalMove, startNextLocalRound, resetCurrentGame, selectedMark, playerOneName, playerTwoName, botStats, localStats, autoCompleting, announcement, copied, copyInvite, onClearRecords }) {
  const [chatDraft, setChatDraft] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [optimisticMove, setOptimisticMove] = useState(null);
  const chatEndRef = useRef(null);
  const botMark = otherMark(selectedMark);
  const remote = mode === 'private';
  const baseBoard = remote ? room.board : game.board;
  const displayBoard = useMemo(() => {
    if (!remote || !optimisticMove || baseBoard[optimisticMove.index] !== null) return baseBoard;
    const nextBoard = [...baseBoard];
    nextBoard[optimisticMove.index] = optimisticMove.mark;
    return nextBoard;
  }, [baseBoard, optimisticMove, remote]);
  const turn = remote ? room.turn : game.turn;
  const winner = remote ? room.winner : game.winner;
  const winningLine = remote ? room.winningLine : game.winningLine;
  const movesMade = displayBoard.filter(Boolean).length;
  const draw = remote ? room.status === 'finished' && !room.winner : !game.winner && getOutcome(game.board).draw;
  const roundFinished = remote ? room.status === 'finished' : Boolean(game.winner || draw);
  const openingTurn = movesMade === 0 && !roundFinished;
  const botThinking = mode === 'bot' && !roundFinished && !autoCompleting && turn === botMark;
  const bothOnline = Boolean(room?.players?.X?.online && room?.players?.O?.online);
  const votes = room?.nextRoundVotes || { X: false, O: false };
  const opponentMark = remote ? otherMark(yourMark) : null;

  const playerNameFor = useCallback((mark) => {
    if (mode === 'private') return room?.players?.[mark]?.name || (mark === 'X' ? 'Host' : 'Friend');
    if (mode === 'bot') return mark === selectedMark ? 'You' : 'Perfect computer';
    return mark === selectedMark ? (playerOneName.trim() || 'Player 1') : (playerTwoName.trim() || 'Player 2');
  }, [mode, playerOneName, playerTwoName, room, selectedMark]);

  const canPlay = remote
    ? room.status === 'playing' && connection === 'connected' && turn === yourMark && !optimisticMove
    : !roundFinished && !autoCompleting && (mode !== 'bot' || turn === selectedMark);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [room?.messages?.length]);

  useEffect(() => {
    if (!remote || !optimisticMove) return;
    if (room.board[optimisticMove.index] === optimisticMove.mark || room.round !== optimisticMove.round || room.status !== 'playing' || connection !== 'connected' || roomError) {
      setOptimisticMove(null);
    }
  }, [connection, optimisticMove, remote, room, roomError]);

  useEffect(() => {
    if (!optimisticMove) return undefined;
    const timeout = window.setTimeout(() => setOptimisticMove(null), 2_500);
    return () => window.clearTimeout(timeout);
  }, [optimisticMove]);

  useEffect(() => {
    if (mode !== 'bot' || roundFinished || autoCompleting || game.turn !== botMark) return undefined;
    const move = getBestMove(game.board, botMark);
    if (move < 0) return undefined;
    const timer = window.setTimeout(() => applyLocalMove(move, botMark, 'bot'), 430);
    return () => window.clearTimeout(timer);
  }, [applyLocalMove, autoCompleting, botMark, game, mode, roundFinished]);

  function turnText() {
    if (remote) {
      if (connection === 'reconnecting' || connection === 'connecting') return 'Reconnecting to the room…';
      if (optimisticMove) return 'Sending your move…';
      if (connection !== 'connected') return 'Room connection paused';
      if (room.status === 'waiting') return 'Room is open · invite one friend to begin';
      if (roundFinished) return winner ? `${playerNameFor(winner)} takes the round` : 'A hard-fought draw';
      return turn === yourMark ? 'Your move' : `${playerNameFor(turn)} is up`;
    }
    if (roundFinished) {
      if (draw) return 'A well-played draw';
      return `${playerNameFor(winner)} takes the round`;
    }
    if (autoCompleting) return 'No winning line remains · finishing the draw';
    if (botThinking) return 'The computer is thinking…';
    return mode === 'bot' ? 'Your move' : `${playerNameFor(turn)} to play`;
  }

  function firstTurnText() {
    if (!openingTurn) return '';
    if (remote && room.status === 'waiting') return 'X opens when your friend joins';
    return `${turn} opens · ${playerNameFor(turn)} has the first move`;
  }

  function scoreFor(mark) {
    if (remote) return room.scores[mark] || 0;
    if (mode === 'bot') return mark === selectedMark ? botStats.wins : botStats.losses;
    return mark === selectedMark ? localStats.player1 : localStats.player2;
  }

  function handleCellClick(index) {
    if (!canPlay || displayBoard[index] !== null) return;
    if (remote) {
      if (sendRoomMessage({ type: 'move', index })) setOptimisticMove({ index, mark: turn, round: room.round });
    } else applyLocalMove(index, turn, mode);
  }

  function handleNextRoundVote() {
    if (connection !== 'connected' || !bothOnline) return;
    sendRoomMessage({ type: 'next_round_vote' });
  }

  function handleChatSubmit(event) {
    event.preventDefault();
    const text = chatDraft.trim().slice(0, 300);
    if (!text || connection !== 'connected') return;
    if (sendRoomMessage({ type: 'chat', text })) setChatDraft('');
  }

  function sendReaction(emoji) {
    if (connection === 'connected') sendRoomMessage({ type: 'chat', text: emoji });
  }

  const resultHeadline = useMemo(() => {
    if (!roundFinished) return '';
    if (draw) return mode === 'bot' ? 'A perfect draw.' : 'It’s a draw.';
    if (mode === 'bot' && winner === selectedMark) return 'You beat the computer!';
    if (mode === 'bot') return 'The computer takes this one.';
    return `${playerNameFor(winner)} wins the round.`;
  }, [draw, mode, playerNameFor, roundFinished, selectedMark, winner]);

  const resultDetail = draw
    ? mode === 'bot' ? 'No line left open. That’s the best possible result against perfect play.' : 'Neither side found three in a row. Your score stays level.'
    : mode === 'bot' ? 'One missed move was all it needed. Fancy another go?' : `${playerNameFor(winner)} found the line. The scoreboard has been updated.`;

  const totalGames = botStats.wins + botStats.losses + botStats.draws;
  const displayRound = remote ? room.round : localRound;
  const statusLabel = remote ? 'PRIVATE ROOM' : mode === 'bot' ? 'VS PERFECT COMPUTER' : 'PASS & PLAY';
  const nameOfOpponent = remote ? playerNameFor(opponentMark) : mode === 'bot' ? 'Perfect computer' : playerNameFor(otherMark(selectedMark));
  const youVoted = remote && votes[yourMark];
  const opponentVoted = remote && votes[opponentMark];

  return (
    <main className="game-page page-enter">
      <p className="visually-hidden" aria-live="polite">{announcement}</p>
      <div className="game-page-heading">
        <button className="back-link" type="button" onClick={onHome}><ArrowLeft size={16} />Leave match</button>
        <div className="game-page-title"><span className="eyebrow"><span className="eyebrow-mark" />{statusLabel}</span><h1>{remote ? room.players.X?.name && room.players.O?.name ? `${room.players.X.name} vs ${room.players.O.name}` : 'Your private room' : mode === 'bot' ? 'No easy moves.' : 'Keep it friendly.'}</h1></div>
        <div className="round-chip"><span>ROUND</span><strong>{String(displayRound).padStart(2, '0')}</strong></div>
      </div>

      {remote && <div className="mobile-game-tabs" role="tablist" aria-label="Private game panels"><button type="button" role="tab" aria-selected={!showChat} className={!showChat ? 'is-selected' : ''} onClick={() => setShowChat(false)}><Gamepad2 size={15} />Board</button><button type="button" role="tab" aria-selected={showChat} className={showChat ? 'is-selected' : ''} onClick={() => setShowChat(true)}><MessageCircle size={15} />Chat<span>{room.messages.length || ''}</span></button></div>}
      <div className={`game-layout ${remote ? 'has-room-chat' : ''} ${showChat ? 'show-room-chat' : ''}`}>
        <section className="board-panel panel">
          <div className="board-panel-head">
            <div className="match-title"><span className={`match-status-mark ${remote ? 'is-room' : mode === 'bot' ? 'is-bot' : 'is-local'}`}>{remote ? <Link2 size={15} /> : mode === 'bot' ? <Bot size={15} /> : <UsersRound size={15} />}</span><div><strong>{mode === 'bot' ? 'The impossible match' : mode === 'local' ? 'Your table' : `Room ${room.code}`}</strong><span>{mode === 'bot' ? 'Perfect play · draw is the best result' : mode === 'local' ? 'The next player gets the screen' : 'Two players · live game'}</span></div></div>
            <span className={`turn-pill ${roundFinished ? 'is-finished' : ''}`} aria-live="polite">{winner && !draw ? <MarkIcon mark={winner} /> : draw ? <span className="draw-glyph">=</span> : <MarkIcon mark={turn} />}<span>{turnText()}</span></span>
          </div>

          <div className="score-row" aria-label="Live scoreboard">
            <ScoreTile mark="X" label={playerNameFor('X')} score={scoreFor('X')} active={!roundFinished && turn === 'X'} />
            <div className="score-ties"><span>DRAW</span><strong>{remote ? room.scores.draws : mode === 'bot' ? botStats.draws : localStats.draws}</strong></div>
            <ScoreTile mark="O" label={playerNameFor('O')} score={scoreFor('O')} active={!roundFinished && turn === 'O'} />
          </div>

          {firstTurnText() && <div className="first-turn-note"><span className="first-turn-icon"><Sparkles size={14} /></span><span>{firstTurnText()}</span></div>}
          {room?.status === 'waiting' && <div className="waiting-banner"><span className="waiting-dot" /><span>Share the code to bring in the second player. The board unlocks when they join.</span></div>}
          {roomError && <p className="game-alert" role="alert">{roomError}<button type="button" onClick={clearRoomError} aria-label="Dismiss message"><X size={15} /></button></p>}

          <Board board={displayBoard} winningLine={winningLine} winner={winner} onCellClick={handleCellClick} canPlay={canPlay} nextMark={turn} autoCompleting={autoCompleting} />

          <div className="board-controls">
            <span className="move-progress"><span className="move-progress-bar"><i style={{ width: `${Math.min(100, (movesMade / 9) * 100)}%` }} /></span>{movesMade} / 9 moves</span>
            {!remote && !roundFinished && <button className="quiet-button" type="button" onClick={() => setShowResetConfirm(true)}><RotateCcw size={15} />Reset round</button>}
            {remote && connection !== 'connected' && <span className="connection-caption"><WifiOff size={14} />{connection === 'reconnecting' ? 'Reconnecting' : 'Offline'}</span>}
          </div>

          {roundFinished && (
            <RoundResult
              mode={mode}
              winner={winner}
              draw={draw}
              headline={resultHeadline}
              detail={resultDetail}
              scoreX={scoreFor('X')}
              scoreO={scoreFor('O')}
              drawScore={remote ? room.scores.draws : mode === 'bot' ? botStats.draws : localStats.draws}
              playerNameFor={playerNameFor}
              nextStarter={mode === 'local' ? otherMark(localStarter) : 'X'}
              onPlayAgain={() => startNextLocalRound(mode)}
              remote={remote}
              yourMark={yourMark}
              youVoted={youVoted}
              opponentVoted={opponentVoted}
              opponentName={nameOfOpponent}
              bothOnline={bothOnline}
              connection={connection}
              onVote={handleNextRoundVote}
            />
          )}

          {showResetConfirm && (
            <ConfirmDialog
              title="Reset this round?"
              detail="The current board will clear. Your saved scorecard won’t change."
              confirmLabel="Reset board"
              onCancel={() => setShowResetConfirm(false)}
              onConfirm={() => { setShowResetConfirm(false); resetCurrentGame(mode); }}
            />
          )}
        </section>

        <aside className="game-sidebar">
          {remote ? (
            <>
              <RoomCard room={room} yourMark={yourMark} connection={connection} copied={copied} copyInvite={copyInvite} onReconnect={reconnectToRoom} onLeave={onHome} />
              <section className={`chat-panel panel ${showChat ? 'chat-is-open' : ''}`}>
                <div className="chat-panel-heading">
                  <div className="chat-opponent-avatar"><MarkIcon mark={opponentMark} /></div>
                  <div className="chat-panel-title"><span className="panel-overline">ROOM CHAT</span><strong>{nameOfOpponent}</strong><span className={`chat-status ${room.players[opponentMark]?.online ? 'is-online' : ''}`}><i />{room.players[opponentMark]?.online ? 'Online now' : 'Away'}</span></div>
                  <span className="chat-live-pill"><span />LIVE</span>
                </div>
                <div className="chat-mobile-caption"><MessageCircle size={14} /> Little messages between moves</div>
                <div className="chat-messages" aria-label="Private room messages" aria-live="polite">
                  {room.messages.length === 0 ? (
                    <div className="chat-empty-state"><span className="chat-empty-emoji">👋</span><strong>Break the ice.</strong><span>Send a hello before the next move.</span></div>
                  ) : room.messages.map((message, index) => {
                    const previous = room.messages[index - 1];
                    const grouped = previous?.mark === message.mark && Date.now() - new Date(previous.sentAt).getTime() < 5 * 60 * 1000;
                    return <ChatBubble key={message.id} message={message} mine={message.mark === yourMark} grouped={grouped} />;
                  })}
                  <div ref={chatEndRef} />
                </div>
                <div className="quick-reactions" aria-label="Quick reactions">
                  {['👋', '🙂', '🔥'].map((emoji) => <button type="button" key={emoji} onClick={() => sendReaction(emoji)} disabled={connection !== 'connected'} aria-label={`Send ${emoji}`}>{emoji}</button>)}
                  <span>QUICK REACTION</span>
                </div>
                <form className="chat-composer" onSubmit={handleChatSubmit}>
                  <label className="visually-hidden" htmlFor="room-chat-input">Write a message</label>
                  <input id="room-chat-input" value={chatDraft} maxLength={300} placeholder={connection === 'connected' ? 'Message your friend…' : 'Reconnecting…'} onChange={(event) => setChatDraft(event.target.value)} disabled={connection !== 'connected'} />
                  <button type="submit" aria-label="Send message" disabled={!chatDraft.trim() || connection !== 'connected'}><Send size={17} /></button>
                </form>
                {roomError && <p className="chat-error" role="alert"><span>{roomError}</span><button type="button" onClick={clearRoomError} aria-label="Dismiss message"><X size={14} /></button></p>}
                <p className="chat-encryption-note"><ShieldCheck size={13} />Only players with this room code can see chat.</p>
              </section>
            </>
          ) : (
            <LocalMatchCard mode={mode} selectedMark={selectedMark} playerOneName={playerOneName} playerTwoName={playerTwoName} botStats={botStats} localStats={localStats} totalGames={totalGames} onClearRecords={onClearRecords} />
          )}
        </aside>
      </div>
    </main>
  );
}

function ScoreTile({ mark, label, score, active }) {
  return (
    <div className={`score-tile score-tile-${mark.toLowerCase()} ${active ? 'is-active' : ''}`}>
      <MarkIcon mark={mark} />
      <div className="score-player-name"><span>{label}</span><small>PLAYS {mark}</small></div>
      <strong className="score-number">{score}</strong>
    </div>
  );
}

function Board({ board, winningLine, winner, onCellClick, canPlay, nextMark, autoCompleting }) {
  return (
    <div className={`board-shell ${autoCompleting ? 'is-auto-completing' : ''}`}>
      <div className="board-grid" role="grid" aria-label="Tic tac toe board">
        {board.map((mark, index) => {
          const isWinning = winningLine.includes(index);
          const row = Math.floor(index / 3) + 1;
          const column = (index % 3) + 1;
          const disabled = !canPlay || Boolean(mark);
          return (
            <button
              className={`board-cell ${mark ? `has-${mark.toLowerCase()}` : ''} ${isWinning ? `is-winning winner-${winner?.toLowerCase()}` : ''}`}
              key={index}
              type="button"
              role="gridcell"
              aria-label={`Row ${row}, column ${column}: ${mark ? mark === 'X' ? 'cross' : 'circle' : `empty${canPlay ? `, place ${nextMark}` : ''}`}`}
              aria-disabled={disabled}
              disabled={disabled}
              onClick={() => onCellClick(index)}
            >
              {mark ? <MarkIcon mark={mark} className="cell-mark" /> : canPlay ? <MarkIcon mark={nextMark} className="cell-mark cell-placeholder" /> : <span className="cell-empty-dot" />}
            </button>
          );
        })}
      </div>
      {autoCompleting && <div className="auto-complete-note" role="status"><Sparkles size={14} />No winning line remains. Finishing the draw…</div>}
    </div>
  );
}

function RoundResult({ mode, winner, draw, headline, detail, scoreX, scoreO, drawScore, playerNameFor, nextStarter, onPlayAgain, remote, yourMark, youVoted, opponentVoted, opponentName, bothOnline, connection, onVote }) {
  const winnerLabel = winner ? playerNameFor(winner) : 'DRAW';
  return (
    <section className={`round-result ${draw ? 'result-draw' : ''}`} aria-live="polite">
      <div className="result-sparkle result-sparkle-left">✳</div><div className="result-sparkle result-sparkle-right">✦</div>
      <div className="result-main">
        <div className={`result-winner-mark ${draw ? 'is-draw' : ''}`}>{winner ? <MarkIcon mark={winner} /> : <span>=</span>}</div>
        <div className="result-copy"><span className="panel-overline">ROUND COMPLETE · {winnerLabel.toUpperCase()}</span><h2>{headline}</h2><p>{detail}</p></div>
      </div>
      <div className="result-score-line">
        <span><MarkIcon mark="X" />{playerNameFor('X')} <strong>{scoreX}</strong></span>
        <span className="result-draw-score">DRAWS <strong>{drawScore}</strong></span>
        <span><MarkIcon mark="O" />{playerNameFor('O')} <strong>{scoreO}</strong></span>
      </div>
      {remote ? (
        <div className="rematch-consensus">
          <div className="consensus-heading"><span className="panel-overline">NEXT ROUND</span><strong>Both players choose.</strong></div>
          <div className="consensus-players">
            <VoteStatus mark={yourMark} name="You" voted={Boolean(youVoted)} />
            <VoteStatus mark={otherMark(yourMark)} name={opponentName} voted={Boolean(opponentVoted)} />
          </div>
          {!bothOnline && <p className="vote-explanation">Both players need to be online before a rematch can begin.</p>}
          {bothOnline && <p className="vote-explanation">{youVoted ? `${opponentName} needs to agree. You can change your vote below.` : opponentVoted ? `${opponentName} is ready. Your agreement starts the next round.` : 'The next round begins only when you both agree.'}</p>}
          <button className={`primary-button rematch-button ${youVoted ? 'is-voted' : ''}`} type="button" disabled={!bothOnline || connection !== 'connected'} onClick={onVote}>
            {youVoted ? <><Check size={17} />You’re ready · cancel vote</> : opponentVoted ? <>Agree to the next round <ArrowRight size={17} /></> : <>I’m ready for another <ArrowRight size={17} /></>}
          </button>
        </div>
      ) : (
        <div className="result-actions">
          <span className="result-next-hint"><Sparkles size={14} />{mode === 'local' ? `${nextStarter} opens the next round.` : 'Your next round starts fresh.'}</span>
          <button className="primary-button" type="button" onClick={onPlayAgain}>Play again <ArrowRight size={17} /></button>
        </div>
      )}
    </section>
  );
}

function VoteStatus({ mark, name, voted }) {
  return (
    <div className={`vote-status ${voted ? 'is-ready' : ''}`}>
      <span className="vote-avatar"><MarkIcon mark={mark} /></span>
      <span className="vote-name"><strong>{name}</strong><small>{voted ? 'READY' : 'NOT YET'}</small></span>
      <span className="vote-check">{voted ? <Check size={14} /> : <span />}</span>
    </div>
  );
}

function RoomCard({ room, yourMark, connection, copied, copyInvite, onReconnect, onLeave }) {
  return (
    <section className="room-card panel">
      <div className="room-card-top"><span className="panel-overline">ROOM / {room.code}</span><span className={`room-live-dot ${connection === 'connected' ? 'is-online' : ''}`} /></div>
      <div className="room-code-share"><div><span>INVITE CODE</span><strong>{room.code}</strong></div><button type="button" onClick={copyInvite} className="copy-invite-button"><span>{copied ? 'Copied' : 'Copy invite'}</span>{copied ? <Check size={15} /> : <Copy size={15} />}</button></div>
      <div className="room-roster">
        {['X', 'O'].map((mark) => {
          const player = room.players[mark];
          return <div className="roster-player" key={mark}><span className={`roster-avatar avatar-${mark.toLowerCase()}`}><MarkIcon mark={mark} /></span><span className="roster-name"><strong>{player?.name || 'Waiting for a friend'}</strong><small>{mark === yourMark ? 'YOU · PLAYS ' + mark : 'PLAYS ' + mark}</small></span><i className={`online-indicator ${player?.online ? 'is-online' : ''}`} /></div>;
        })}
      </div>
      <div className="room-card-footer"><span><ShieldCheck size={13} />Only invited players</span>{connection === 'idle' && <button type="button" onClick={onReconnect}><RotateCcw size={13} />Reconnect</button>}<button type="button" onClick={onLeave} aria-label="Leave this room"><DoorOpen size={14} />Leave</button></div>
    </section>
  );
}

function ChatBubble({ message, mine, grouped }) {
  return (
    <div className={`chat-message-row ${mine ? 'is-mine' : 'is-theirs'} ${grouped ? 'is-grouped' : ''}`}>
      {!mine && <span className="chat-avatar-small">{!grouped && <MarkIcon mark={message.mark} />}</span>}
      <div className="chat-message-stack">
        {!grouped && <div className="chat-message-byline"><strong>{mine ? 'You' : message.name}</strong><time dateTime={message.sentAt}>{new Date(message.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>}
        <p className="chat-bubble">{message.text}</p>
      </div>
    </div>
  );
}

function LocalMatchCard({ mode, selectedMark, playerOneName, playerTwoName, botStats, localStats, totalGames, onClearRecords }) {
  return (
    <section className="stats-card panel">
      <div className="stats-card-heading"><span className="panel-overline">YOUR SCORECARD</span><span className="local-only-pill">THIS DEVICE</span></div>
      <h2>{mode === 'bot' ? 'Staying sharp.' : 'The rivalry so far.'}</h2>
      {mode === 'bot' ? (
        <>
          <div className="stats-columns"><div><strong>{botStats.wins}</strong><span>WON</span></div><div><strong>{botStats.draws}</strong><span>DREW</span></div><div><strong>{botStats.losses}</strong><span>LOST</span></div></div>
          <div className="record-rate"><span>Rounds played</span><strong>{totalGames}</strong></div>
          <p className="stats-footnote">The computer won’t give away a round.</p>
        </>
      ) : (
        <>
          <div className="local-score-list"><div><MarkIcon mark={selectedMark} /><span>{playerOneName.trim() || 'Player 1'}</span><strong>{localStats.player1}</strong></div><div><MarkIcon mark={otherMark(selectedMark)} /><span>{playerTwoName.trim() || 'Player 2'}</span><strong>{localStats.player2}</strong></div><div className="draw-list-row"><span>Draws</span><strong>{localStats.draws}</strong></div></div>
          <p className="stats-footnote">Players’ records stay on this device.</p>
        </>
      )}
      <button className="clear-score-button" type="button" onClick={onClearRecords}>Reset scorecard</button>
    </section>
  );
}

function ConfirmDialog({ title, detail, confirmLabel, onCancel, onConfirm }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <button className="dialog-close" type="button" onClick={onCancel} aria-label="Close"><X size={17} /></button>
        <span className="confirm-icon"><RotateCcw size={19} /></span>
        <p className="panel-overline">A QUICK CHECK</p><h2 id="confirm-title">{title}</h2><p>{detail}</p>
        <div className="confirm-actions"><button type="button" className="secondary-button" onClick={onCancel}>Keep playing</button><button type="button" className="primary-button" onClick={onConfirm}>{confirmLabel}</button></div>
      </section>
    </div>
  );
}

function RulesDialog({ onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="confirm-dialog rules-dialog" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close"><X size={17} /></button>
        <span className="confirm-icon"><Gamepad2 size={20} /></span><p className="panel-overline">THREE QUICK RULES</p><h2 id="rules-title">Easy to learn. Always one more.</h2>
        <div className="rules-steps"><p><span>01</span>Take turns placing a mark in an empty square.</p><p><span>02</span>Line up three across, down, or diagonally to win.</p><p><span>03</span>A full board with no line is a draw.</p></div>
        <p className="rules-perfect-note"><Bot size={16} />The computer plays perfectly. A draw is the best result against it.</p>
        <button type="button" className="primary-button rules-done" onClick={onClose}>Got it <Check size={16} /></button>
      </section>
    </div>
  );
}

function GameExperience() {
  const navigate = useNavigate();
  const location = useLocation();
  const roomActions = usePrivateRoom();
  const {
    room, yourMark, connection, actionPending, roomError, createRoom, joinRoom,
    resumeRoom, send, leaveRoom, clearRoomError,
  } = roomActions;

  const [selectedMark, setSelectedMark] = useState(() => readString('threefold-selected-mark', 'X') === 'O' ? 'O' : 'X');
  const [playerOneName, setPlayerOneName] = useState(() => readString('threefold-p1-name', 'Player 1'));
  const [playerTwoName, setPlayerTwoName] = useState(() => readString('threefold-p2-name', 'Player 2'));
  const [playerName, setPlayerName] = useState(() => readString('threefold-player-name', ''));
  const [joinCode, setJoinCode] = useState(() => normalizeCode(new URLSearchParams(window.location.search).get('room')));
  const [game, setGame] = useState(() => EMPTY_GAME());
  const [localRound, setLocalRound] = useState(1);
  const [localStarter, setLocalStarter] = useState('X');
  const [autoCompleting, setAutoCompleting] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [copied, setCopied] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showClearRecords, setShowClearRecords] = useState(false);
  const [botStats, setBotStats] = useState(() => {
    const stats = readValue('threefold-bot-stats', {}) || {};
    return { wins: Number(stats.wins) || 0, losses: Number(stats.losses) || 0, draws: Number(stats.draws) || 0 };
  });
  const [localStats, setLocalStats] = useState(() => {
    const stats = readValue('threefold-local-stats', {}) || {};
    return { player1: Number(stats.player1 ?? stats.X) || 0, player2: Number(stats.player2 ?? stats.O) || 0, draws: Number(stats.draws) || 0 };
  });
  const autoTimerRef = useRef(null);
  const autoRunRef = useRef(0);
  const [savedRoomOnLoad] = useState(() => getStoredRoom());
  const resumedCodeRef = useRef('');

  useEffect(() => writeValue('threefold-selected-mark', selectedMark), [selectedMark]);
  useEffect(() => writeValue('threefold-p1-name', playerOneName), [playerOneName]);
  useEffect(() => writeValue('threefold-p2-name', playerTwoName), [playerTwoName]);
  useEffect(() => writeValue('threefold-player-name', playerName), [playerName]);
  useEffect(() => writeValue('threefold-bot-stats', botStats), [botStats]);
  useEffect(() => writeValue('threefold-local-stats', localStats), [localStats]);

  const queryCode = normalizeCode(new URLSearchParams(location.search).get('room'));

  useEffect(() => {
    if (queryCode) setJoinCode(queryCode);
  }, [queryCode]);

  useEffect(() => {
    if (room || !queryCode || savedRoomOnLoad?.code !== queryCode || connection !== 'idle' || resumedCodeRef.current === queryCode) return;
    resumedCodeRef.current = queryCode;
    resumeRoom(savedRoomOnLoad);
  }, [connection, queryCode, resumeRoom, room, savedRoomOnLoad]);

  useEffect(() => {
    if (room?.code && location.pathname !== '/game/private') {
      navigate(`/game/private?room=${room.code}`, { replace: true });
    }
  }, [location.pathname, navigate, room?.code]);

  useEffect(() => {
    if (room || !queryCode || connection !== 'idle') return;
    if (location.pathname === '/' && savedRoomOnLoad?.code !== queryCode) {
      navigate(`/room?room=${queryCode}`, { replace: true });
    }
    if (location.pathname === '/game/private' && savedRoomOnLoad?.code !== queryCode) {
      navigate(`/room?room=${queryCode}`, { replace: true });
    }
  }, [connection, location.pathname, navigate, queryCode, room, savedRoomOnLoad]);

  useEffect(() => {
    if (room || location.pathname !== '/game/private' || queryCode || connection !== 'idle') return;
    navigate('/room', { replace: true });
  }, [connection, location.pathname, navigate, queryCode, room]);

  const clearAutoComplete = useCallback(() => {
    autoRunRef.current += 1;
    if (autoTimerRef.current) {
      window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    setAutoCompleting(false);
  }, []);

  useEffect(() => () => {
    autoRunRef.current += 1;
    if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
  }, []);

  const recordGameResult = useCallback((mode, outcome) => {
    if (mode === 'bot') {
      setBotStats((stats) => {
        const key = outcome.draw ? 'draws' : outcome.winner === selectedMark ? 'wins' : 'losses';
        return { ...stats, [key]: stats[key] + 1 };
      });
    } else if (mode === 'local') {
      setLocalStats((stats) => {
        if (outcome.draw) return { ...stats, draws: stats.draws + 1 };
        const winner = outcome.winner === selectedMark ? 'player1' : 'player2';
        return { ...stats, [winner]: stats[winner] + 1 };
      });
    }
  }, [selectedMark]);

  const startAutoComplete = useCallback((sequence, mode) => {
    if (!sequence.length) return;
    const runId = ++autoRunRef.current;
    setAutoCompleting(true);
    setAnnouncement('No winning line remains. Finishing the draw…');

    const fillNext = (step) => {
      if (runId !== autoRunRef.current) return;
      const move = sequence[step];
      setGame((current) => {
        if (current.board[move.index] !== null) return current;
        const nextBoard = [...current.board];
        nextBoard[move.index] = move.mark;
        const isLast = step === sequence.length - 1;
        return {
          board: nextBoard,
          turn: isLast ? move.mark : otherMark(move.mark),
          winner: null,
          winningLine: [],
        };
      });

      if (step === sequence.length - 1) {
        autoTimerRef.current = null;
        setAutoCompleting(false);
        setAnnouncement('Every remaining line was blocked. The round is a draw.');
        recordGameResult(mode, { winner: null, draw: true });
      } else {
        autoTimerRef.current = window.setTimeout(() => fillNext(step + 1), 105);
      }
    };

    autoTimerRef.current = window.setTimeout(() => fillNext(0), 115);
  }, [recordGameResult]);

  const applyLocalMove = useCallback((index, mark, mode) => {
    if (autoCompleting || game.board[index] !== null || game.turn !== mark || game.winner || getOutcome(game.board).draw) return;
    const nextBoard = [...game.board];
    nextBoard[index] = mark;
    const outcome = getOutcome(nextBoard);
    const nextTurn = outcome.winner || outcome.draw ? mark : otherMark(mark);
    setGame({ ...outcome, board: nextBoard, turn: nextTurn });

    if (outcome.winner || outcome.draw) {
      recordGameResult(mode, outcome);
      setAnnouncement(outcome.draw ? 'A full board. It’s a draw.' : `${mark === 'X' ? 'Cross' : 'Circle'} wins this round.`);
      return;
    }

    const emptyCount = nextBoard.filter((cell) => cell === null).length;
    if (emptyCount > 0 && emptyCount <= AUTO_COMPLETE_THRESHOLD && isInevitableDraw(nextBoard, nextTurn)) {
      startAutoComplete(getDrawCompletionSequence(nextBoard, nextTurn), mode);
    } else {
      setAnnouncement('');
    }
  }, [autoCompleting, game, recordGameResult, startAutoComplete]);

  function beginMatch(mode) {
    clearAutoComplete();
    setAnnouncement('');
    setLocalStarter('X');
    setLocalRound(1);
    setGame(EMPTY_GAME('X'));
    navigate(`/game/${mode}`);
  }

  function beginNextLocalRound(mode) {
    clearAutoComplete();
    setAnnouncement('');
    const starter = mode === 'local' ? otherMark(localStarter) : 'X';
    setLocalStarter(starter);
    setLocalRound((round) => round + 1);
    setGame(EMPTY_GAME(starter));
  }

  function resetCurrentGame(mode) {
    clearAutoComplete();
    setAnnouncement('');
    setGame(EMPTY_GAME(mode === 'local' ? localStarter : 'X'));
  }

  function goHome() {
    if (room || location.pathname === '/room' || location.pathname === '/game/private') leaveRoom();
    clearAutoComplete();
    setAnnouncement('');
    setGame(EMPTY_GAME('X'));
    setLocalRound(1);
    setLocalStarter('X');
    navigate('/', { replace: true });
  }

  async function copyInvite() {
    if (!room?.code) return;
    const inviteUrl = `${window.location.origin}/?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setCopied(false);
    }
  }

  function clearRecords(mode) {
    if (mode === 'bot') setBotStats({ wins: 0, losses: 0, draws: 0 });
    else setLocalStats({ player1: 0, player2: 0, draws: 0 });
    setShowClearRecords(false);
  }

  function reconnectToRoom() {
    if (!room || !yourMark) return;
    clearRoomError();
    resumeRoom({ code: room.code, name: room.players[yourMark]?.name || 'Player' });
  }

  const gameProps = {
    game,
    localRound,
    localStarter,
    applyLocalMove,
    reconnectToRoom,
    startNextLocalRound: beginNextLocalRound,
    resetCurrentGame,
    selectedMark,
    playerOneName,
    playerTwoName,
    botStats,
    localStats,
    autoCompleting,
    announcement,
    copied,
    copyInvite,
    onClearRecords: () => setShowClearRecords(true),
  };

  const handleHome = () => goHome();

  return (
    <div className="app-shell">
      <SiteHeader onHome={handleHome} onRules={() => setShowRules(true)} room={room} connection={connection} />
      <Routes>
        <Route path="/" element={<ModeSelectionPage />} />
        <Route path="/setup/:mode" element={<SetupRoute selectedMark={selectedMark} setSelectedMark={setSelectedMark} playerOneName={playerOneName} setPlayerOneName={setPlayerOneName} playerTwoName={playerTwoName} setPlayerTwoName={setPlayerTwoName} onStart={beginMatch} />} />
        <Route path="/room" element={<RoomEntryPage playerName={playerName} setPlayerName={setPlayerName} joinCode={joinCode} setJoinCode={setJoinCode} createRoom={createRoom} joinRoom={joinRoom} actionPending={actionPending} connection={connection} roomError={roomError} clearRoomError={clearRoomError} hasInvite={Boolean(queryCode)} />} />
        <Route path="/game/:mode" element={<GameRoute room={room} connection={connection} roomError={roomError} clearRoomError={clearRoomError} yourMark={yourMark} send={send} onHome={goHome} gameProps={gameProps} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <PageFooter />
      {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
      {showClearRecords && (
        <ConfirmDialog title="Clear your scorecard?" detail="This clears the saved record for the current mode on this device. Your current room and board are unchanged." confirmLabel="Clear scorecard" onCancel={() => setShowClearRecords(false)} onConfirm={() => clearRecords(location.pathname.includes('/bot') ? 'bot' : 'local')} />
      )}
    </div>
  );
}

export default function App() {
  return <BrowserRouter><GameExperience /></BrowserRouter>;
}
