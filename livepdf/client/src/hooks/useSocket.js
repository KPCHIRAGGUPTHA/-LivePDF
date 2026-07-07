import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import api from '../utils/api';

export default function useSocket({ docId, linkType, currentVersion, onDocUpdated }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [viewerCount, setViewerCount] = useState(null);

  // Fetch latest version via REST — used on reconnect to catch missed updates
  const catchUp = useCallback(async () => {
    try {
      const res = await api.get(`/share/${docId}/latest`);
      if (res.data.versionNumber > currentVersion) {
        onDocUpdated(res.data);
      }
    } catch {
      // Silent fail — socket will retry connection anyway
    }
  }, [docId, currentVersion, onDocUpdated]);

  useEffect(() => {
    if (!docId) return;

    const token = window.__livepdf_token__;

    const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000', {
      auth: { token: token || null },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    // ── Connection events ────────────────────────────────────────
    socket.on('connect', () => {
      setConnected(true);
      setReconnecting(false);
      socket.emit('join:doc', { docId, linkType });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', () => {
      setReconnecting(true);
    });

    // On reconnect — catch up on any missed version updates
    socket.on('reconnect', () => {
      setConnected(true);
      setReconnecting(false);
      catchUp();
    });

    // ── Document events ──────────────────────────────────────────
    socket.on('doc:updated', (payload) => {
      onDocUpdated(payload);
    });

    socket.on('viewers:count', ({ count }) => {
      setViewerCount(count);
    });

    socket.on('joined:doc', () => {
      // Successfully joined the room
    });

    socket.on('error', ({ message }) => {
      console.warn('Socket error:', message);
    });

    // ── Cleanup ──────────────────────────────────────────────────
    return () => {
      socket.emit('leave:doc', { docId });
      socket.disconnect();
    };
  }, [docId, catchUp, linkType, onDocUpdated]);

  return { connected, reconnecting, viewerCount, socket: socketRef.current };
}
