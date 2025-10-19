import { useState, useCallback } from 'react';
import axios from 'axios';

// Базовый URL API (можно вынести в .env)
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * Hook для API вызовов
 * @returns {Object} Объект с методами API
 */
export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Базовый запрос
  const request = useCallback(async (method, endpoint, data = null, config = {}) => {
    setLoading(true);
    setError(null);

    try {
      // Получаем initData из Telegram WebApp для авторизации
      const initData = window.Telegram?.WebApp?.initData || '';

      const response = await axios({
        method,
        url: `${API_BASE_URL}${endpoint}`,
        data,
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
          ...config.headers,
        },
        ...config,
      });

      setLoading(false);
      return { data: response.data, error: null };
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Произошла ошибка';
      setError(errorMessage);
      setLoading(false);
      return { data: null, error: errorMessage };
    }
  }, []);

  // GET запрос
  const get = useCallback(async (endpoint, config = {}) => {
    return await request('GET', endpoint, null, config);
  }, [request]);

  // POST запрос
  const post = useCallback(async (endpoint, data, config = {}) => {
    return await request('POST', endpoint, data, config);
  }, [request]);

  // PUT запрос
  const put = useCallback(async (endpoint, data, config = {}) => {
    return await request('PUT', endpoint, data, config);
  }, [request]);

  // DELETE запрос
  const del = useCallback(async (endpoint, config = {}) => {
    return await request('DELETE', endpoint, null, config);
  }, [request]);

  // PATCH запрос
  const patch = useCallback(async (endpoint, data, config = {}) => {
    return await request('PATCH', endpoint, data, config);
  }, [request]);

  // Очистка ошибки
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    get,
    post,
    put,
    delete: del,
    patch,
    clearError,
  };
}

/**
 * Hook для конкретных API endpoints
 */
export function useShopApi() {
  const api = useApi();

  // Получить список магазинов
  const getShops = useCallback(async () => {
    return await api.get('/shops');
  }, [api]);

  // Получить магазин по ID
  const getShop = useCallback(async (shopId) => {
    return await api.get(`/shops/${shopId}`);
  }, [api]);

  // Получить товары магазина
  const getShopProducts = useCallback(async (shopId) => {
    return await api.get(`/shops/${shopId}/products`);
  }, [api]);

  // Получить подписки пользователя
  const getSubscriptions = useCallback(async () => {
    return await api.get('/subscriptions');
  }, [api]);

  // Создать заказ
  const createOrder = useCallback(async (orderData) => {
    return await api.post('/orders', orderData);
  }, [api]);

  // Подтвердить оплату
  const confirmPayment = useCallback(async (orderId, paymentData) => {
    return await api.post(`/orders/${orderId}/confirm`, paymentData);
  }, [api]);

  // Получить заказы пользователя
  const getMyOrders = useCallback(async () => {
    return await api.get('/orders/my');
  }, [api]);

  return {
    ...api,
    getShops,
    getShop,
    getShopProducts,
    getSubscriptions,
    createOrder,
    confirmPayment,
    getMyOrders,
  };
}
