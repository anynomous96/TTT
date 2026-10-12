import { useCallback, useEffect, useRef, useState } from 'react';

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private rooms still work when browser storage is unavailable.
  }
}

function getPlayerToken() {
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

export function getStoredRoom() {
  const room = readJson('threefold-active-room', null);
  return room && typeof room.code === 'string' ? room : null;
}

export function usePrivateRoom() {
  const identityRef = useRef('');
  if (!identityRef.current) identityRef.current = getPlayerToken();

  const [room, setRoom] = useState(null);
  const [yourMark, setYourMark] = useState(null);
  const [connection, setConnection] = useState('idle');
  const [actionPending, setActionPending] = useState(null);
  const [roomError, setRoomError] = useState('');

  const socketRef = useRef(null);
  const generationRef = useRef(0);
  const retryRef = useRef(null);
  const retryCountRef = useRef(0);
  const memberRef = useRef(null);

  const connect = useCallback((initialAction) => {
    if (typeof WebSocket === 'undefined') {
      setRoomError('Live rooms need a browser with WebSocket support.');
      return;
    }

    if (retryRef.current) {
      window.clearTimeout(retryRef.current);
      retryRef.current = null;
    }

    if (initialAction.type === 'resume_room' && !memberRef.current) {
      memberRef.current = {
        code: initialAction.code,
        name: initialAction.name || getStoredRoom()?.name || 'Player',
      };
    } else if (initialAction.type !== 'resume_room') {
      memberRef.current = null;
    }

    const previousSocket = socketRef.current;
    socketRef.current = null;
    if (previousSocket && previousSocket.readyState < WebSocket.CLOSING) {
      previousSocket.close(1000, 'Changing room');
    }

    setRoomError('');
    setActionPending(initialAction.type === 'create_room' ? 'create' : initialAction.type === 'join_room' ? 'join' : null);
    setConnection('connecting');

    const openSocket = (action) => {
      const generation = ++generationRef.current;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (generation !== generationRef.current) return;
        setConnection('connected');
        const activeMember = memberRef.current;
        const payload = action.type === 'resume_room' && activeMember
          ? { ...action, token: identityRef.current, name: activeMember.name }
          : action;
        socket.send(JSON.stringify(payload));
      };

      socket.onmessage = (event) => {
        if (generation !== generationRef.current) return;
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          setRoomError('The room sent an unreadable update. Please reconnect.');
          return;
        }

        if (message.type === 'room_state') {
          const member = {
            code: message.room.code,
            name: memberRef.current?.name || action.name || 'Player',
          };
          memberRef.current = member;
          retryCountRef.current = 0;
          if (retryRef.current) {
            window.clearTimeout(retryRef.current);
            retryRef.current = null;
          }
          setRoom(message.room);
          setYourMark(message.yourMark);
          setActionPending(null);
          setConnection('connected');
          setRoomError('');
          writeJson('threefold-active-room', member);
          return;
        }

        if (message.type === 'error') {
          setRoomError(message.message || 'Something went wrong. Please try again.');
          if (['create_room', 'join_room', 'resume_room'].includes(action.type)) {
            setActionPending(null);
            setConnection('idle');
            if (action.type === 'resume_room') {
              memberRef.current = null;
              setRoom(null);
              setYourMark(null);
              writeJson('threefold-active-room', null);
            }
          }
        }
      };

      socket.onerror = () => {
        if (generation === generationRef.current) {
          setRoomError('Could not reach the room server. Check your connection and try again.');
        }
      };

      socket.onclose = (event) => {
        if (generation !== generationRef.current) return;
        socketRef.current = null;
        if (!memberRef.current?.code) {
          setActionPending(null);
          setConnection('idle');
          return;
        }
        if (event.code === 4001) {
          setConnection('idle');
          setRoomError('This room is open in another tab. Continue there, or reconnect here to take over.');
          return;
        }

        setConnection('reconnecting');
        const delay = Math.min(800 * (2 ** retryCountRef.current), 8_000);
        retryCountRef.current += 1;
        retryRef.current = window.setTimeout(() => {
          retryRef.current = null;
          if (memberRef.current?.code) openSocket({ type: 'resume_room', code: memberRef.current.code });
        }, delay);
      };
    };

    openSocket(initialAction);
  }, []);

  const createRoom = useCallback((name) => {
    connect({ type: 'create_room', name, token: identityRef.current });
  }, [connect]);

  const joinRoom = useCallback((code, name) => {
    connect({ type: 'join_room', code, name, token: identityRef.current });
  }, [connect]);

  const resumeRoom = useCallback((savedRoom) => {
    if (!savedRoom?.code) return;
    connect({ type: 'resume_room', code: savedRoom.code, name: savedRoom.name || 'Player' });
  }, [connect]);

  const send = useCallback((payload) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setRoomError('You’re offline right now. Reconnecting to the room…');
      return false;
    }
    socket.send(JSON.stringify(payload));
    return true;
  }, []);

  const leaveRoom = useCallback(() => {
    if (retryRef.current) {
      window.clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    generationRef.current += 1;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Left room');
    memberRef.current = null;
    retryCountRef.current = 0;
    setRoom(null);
    setYourMark(null);
    setConnection('idle');
    setActionPending(null);
    setRoomError('');
    writeJson('threefold-active-room', null);
  }, []);

  const clearRoomError = useCallback(() => setRoomError(''), []);

  useEffect(() => () => {
    if (retryRef.current) window.clearTimeout(retryRef.current);
    generationRef.current += 1;
    socketRef.current?.close(1000, 'Page closed');
  }, []);

  return {
    room,
    yourMark,
    connection,
    actionPending,
    roomError,
    createRoom,
    joinRoom,
    resumeRoom,
    send,
    leaveRoom,
    clearRoomError,
  };
}
