/**
 * WebSocket connection hook for real-time updates
 * Features: heartbeat, exponential backoff, StrictMode compatible
 */

import { useEffect, useRef } from 'react';
import { useGraphStore, type GraphData, type ChangeEvent } from './store';

const WS_URL = 'ws://localhost:3001';
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const HEARTBEAT_INTERVAL = 25000; // 25 seconds

interface WebSocketMessage {
  type: 'graph:update' | 'analysis:start' | 'analysis:complete' | 'change' | 'change:recorded' | 'stats' | 'pong';
  payload: unknown;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const isUnmountedRef = useRef(false);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);

  // Get store actions once (they're stable)
  const setGraph = useGraphStore((s) => s.setGraph);
  const setConnected = useGraphStore((s) => s.setConnected);
  const setAnalyzing = useGraphStore((s) => s.setAnalyzing);
  const recordChange = useGraphStore((s) => s.recordChange);
  const addChangeEvent = useGraphStore((s) => s.addChangeEvent);

  useEffect(() => {
    // Reset state for StrictMode double-mount
    isUnmountedRef.current = false;
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

    function startHeartbeat(ws: WebSocket) {
      stopHeartbeat();
      heartbeatIntervalRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, HEARTBEAT_INTERVAL);
    }

    function stopHeartbeat() {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    }

    function connect() {
      if (isUnmountedRef.current) return;

      // Clean up existing connection
      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        ws.onclose = null;
        ws.close();
      }

      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isUnmountedRef.current) {
            ws.close();
            return;
          }
          console.log('WebSocket connected');
          setConnected(true);
          reconnectDelayRef.current = INITIAL_RECONNECT_DELAY; // Reset backoff on success
          startHeartbeat(ws);
        };

        ws.onclose = (event) => {
          if (isUnmountedRef.current) return;

          stopHeartbeat();
          console.log(`WebSocket disconnected (code: ${event.code})`);
          setConnected(false);

          // Don't reconnect on clean close (code 1000)
          if (event.code === 1000) return;

          // Clear any pending reconnect
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }

          // Schedule reconnect with exponential backoff
          console.log(`Reconnecting in ${reconnectDelayRef.current}ms...`);
          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (!isUnmountedRef.current) {
              connect();
              // Exponential backoff with cap
              reconnectDelayRef.current = Math.min(
                reconnectDelayRef.current * 1.5,
                MAX_RECONNECT_DELAY
              );
            }
          }, reconnectDelayRef.current);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onmessage = (event) => {
          if (isUnmountedRef.current) return;

          try {
            const message: WebSocketMessage = JSON.parse(event.data);

            switch (message.type) {
              case 'graph:update':
                setGraph(message.payload as GraphData);
                break;

              case 'analysis:start':
                setAnalyzing(true);
                break;

              case 'analysis:complete':
                setAnalyzing(false);
                break;

              case 'change': {
                const payload = message.payload as { path?: string; type?: string; timestamp?: number };
                if (payload.path) {
                  recordChange({
                    filePath: payload.path,
                    type: (payload.type as 'create' | 'modify' | 'delete') || 'modify',
                    timestamp: payload.timestamp || Date.now(),
                  });
                }
                break;
              }

              case 'change:recorded': {
                const event = message.payload as ChangeEvent;
                addChangeEvent(event);
                break;
              }

              case 'pong':
                // Heartbeat acknowledged
                break;

              default:
                // Ignore unknown message types
                break;
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };
      } catch (error) {
        console.error('Failed to create WebSocket:', error);
        // Schedule retry
        reconnectTimeoutRef.current = window.setTimeout(() => {
          if (!isUnmountedRef.current) {
            connect();
            reconnectDelayRef.current = Math.min(
              reconnectDelayRef.current * 1.5,
              MAX_RECONNECT_DELAY
            );
          }
        }, reconnectDelayRef.current);
      }
    }

    connect();

    return () => {
      isUnmountedRef.current = true;
      stopHeartbeat();

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (wsRef.current) {
        const ws = wsRef.current;
        wsRef.current = null;
        ws.onclose = null;
        ws.close(1000, 'Component unmounted');
      }
    };
  }, [setGraph, setConnected, setAnalyzing, recordChange, addChangeEvent]);
}
