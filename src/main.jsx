import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  Check,
  CircleHelp,
  Copy,
  DoorOpen,
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
import { getBestMove, getOutcome, otherMark } from './game/logic.js';
import './styles.css';

const EMPTY_GAME = (startingMark = 'X') => ({ board: Array(9).fill(null), turn: startingMark, winner: null, winningLine: [] });
const MODES = [
  { id: 'bot', label: 'Vs computer', shortLabel: 'Computer', Icon: Bot },
  { id: 'local', label: 'Same device', shortLabel: 'Pass & play', Icon: UsersRound },
  { id: 'private', label: 'Private room', shortLabel: 'Online room', Icon: Link2 },
];

function readStoredValue(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredValue(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The game still works if browser storage is unavailable.
  }
}

function readStoredString(key, fallback) {
  const value = readStoredValue(key, fallback);
  return typeof value === 'string' ? value : fallback;
}

function getIdentityToken() {
  try {
    const stored = window.localStorage.getItem('threefold-player-token');
    if (stored && /^[a-zA-Z0-9_-]{16,80}$/.test(stored)) return stored;
    const token = globalThis.crypto?.randomUUID?.().replaceAll('-', '')
      || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem('threefold-player-token', token);
    return token;
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

function getQueryRoomCode() {
  return new URLSearchParams(window.location.search).get('room')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || '';
}

function updateRoomUrl(code) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function MarkIcon({ mark, className = '' }) {
  if (mark === 'X') {
    return (
      <svg className={`mark-icon mark-x ${className}`} viewBox="0 0 64 64" aria-hidden="true">
        <path d="M13 13 51 51M51 13 13 51" />
      </svg>
    );
  }
  return (
    <svg className={`mark-icon mark-o ${className}`} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="19" />
    </svg>
  );
}

function Brand() {
  return (
    <a className="brand" href="/" aria-label="Threefold home">
      <span className="brand-mark" aria-hidden="true">
        <span className="brand-cross">×</span>
        <span className="brand-circle" />
      </span>
      <span className="brand-name">threefold<span>.</span></span>
    </a>
  );
}

function Modal({ title, eyebrow, children, onClose, actions }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="Close dialog">
          <X size={18} />
        </button>
        {eyebrow && <p className="eyebrow modal-eyebrow">{eyebrow}</p>}
        <h2 id="modal-title">{title}</h2>
        <div className="modal-copy">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </section>
    </div>
  );
}

function App() {
  const queryCodeOnLoad = useRef(getQueryRoomCode()).current;
  const savedRoomOnLoad = useRef(readStoredValue('threefold-active-room', null)).current;
  const shouldRestoreRoom = Boolean(queryCodeOnLoad && savedRoomOnLoad?.code === queryCodeOnLoad);
  const identityToken = useRef('');
  if (!identityToken.current) identityToken.current = getIdentityToken();

  const [mode, setMode] = useState(queryCodeOnLoad ? 'private' : 'bot');
  const [selectedMark, setSelectedMark] = useState(() => readStoredString('threefold-selected-mark', 'X') === 'O' ? 'O' : 'X');
  const [localStarter, setLocalStarter] = useState('X');
  const [game, setGame] = useState(EMPTY_GAME);
  const [localRound, setLocalRound] = useState(1);
  const [botStats, setBotStats] = useState(() => {
    const value = readStoredValue('threefold-bot-stats', {}) || {};
    return { wins: Number(value.wins) || 0, draws: Number(value.draws) || 0, losses: Number(value.losses) || 0 };
  });
  const [localStats, setLocalStats] = useState(() => {
    const value = readStoredValue('threefold-local-stats', {}) || {};
    return {
      player1: Number(value.player1 ?? value.X) || 0,
      player2: Number(value.player2 ?? value.O) || 0,
      draws: Number(value.draws) || 0,
    };
  });
  const [playerName, setPlayerName] = useState(() => readStoredString('threefold-player-name', ''));
  const [playerOneName, setPlayerOneName] = useState(() => readStoredString('threefold-p1-name', 'Player 1'));
  const [playerTwoName, setPlayerTwoName] = useState(() => readStoredString('threefold-p2-name', 'Player 2'));
  const [joinCode, setJoinCode] = useState(queryCodeOnLoad);
  const [room, setRoom] = useState(null);
  const [yourMark, setYourMark] = useState(null);
  const [connection, setConnection] = useState('idle');
  const [roomError, setRoomError] = useState('');
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [modal, setModal] = useState(null);
  const [pendingMark, setPendingMark] = useState(null);

  const socketRef = useRef(null);
  const socketGeneration = useRef(0);
  const reconnectTimer = useRef(null);
  const reconnectAttempts = useRef(0);
  const currentRoomRef = useRef(null);
  const chatEndRef = useRef(null);
  const copiedTimer = useRef(null);

  const connectToRoom = useCallback((firstAction) => {
    if (typeof WebSocket === 'undefined') {
      setRoomError('This browser does not support live rooms. Try a recent version of Chrome, Safari, Firefox, or Edge.');
      return;
    }

    if (reconnectTimer.current) {
      window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (firstAction.type === 'resume_room' && !currentRoomRef.current) {
      currentRoomRef.current = {
        code: firstAction.code,
        name: savedRoomOnLoad?.name || playerName || 'Player',
      };
    } else if (firstAction.type !== 'resume_room') {
      currentRoomRef.current = null;
    }
    setRoomError('');
    setFormError('');
    setConnection('connecting');

    const previousSocket = socketRef.current;
    socketRef.current = null;
    if (previousSocket && previousSocket.readyState < WebSocket.CLOSING) previousSocket.close(1000, 'Changing room');

    const openSocket = (action) => {
      const generation = ++socketGeneration.current;
      const secure = window.location.protocol === 'https:';
      const socket = new WebSocket(`${secure ? 'wss' : 'ws'}://${window.location.host}/ws`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (generation !== socketGeneration.current) return;
        setConnection('connected');
        const resumedRoom = currentRoomRef.current;
        const message = action.type === 'resume_room' && resumedRoom
          ? { ...action, token: identityToken.current, name: resumedRoom.name || playerName || 'Player' }
          : action;
        socket.send(JSON.stringify(message));
      };

      socket.onmessage = (event) => {
        if (generation !== socketGeneration.current) return;
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          setRoomError('The room sent an unreadable update. Please reconnect.');
          return;
        }

        if (message.type === 'room_state') {
          currentRoomRef.current = {
            code: message.room.code,
            name: currentRoomRef.current?.name || action.name || playerName || savedRoomOnLoad?.name || 'Player',
          };
          reconnectAttempts.current = 0;
          if (reconnectTimer.current) {
            window.clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
          }
          setRoom(message.room);
          setYourMark(message.yourMark);
          setJoinCode(message.room.code);
          setConnection('connected');
          setRoomError('');
          writeStoredValue('threefold-active-room', { code: message.room.code, name: currentRoomRef.current.name });
          updateRoomUrl(message.room.code);
          return;
        }

        if (message.type === 'error') {
          setRoomError(message.message || 'Something went wrong. Please try again.');
          if (action.type === 'resume_room') {
            currentRoomRef.current = null;
            setRoom(null);
            setYourMark(null);
            setConnection('idle');
            writeStoredValue('threefold-active-room', null);
            updateRoomUrl('');
          }
        }
      };

      socket.onerror = () => {
        if (generation === socketGeneration.current) {
          setRoomError('Could not reach the game server. Check your connection and try again.');
        }
      };

      socket.onclose = (event) => {
        if (generation !== socketGeneration.current) return;
        socketRef.current = null;
        const activeRoom = currentRoomRef.current;
        if (!activeRoom?.code) {
          setConnection('idle');
          return;
        }
        if (event.code === 4001) {
          setConnection('idle');
          setRoomError('This room is open in another tab. Continue there, or reconnect here to take over.');
          return;
        }

        setConnection('reconnecting');
        const wait = Math.min(800 * (2 ** reconnectAttempts.current), 8_000);
        reconnectAttempts.current += 1;
        reconnectTimer.current = window.setTimeout(() => {
          reconnectTimer.current = null;
          if (!currentRoomRef.current?.code) return;
          openSocket({ type: 'resume_room', code: currentRoomRef.current.code });
        }, wait);
      };
    };

    openSocket(firstAction);
  }, [playerName, savedRoomOnLoad]);

  useEffect(() => {
    writeStoredValue('threefold-bot-stats', botStats);
  }, [botStats]);

  useEffect(() => {
    writeStoredValue('threefold-selected-mark', selectedMark);
  }, [selectedMark]);

  useEffect(() => {
    writeStoredValue('threefold-local-stats', localStats);
  }, [localStats]);

  useEffect(() => {
    writeStoredValue('threefold-player-name', playerName);
  }, [playerName]);

  useEffect(() => {
    writeStoredValue('threefold-p1-name', playerOneName);
  }, [playerOneName]);

  useEffect(() => {
    writeStoredValue('threefold-p2-name', playerTwoName);
  }, [playerTwoName]);

  useEffect(() => {
    if (!shouldRestoreRoom) return;
    connectToRoom({ type: 'resume_room', code: savedRoomOnLoad.code });
  }, [connectToRoom, savedRoomOnLoad, shouldRestoreRoom]);

  useEffect(() => () => {
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
    if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    socketGeneration.current += 1;
    socketRef.current?.close(1000, 'Page closed');
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [room?.messages?.length]);

  const botMark = otherMark(selectedMark);
  const isFinished = mode === 'private'
    ? room?.status === 'finished'
    : Boolean(game.winner || getOutcome(game.board).draw);
  const currentBoard = mode === 'private' && room ? room.board : game.board;
  const currentTurn = mode === 'private' && room ? room.turn : game.turn;
  const currentWinner = mode === 'private' && room ? room.winner : game.winner;
  const winningLine = mode === 'private' && room ? room.winningLine : game.winningLine;
  const currentRound = mode === 'private' && room ? room.round : localRound;
  const botThinking = mode === 'bot' && !isFinished && game.turn === botMark;
  const hasRoom = mode === 'private' && Boolean(room);
  const bothRoomPlayersOnline = Boolean(room?.players?.X?.online && room?.players?.O?.online);
  const canPlay = mode === 'private'
    ? Boolean(room && room.status === 'playing' && connection === 'connected' && currentTurn === yourMark)
    : mode === 'bot'
      ? !isFinished && game.turn === selectedMark
      : !isFinished;

  const recordGameResult = useCallback((outcome) => {
    if (mode === 'bot') {
      setBotStats((current) => {
        const key = outcome.draw ? 'draws' : outcome.winner === selectedMark ? 'wins' : 'losses';
        return { ...current, [key]: current[key] + 1 };
      });
      return;
    }
    setLocalStats((current) => {
      if (outcome.draw) return { ...current, draws: current.draws + 1 };
      const winner = outcome.winner === selectedMark ? 'player1' : 'player2';
      return { ...current, [winner]: current[winner] + 1 };
    });
  }, [mode, selectedMark]);

  const applyLocalMove = useCallback((index, mark) => {
    if (isFinished || game.board[index] !== null || game.turn !== mark) return;
    const nextBoard = [...game.board];
    nextBoard[index] = mark;
    const outcome = getOutcome(nextBoard);
    setGame({
      board: nextBoard,
      turn: outcome.winner || outcome.draw ? mark : otherMark(mark),
      winner: outcome.winner,
      winningLine: outcome.winningLine,
    });
    if (outcome.winner || outcome.draw) recordGameResult(outcome);
  }, [game, isFinished, recordGameResult]);

  useEffect(() => {
    if (mode !== 'bot' || game.winner || game.board.every(Boolean) || game.turn !== botMark) return undefined;
    const move = getBestMove(game.board, botMark);
    if (move < 0) return undefined;
    const timer = window.setTimeout(() => applyLocalMove(move, botMark), 460);
    return () => window.clearTimeout(timer);
  }, [applyLocalMove, botMark, game, mode]);

  function sendRoomMessage(message) {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) {
      setRoomError('You’re not connected to the room yet. Reconnecting now…');
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }

  function leaveRoom() {
    if (reconnectTimer.current) {
      window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    socketGeneration.current += 1;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Left room');
    currentRoomRef.current = null;
    reconnectAttempts.current = 0;
    setRoom(null);
    setYourMark(null);
    setConnection('idle');
    setRoomError('');
    setChatDraft('');
    writeStoredValue('threefold-active-room', null);
    updateRoomUrl('');
  }

  function changeMode(nextMode) {
    if (nextMode === mode) return;
    if (mode === 'private') leaveRoom();
    setMode(nextMode);
    setLocalStarter('X');
    setGame(EMPTY_GAME('X'));
    setLocalRound(1);
    setRoomError('');
    setFormError('');
  }

  function selectMark(mark) {
    if (mark === selectedMark) return;
    if (game.board.some(Boolean) && !isFinished) {
      setPendingMark(mark);
      setModal('change-mark');
      return;
    }
    setSelectedMark(mark);
    setLocalStarter('X');
    setGame(EMPTY_GAME('X'));
    setLocalRound((round) => game.board.some(Boolean) ? round + 1 : 1);
  }

  function confirmMarkChange() {
    if (!pendingMark) return;
    setSelectedMark(pendingMark);
    setPendingMark(null);
    setLocalStarter('X');
    setGame(EMPTY_GAME('X'));
    setLocalRound((round) => round + 1);
    setModal(null);
  }

  function startFreshLocalRound() {
    const nextStarter = mode === 'local' ? otherMark(localStarter) : 'X';
    setLocalStarter(nextStarter);
    setGame(EMPTY_GAME(nextStarter));
    setLocalRound((round) => round + 1);
    setPendingMark(null);
    setModal(null);
  }

  function handleReset() {
    if (mode === 'private') {
      if (room?.status === 'finished') sendRoomMessage({ type: 'new_round' });
      return;
    }
    if (game.board.some(Boolean) && !isFinished) {
      setModal('reset-round');
      return;
    }
    startFreshLocalRound();
  }

  function handleBoardMove(index) {
    if (!canPlay || currentBoard[index] !== null) return;
    if (mode === 'private') sendRoomMessage({ type: 'move', index });
    else applyLocalMove(index, game.turn);
  }

  function handleRoomCreate(event) {
    event.preventDefault();
    const name = playerName.trim().replace(/\s+/g, ' ').slice(0, 18);
    if (!name) {
      setFormError('Add a name so your friend knows who’s hosting.');
      return;
    }
    setPlayerName(name);
    connectToRoom({ type: 'create_room', name, token: identityToken.current });
  }

  function handleRoomJoin(event) {
    event.preventDefault();
    const name = playerName.trim().replace(/\s+/g, ' ').slice(0, 18);
    const code = joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (!name) {
      setFormError('Add your name before joining the room.');
      return;
    }
    if (code.length !== 6) {
      setFormError('Room codes are six characters long.');
      return;
    }
    setPlayerName(name);
    setJoinCode(code);
    connectToRoom({ type: 'join_room', code, name, token: identityToken.current });
  }

  async function copyInvite() {
    if (!room?.code) return;
    const invite = `${window.location.origin}/?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1_800);
    } catch {
      setRoomError('Clipboard access is blocked in this browser. Copy the room code instead.');
    }
  }

  function submitChat(event) {
    event.preventDefault();
    const text = chatDraft.trim().slice(0, 300);
    if (!text || !room || connection !== 'connected') return;
    if (sendRoomMessage({ type: 'chat', text })) setChatDraft('');
  }

  function resetRecords() {
    if (mode === 'bot') setBotStats({ wins: 0, draws: 0, losses: 0 });
    else setLocalStats({ player1: 0, player2: 0, draws: 0 });
    setModal(null);
    setPendingMark(null);
  }

  function closeModal() {
    setModal(null);
    setPendingMark(null);
  }

  function playerLabel(mark) {
    if (mode === 'private') {
      return room?.players?.[mark]?.name || (mark === 'X' ? 'Host' : 'Friend');
    }
    if (mode === 'bot') return mark === selectedMark ? 'You' : 'Computer';
    const firstMark = selectedMark;
    return mark === firstMark ? (playerOneName.trim() || 'Player 1') : (playerTwoName.trim() || 'Player 2');
  }

  function turnCopy() {
    if (mode === 'private') {
      if (!room) return connection === 'connecting' ? 'Connecting to room…' : 'Create a room or enter an invite code';
      if (connection === 'reconnecting') return 'Reconnecting to your room…';
      if (connection === 'idle') return 'Room connection paused';
      if (room.status === 'waiting') return 'Your room is ready for a friend';
      if (room.status === 'finished') {
        if (!room.winner) return 'A well-played draw';
        return `${playerLabel(room.winner)} takes the round`;
      }
      return room.turn === yourMark ? 'Your turn' : `${playerLabel(room.turn)} is up`;
    }
    if (isFinished) {
      if (!currentWinner) return 'A well-played draw';
      if (mode === 'bot' && currentWinner !== selectedMark) return 'The computer takes the round';
      return `${playerLabel(currentWinner)} takes the round`;
    }
    if (mode === 'bot') return botThinking ? 'The computer is thinking…' : 'Your turn';
    return `${playerLabel(game.turn)} to move`;
  }

  const roomStatusLabel = mode !== 'private'
    ? 'Ready to play'
    : connection === 'connecting'
      ? 'Connecting to room…'
      : !hasRoom
        ? 'Ready to play'
        : connection === 'connected'
          ? bothRoomPlayersOnline ? 'Room live · 2 players' : room?.players?.O ? 'One player away' : 'Room open · invite a friend'
          : connection === 'reconnecting' ? 'Reconnecting…' : 'Connection paused';
  const totalBotGames = botStats.wins + botStats.draws + botStats.losses;
  const botWinRate = totalBotGames ? Math.round((botStats.wins / totalBotGames) * 100) : 0;
  const remoteWaiting = mode === 'private' && room?.status === 'waiting';
  const turnMark = currentWinner || currentTurn;
  const scores = mode === 'private' && room
    ? { X: room.scores.X, O: room.scores.O, draws: room.scores.draws }
    : mode === 'bot'
      ? { X: selectedMark === 'X' ? botStats.wins : botStats.losses, O: selectedMark === 'O' ? botStats.wins : botStats.losses, draws: botStats.draws }
      : { X: selectedMark === 'X' ? localStats.player1 : localStats.player2, O: selectedMark === 'O' ? localStats.player1 : localStats.player2, draws: localStats.draws };

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <div className={`connection-pill ${connection === 'reconnecting' ? 'is-reconnecting' : ''}`}>
            {hasRoom && connection !== 'reconnecting' ? <Wifi size={15} /> : connection === 'reconnecting' ? <WifiOff size={15} /> : <span className="status-dot" />}
            <span>{roomStatusLabel}</span>
          </div>
          <button className="help-button" type="button" onClick={() => setModal('rules')}>
            <CircleHelp size={16} />
            <span>How to play</span>
          </button>
        </div>
      </header>

      <main>
        <section className="welcome-row">
          <div className="welcome-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> THE LITTLE GAME THAT NEVER GETS OLD</p>
            <h1>Make your <em>move.</em></h1>
            <p className="welcome-subtitle">A familiar little challenge. Pick your people, find your rhythm, and play another round.</p>
          </div>
          <div className="welcome-note" aria-label="Game promise">
            <span className="note-icon"><Sparkles size={17} /></span>
            <span><strong>Quick to learn.</strong><br />Hard to put down.</span>
          </div>
        </section>

        <section className="play-layout" aria-label="Tic tac toe game">
          <div className="game-column">
            <section className="game-card">
              <div className="game-card-top">
                <div className="mode-switch" role="tablist" aria-label="Choose a game mode">
                  {MODES.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={mode === id}
                      className={`mode-tab ${mode === id ? 'is-active' : ''}`}
                      onClick={() => changeMode(id)}
                    >
                      <Icon size={16} strokeWidth={2.1} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <div className="round-number"><span>ROUND</span><strong>{String(currentRound).padStart(2, '0')}</strong></div>
              </div>

              <div className={`turn-banner ${isFinished ? 'is-finished' : ''} ${remoteWaiting ? 'is-waiting' : ''}`} aria-live="polite">
                <div className="turn-mark-wrap">
                  {isFinished && !currentWinner ? <span className="draw-mark">=</span> : <MarkIcon mark={turnMark} className="turn-mark" />}
                </div>
                <div className="turn-copy">
                  <span className="turn-eyebrow">{isFinished ? 'ROUND COMPLETE' : mode === 'bot' && botThinking ? 'THINKING' : 'ON THE BOARD'}</span>
                  <strong>{turnCopy()}</strong>
                </div>
                {mode === 'bot' && !isFinished && <span className="perfect-tag"><ShieldCheck size={13} /> PERFECT PLAY</span>}
                {mode === 'private' && room && <span className={`online-tag ${bothRoomPlayersOnline ? 'is-online' : ''}`}><span />{bothRoomPlayersOnline ? '2 ONLINE' : '1 ONLINE'}</span>}
              </div>

              <div className="scoreboard" aria-label="Match scoreboard">
                <div className={`score-item score-x ${turnMark === 'X' && !isFinished ? 'is-current' : ''}`}>
                  <div className="score-player"><MarkIcon mark="X" className="score-mark" /><span>{playerLabel('X')}<small>PLAYS X</small></span></div>
                  <strong className="score-value">{scores.X}</strong>
                </div>
                <div className={`score-item score-draw ${isFinished && !currentWinner ? 'is-current' : ''}`}>
                  <span className="draw-score-label">DRAWS</span>
                  <strong className="score-value">{scores.draws}</strong>
                </div>
                <div className={`score-item score-o ${turnMark === 'O' && !isFinished ? 'is-current' : ''}`}>
                  <div className="score-player"><MarkIcon mark="O" className="score-mark" /><span>{playerLabel('O')}<small>PLAYS O</small></span></div>
                  <strong className="score-value">{scores.O}</strong>
                </div>
              </div>

              <div className={`board-frame ${mode === 'private' && !room ? 'board-is-empty' : ''}`}>
                <div className="board-grid" role="grid" aria-label="Tic tac toe board">
                  {currentBoard.map((mark, index) => {
                    const isWinningCell = winningLine.includes(index);
                    const row = Math.floor(index / 3) + 1;
                    const column = (index % 3) + 1;
                    const cellTurn = mode === 'private' ? yourMark : mode === 'bot' ? selectedMark : currentTurn;
                    const cellDisabled = !canPlay || Boolean(mark);
                    return (
                      <button
                        key={index}
                        className={`board-cell ${mark ? `has-${mark.toLowerCase()}` : ''} ${isWinningCell ? 'is-winning' : ''} ${isWinningCell && currentWinner === 'X' ? 'winner-x' : ''} ${isWinningCell && currentWinner === 'O' ? 'winner-o' : ''}`}
                        type="button"
                        role="gridcell"
                        aria-label={`Row ${row}, column ${column}: ${mark ? mark === 'X' ? 'cross' : 'circle' : `empty${cellTurn ? `, place ${cellTurn}` : ''}`}`}
                        aria-disabled={cellDisabled}
                        disabled={cellDisabled}
                        onClick={() => handleBoardMove(index)}
                      >
                        {mark
                          ? <MarkIcon mark={mark} className="cell-mark" />
                          : <span className="cell-hover-mark">{cellTurn && canPlay && <MarkIcon mark={cellTurn} className="cell-mark" />}</span>}
                      </button>
                    );
                  })}
                </div>
                {mode === 'private' && !room && (
                  <div className="board-empty-message">
                    <span className="empty-emblem"><Link2 size={19} /></span>
                    <strong>Your board is waiting</strong>
                    <span>Host a room or join a friend to play here.</span>
                  </div>
                )}
                {remoteWaiting && (
                  <div className="board-waiting-message">
                    <span className="waiting-pulse" />
                    <span>Waiting for your friend to join</span>
                  </div>
                )}
              </div>

              <div className="game-card-bottom">
                <div className="move-count">
                  <span className="move-dot" />
                  {mode === 'private' && !room
                    ? 'PRIVATE MATCH'
                    : `${currentBoard.filter(Boolean).length} OF 9 MOVES`}
                </div>
                <button
                  className={`reset-button ${isFinished && (mode !== 'private' || connection === 'connected') ? 'is-next-round' : ''}`}
                  type="button"
                  onClick={handleReset}
                  disabled={mode === 'private' && (!room || !isFinished || connection !== 'connected' || !room.players.X?.online || !room.players.O?.online)}
                  aria-label={isFinished ? 'Start the next round' : 'Reset this round'}
                >
                  {isFinished ? <ArrowRight size={15} /> : <RotateCcw size={15} />}
                  <span>{isFinished ? 'Next round' : 'Reset round'}</span>
                </button>
              </div>
            </section>

            <div className="under-card-note">
              <span className="tiny-star">✳</span>
              <span>Made for one more game.</span>
              <span className="under-note-divider" />
              <span>Good moves, good company.</span>
            </div>
          </div>

          <aside className="side-column">
            {mode === 'bot' && (
              <section className="side-card opponent-card">
                <div className="card-kicker"><span className="kicker-icon bot-icon"><Bot size={15} /></span> THE COMPUTER</div>
                <div className="bot-title-row"><h2>A worthy<br />opponent.</h2><span className="bot-portrait"><Bot size={27} strokeWidth={1.65} /></span></div>
                <p className="side-description">No easy outs here. The computer searches every line and never misses a winning move.</p>
                <div className="difficulty-row"><span className="difficulty-dot" /><strong>UNBEATABLE</strong><span className="difficulty-separator">·</span><span>perfect play</span></div>
                <div className="side-divider" />
                <div className="mark-picker-heading"><span>Your mark</span><small>X always opens</small></div>
                <div className="mark-picker" role="group" aria-label="Choose your mark">
                  {['X', 'O'].map((mark) => (
                    <button key={mark} type="button" className={`mark-option ${selectedMark === mark ? 'is-selected' : ''}`} aria-pressed={selectedMark === mark} onClick={() => selectMark(mark)}>
                      <MarkIcon mark={mark} className="option-mark" />
                      <span>{mark === selectedMark ? 'YOU' : mark === 'X' ? 'CROSS' : 'CIRCLE'}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {mode === 'local' && (
              <section className="side-card local-card">
                <div className="card-kicker"><span className="kicker-icon local-icon"><UsersRound size={15} /></span> PASS & PLAY</div>
                <h2>Same board.<br />Friendly rivalry.</h2>
                <p className="side-description">Hand the screen over when the turn changes. No accounts, no waiting—just the two of you.</p>
                <label className="text-field-label" htmlFor="player-one-name">PLAYER 1</label>
                <div className="name-field"><MarkIcon mark={selectedMark} className="name-field-mark" /><input id="player-one-name" value={playerOneName} maxLength={18} onChange={(event) => setPlayerOneName(event.target.value)} /></div>
                <label className="text-field-label" htmlFor="player-two-name">PLAYER 2</label>
                <div className="name-field"><MarkIcon mark={otherMark(selectedMark)} className="name-field-mark" /><input id="player-two-name" value={playerTwoName} maxLength={18} onChange={(event) => setPlayerTwoName(event.target.value)} /></div>
                <div className="side-divider" />
                <div className="mark-picker-heading"><span>Player 1 plays as</span><small>Starter alternates</small></div>
                <div className="mark-picker compact-picker" role="group" aria-label="Choose player one's mark">
                  {['X', 'O'].map((mark) => (
                    <button key={mark} type="button" className={`mark-option ${selectedMark === mark ? 'is-selected' : ''}`} aria-pressed={selectedMark === mark} onClick={() => selectMark(mark)}>
                      <MarkIcon mark={mark} className="option-mark" /><span>{mark}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {mode === 'private' && !room && (
              <section className="side-card room-setup-card">
                <div className="card-kicker"><span className="kicker-icon room-icon"><Link2 size={15} /></span> PRIVATE ROOM</div>
                <h2>Bring your<br />favorite rival.</h2>
                <p className="side-description">Create a room and share the invite, or enter a six-character code from a friend.</p>
                <label className="text-field-label" htmlFor="room-player-name">YOUR NAME</label>
                <input className="form-input name-input" id="room-player-name" placeholder="e.g. Alex" maxLength={18} value={playerName} onChange={(event) => { setPlayerName(event.target.value); setFormError(''); }} />
                <button className="primary-action" type="button" onClick={handleRoomCreate} disabled={connection === 'connecting'}>
                  {connection === 'connecting' ? <span className="button-spinner" /> : <Link2 size={16} />}
                  <span>{connection === 'connecting' ? 'Creating room…' : 'Create a room'}</span>
                  {connection !== 'connecting' && <ArrowUpRight size={16} className="button-arrow" />}
                </button>
                <div className="form-separator"><span /> <small>OR JOIN A FRIEND</small> <span /></div>
                <form className="join-form" onSubmit={handleRoomJoin}>
                  <label className="text-field-label" htmlFor="join-room-code">ROOM CODE</label>
                  <div className="join-input-row">
                    <input className="form-input code-input" id="join-room-code" placeholder="ABC123" autoComplete="off" maxLength={6} value={joinCode} onChange={(event) => { setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setFormError(''); }} />
                    <button className="join-button" type="submit" aria-label="Join room" disabled={connection === 'connecting'}><ArrowRight size={18} /></button>
                  </div>
                </form>
                {queryCodeOnLoad && <p className="invite-hint"><Link2 size={13} /> You’ve got an invite. Enter your name to join.</p>}
                {(formError || roomError) && <p className="inline-error" role="alert">{formError || roomError}</p>}
                <div className="privacy-note"><ShieldCheck size={14} /><span>Just the two of you. Rooms are private by code.</span></div>
              </section>
            )}

            {mode === 'private' && room && (
              <>
                <section className="side-card room-details-card">
                  <div className="card-kicker"><span className="kicker-icon room-icon"><Link2 size={15} /></span> YOUR PRIVATE ROOM</div>
                  <h2>{bothRoomPlayersOnline ? 'You’re both in.' : room.players.O ? 'A player stepped away.' : 'Room is ready.'}</h2>
                  <p className="side-description">Send your invite to bring someone into the next round.</p>
                  <div className="room-code-box">
                    <div><span>ROOM CODE</span><strong>{room.code}</strong></div>
                    <button className="copy-button" type="button" onClick={copyInvite} aria-label="Copy room invite link">
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                      <span>{copied ? 'COPIED' : 'COPY INVITE'}</span>
                    </button>
                  </div>
                  <div className="room-players-list">
                    {['X', 'O'].map((mark) => {
                      const player = room.players[mark];
                      return <div className="room-player-row" key={mark}>
                        <div className={`player-avatar avatar-${mark.toLowerCase()}`}><MarkIcon mark={mark} /></div>
                        <div className="player-row-name"><strong>{player?.name || (mark === 'O' ? 'Waiting for a friend' : 'Host')}</strong><span>{mark === yourMark ? 'YOU' : mark === 'O' && !player ? 'INVITED WITH CODE' : 'PLAYER'}</span></div>
                        <span className={`player-presence ${player?.online ? 'is-online' : ''}`} title={player?.online ? 'Online' : 'Offline'} />
                      </div>;
                    })}
                  </div>
                  {roomError && <p className="inline-error" role="alert">{roomError}</p>}
                  {connection === 'idle' && <button className="text-action reconnect-action" type="button" onClick={() => connectToRoom({ type: 'resume_room', code: room.code })}><RotateCcw size={14} /> Reconnect to room</button>}
                  <button className="text-action leave-action" type="button" onClick={leaveRoom}><DoorOpen size={15} /> Leave this room</button>
                </section>

                <section className="side-card chat-card">
                  <div className="chat-header"><div><div className="card-kicker"><span className="kicker-icon chat-icon"><MessageCircle size={15} /></span> LITTLE SIDE CHAT</div><h2>Say hello.</h2></div><span className="chat-live"><span /> LIVE</span></div>
                  <div className="chat-messages" aria-live="polite" aria-label="Room chat messages">
                    {room.messages.length === 0 ? (
                      <div className="chat-empty"><span className="chat-empty-icon"><MessageCircle size={17} /></span><strong>{bothRoomPlayersOnline ? 'Break the ice.' : 'A little quiet in here.'}</strong><span>{bothRoomPlayersOnline ? 'Send a quick hello before the first move.' : 'Messages will be here when your friend arrives.'}</span></div>
                    ) : room.messages.map((message) => (
                      <div key={message.id} className={`chat-message ${message.mark === yourMark ? 'is-mine' : ''}`}>
                        <div className="message-meta"><span>{message.mark === yourMark ? 'YOU' : message.name}</span><time dateTime={message.sentAt}>{new Date(message.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>
                        <p>{message.text}</p>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <form className="chat-form" onSubmit={submitChat}>
                    <label className="visually-hidden" htmlFor="chat-message">Write a chat message</label>
                    <input id="chat-message" value={chatDraft} maxLength={300} placeholder="Write a message…" onChange={(event) => setChatDraft(event.target.value)} disabled={connection !== 'connected'} />
                    <button type="submit" aria-label="Send message" disabled={!chatDraft.trim() || connection !== 'connected'}><Send size={16} /></button>
                  </form>
                  {connection === 'reconnecting' && <p className="chat-connection-note"><span className="waiting-pulse" /> Reconnecting to live chat…</p>}
                </section>
              </>
            )}

            {mode !== 'private' && (
              <section className="side-card record-card">
                <div className="record-heading">
                  <div><div className="card-kicker"><span className="kicker-icon record-icon"><Sparkles size={15} /></span> YOUR SCORECARD</div><h2>On the books.</h2></div>
                  <span className="record-device">THIS DEVICE</span>
                </div>
                {mode === 'bot' ? (
                  <>
                    <div className="record-stats">
                      <div><strong>{botStats.wins}</strong><span>WON</span></div>
                      <div><strong>{botStats.draws}</strong><span>DREW</span></div>
                      <div><strong>{botStats.losses}</strong><span>LOST</span></div>
                    </div>
                    <div className="win-rate-row"><span>Win rate</span><strong>{botWinRate}%</strong><div className="win-rate-track"><i style={{ width: `${botWinRate}%` }} /></div></div>
                    <p className="record-footnote">{totalBotGames ? `${totalBotGames} ${totalBotGames === 1 ? 'round' : 'rounds'} against perfect play` : 'Your first round is waiting.'}</p>
                  </>
                ) : (
                  <>
                    <div className="local-record">
                      <div className="local-record-row"><span className="local-record-player"><MarkIcon mark={selectedMark} className="local-record-mark" />{playerOneName.trim() || 'Player 1'}</span><strong>{localStats.player1}</strong></div>
                      <div className="local-record-row"><span className="local-record-player"><MarkIcon mark={otherMark(selectedMark)} className="local-record-mark" />{playerTwoName.trim() || 'Player 2'}</span><strong>{localStats.player2}</strong></div>
                      <div className="local-draw-row"><span>Draws</span><strong>{localStats.draws}</strong></div>
                    </div>
                    <p className="record-footnote">Round scores stay on this device.</p>
                  </>
                )}
                <button className="text-action clear-records" type="button" onClick={() => setModal('reset-stats')}>Reset scorecard</button>
              </section>
            )}

            {mode === 'private' && !room && (
              <div className="room-feature-note"><span className="feature-lock"><ShieldCheck size={15} /></span><div><strong>Private by design</strong><span>Your room code is your invite. No public matchmaking or account needed.</span></div></div>
            )}
          </aside>
        </section>

        <section className="bottom-strip" aria-label="Game details">
          <div className="bottom-fact"><span className="fact-index">01</span><span>Three in a row wins</span></div>
          <span className="bottom-separator" />
          <div className="bottom-fact"><span className="fact-index">02</span><span>Full board? It’s a draw</span></div>
          <span className="bottom-separator" />
          <div className="bottom-fact"><span className="fact-index">03</span><span>Always room for a rematch</span></div>
          <button className="bottom-help" type="button" onClick={() => setModal('rules')}><BookOpen size={14} /> The rules <ArrowUpRight size={13} /></button>
        </section>
      </main>

      <footer className="page-footer"><Brand /><span>A tiny classic, made to play well.</span><span className="footer-heart">✳</span></footer>

      {modal === 'rules' && (
        <Modal title="The rules are simple." eyebrow="A VERY QUICK REFRESHER" onClose={closeModal} actions={<button className="primary-action modal-primary" type="button" onClick={closeModal}>Got it <ArrowRight size={16} /></button>}>
          <div className="rules-list">
            <div><span>01</span><p>Take turns placing Xs and Os in an empty square.</p></div>
            <div><span>02</span><p>Line up three marks across, down, or diagonally to win.</p></div>
            <div><span>03</span><p>If the board fills first, it’s a draw. Shake hands and play again.</p></div>
          </div>
          <div className="rules-note"><Bot size={17} /><p>In computer mode, the opponent plays perfectly. You can draw—but you can’t beat it.</p></div>
        </Modal>
      )}

      {modal === 'reset-round' && (
        <Modal title="Start this round over?" eyebrow="A QUICK RESET" onClose={closeModal} actions={(
          <>
            <button className="secondary-action" type="button" onClick={closeModal}>Keep playing</button>
            <button className="primary-action danger-action" type="button" onClick={startFreshLocalRound}>Reset round <RotateCcw size={15} /></button>
          </>
        )}>
          <p>Your moves in this round will be cleared. The scorecard will stay just as it is.</p>
        </Modal>
      )}

      {modal === 'change-mark' && (
        <Modal title="Change your mark?" eyebrow="START A FRESH ROUND" onClose={closeModal} actions={(
          <>
            <button className="secondary-action" type="button" onClick={closeModal}>Keep this round</button>
            <button className="primary-action" type="button" onClick={confirmMarkChange}>Change mark <ArrowRight size={15} /></button>
          </>
        )}>
          <p>Changing your mark clears the moves on this board. Your scorecard will stay just as it is.</p>
        </Modal>
      )}

      {modal === 'reset-stats' && (
        <Modal title="Clear the scorecard?" eyebrow="START WITH A CLEAN SLATE" onClose={closeModal} actions={(
          <>
            <button className="secondary-action" type="button" onClick={closeModal}>Cancel</button>
            <button className="primary-action danger-action" type="button" onClick={resetRecords}>Clear records <RotateCcw size={15} /></button>
          </>
        )}>
          <p>This clears the saved {mode === 'bot' ? 'computer match' : 'pass-and-play'} results on this device. The current board won’t change.</p>
        </Modal>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
