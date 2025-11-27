import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { getApiBaseUrl, getWebSocketUrl } from '../utils/apiBase';

/**
 * WebSocket hook for real-time updates
 * Connects to backend WebSocket server and handles incoming messages
 */
export const useWebSocket = () => {
  const wsRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  // Wrap store methods in useCallback to prevent dependency changes
  const refetchProducts = useCallback((shopId) => {
    useStore.getState().refetchProducts(shopId);
  }, []);

  const updateOrderStatus = useCallback((orderId, status) => {
    useStore.getState().updateOrderStatus(orderId, status);
  }, []);

  const incrementSubscribers = useCallback((shopId) => {
    useStore.getState().incrementSubscribers(shopId);
  }, []);

  useEffect(() => {
    const API_URL = getApiBaseUrl();

    // ✅ Skip WebSocket on ngrok (free tier doesn't support WS)
    if (API_URL.includes('ngrok')) {
      setIsConnected(false);
      return;
    }

    const wsUrl = getWebSocketUrl(API_URL);
    let mounted = true; // ✅ Mounted flag to prevent actions after unmount

    function connect() {
      if (!mounted) return; // ✅ Guard against unmounted component

      // Prevent multiple connections
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        return;
      }

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          reconnectAttemptsRef.current = 0;

          // Clear reconnect timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
        };

        ws.onclose = (event) => {
          setIsConnected(false);
          wsRef.current = null;

          if (!mounted) return; // ✅ Don't reconnect if unmounted

          // Clear existing timeout before creating new one
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }

          // Exponential backoff for reconnection
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            if (mounted) {
              // ✅ Double check before reconnecting
              connect();
            }
          }, delay);
        };
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        setIsConnected(false);

        if (!mounted) return; // ✅ Don't retry if unmounted

        // Clear existing timeout before creating new one
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        // Retry connection after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mounted) {
            // ✅ Double check before retrying
            connect();
          }
        }, 3000);
      }
    }

    function handleWebSocketMessage(data) {
      switch (data.type) {
        case 'connected':
          break;

        case 'pong':
          // Heartbeat response
          break;

        case 'product_added':
          if (data.shopId) {
            refetchProducts(data.shopId);
          }
          break;

        case 'product:updated':
          if (data.shopId || data.data?.shopId) {
            const shopId = data.shopId || data.data?.shopId;
            refetchProducts(shopId);
          }
          break;

        case 'product_deleted':
          if (data.shopId) {
            refetchProducts(data.shopId);
          }
          break;

        case 'order_status':
          if (data.orderId && data.status) {
            updateOrderStatus(data.orderId, data.status);
          }
          break;

        case 'new_subscriber':
          if (data.shopId) {
            incrementSubscribers(data.shopId);
          }
          break;

        case 'shop_updated':
          // Could refetch shop data here
          break;

        case 'subscription_payment_confirmed':
          // Subscription payment confirmed - reload subscription list
          if (data.subscriptionId) {
            // Force refetch subscriptions in Settings/Subscriptions page
            // This will update the UI to show 'active' status
            window.dispatchEvent(new CustomEvent('subscription_confirmed', {
              detail: data
            }));
          }
          break;

        default:
      }
    }

    // Start connection
    connect();

    // Heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Every 30 seconds

    // Cleanup
    return () => {
      mounted = false; // ✅ Set flag to prevent future actions

      clearInterval(heartbeatInterval);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [refetchProducts, updateOrderStatus, incrementSubscribers]);

  return { isConnected };
};
