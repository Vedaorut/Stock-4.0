/**
 * Follow API Unit Tests
 *
 * Тестирует все 6 методов followApi с mock axios
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import MockAdapter from 'axios-mock-adapter';
import { followApi, api } from '../../src/utils/api.js';

describe('followApi - Unit Tests', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(api);
  });

  afterEach(() => {
    mock.reset();
  });

  describe('getMyFollows', () => {
    it('успешный запрос → вернуть список подписок', async () => {
      const mockFollows = [
        { id: 1, source_shop_id: 100, mode: 'monitor' },
        { id: 2, source_shop_id: 200, mode: 'resell', markup_percentage: 20 }
      ];

      mock.onGet('/follows/my').reply(200, { data: mockFollows });

      const result = await followApi.getMyFollows(1, 'test-token');

      expect(result).toEqual(mockFollows);
      expect(mock.history.get.length).toBe(1);
      expect(mock.history.get[0].params.shopId).toBe(1);
      expect(mock.history.get[0].headers.Authorization).toBe('Bearer test-token');
    });

    it('пустой список → вернуть []', async () => {
      mock.onGet('/follows/my').reply(200, { data: [] });

      const result = await followApi.getMyFollows(1, 'test-token');

      expect(result).toEqual([]);
    });

    it('API error (500) → пробросить ошибку', async () => {
      mock.onGet('/follows/my').reply(500, { error: 'Server error' });

      await expect(
        followApi.getMyFollows(1, 'test-token')
      ).rejects.toThrow();
    });

    it('response format: data.data → unwrap correctly', async () => {
      const mockData = [{ id: 1 }];
      mock.onGet('/follows/my').reply(200, { data: { data: mockData } });

      const result = await followApi.getMyFollows(1, 'test-token');

      expect(result).toEqual({ data: mockData });
    });
  });

  describe('checkFollowLimit', () => {
    it('лимит не достигнут → вернуть reached: false', async () => {
      const mockLimit = { reached: false, count: 1, limit: 2 };
      mock.onGet('/follows/check-limit').reply(200, { data: mockLimit });

      const result = await followApi.checkFollowLimit(1, 'test-token');

      expect(result).toEqual(mockLimit);
      expect(result.reached).toBe(false);
      expect(result.count).toBe(1);
      expect(result.limit).toBe(2);
    });

    it('лимит достигнут → вернуть reached: true', async () => {
      const mockLimit = { reached: true, count: 2, limit: 2 };
      mock.onGet('/follows/check-limit').reply(200, { data: mockLimit });

      const result = await followApi.checkFollowLimit(1, 'test-token');

      expect(result.reached).toBe(true);
      expect(result.count).toBe(2);
    });

    it('передача shopId в params', async () => {
      mock.onGet('/follows/check-limit').reply(200, { data: { reached: false, count: 0, limit: 2 } });

      await followApi.checkFollowLimit(999, 'test-token');

      expect(mock.history.get[0].params.shopId).toBe(999);
    });
  });

  describe('createFollow', () => {
    it('создание Monitor подписки → вернуть follow объект', async () => {
      const followData = {
        sourceShopId: 100,
        mode: 'monitor'
      };

      const mockResponse = {
        id: 1,
        source_shop_id: 100,
        target_shop_id: 1,
        mode: 'monitor',
        markup_percentage: 0
      };

      mock.onPost('/follows').reply(201, { data: mockResponse });

      const result = await followApi.createFollow(followData, 'test-token');

      expect(result).toEqual(mockResponse);
      expect(mock.history.post.length).toBe(1);

      const requestData = JSON.parse(mock.history.post[0].data);
      expect(requestData.sourceShopId).toBe(100);
      expect(requestData.mode).toBe('monitor');
    });

    it('создание Resell подписки с markup → вернуть follow с markup', async () => {
      const followData = {
        sourceShopId: 200,
        mode: 'resell',
        markupPercentage: 25
      };

      const mockResponse = {
        id: 2,
        source_shop_id: 200,
        target_shop_id: 1,
        mode: 'resell',
        markup_percentage: 25
      };

      mock.onPost('/follows').reply(201, { data: mockResponse });

      const result = await followApi.createFollow(followData, 'test-token');

      expect(result.markup_percentage).toBe(25);

      const requestData = JSON.parse(mock.history.post[0].data);
      expect(requestData.markupPercentage).toBe(25);
    });

    it('передача Authorization header', async () => {
      mock.onPost('/follows').reply(201, { data: { id: 1 } });

      await followApi.createFollow({ sourceShopId: 100, mode: 'monitor' }, 'my-token');

      expect(mock.history.post[0].headers.Authorization).toBe('Bearer my-token');
    });

    it('circular follow error (400) → пробросить ошибку', async () => {
      mock.onPost('/follows').reply(400, { error: 'Circular follow detected' });

      await expect(
        followApi.createFollow({ sourceShopId: 100, mode: 'monitor' }, 'test-token')
      ).rejects.toThrow();
    });
  });

  describe('updateMarkup', () => {
    it('обновление markup → вернуть обновлённый follow', async () => {
      const mockResponse = {
        id: 10,
        markup_percentage: 30
      };

      mock.onPut('/follows/10/markup').reply(200, { data: mockResponse });

      const result = await followApi.updateMarkup(10, 30, 'test-token');

      expect(result.markup_percentage).toBe(30);
      expect(mock.history.put.length).toBe(1);

      const requestData = JSON.parse(mock.history.put[0].data);
      expect(requestData.markupPercentage).toBe(30);
    });

    it('markup как строка → конвертировать в число', async () => {
      mock.onPut('/follows/20/markup').reply(200, { data: { id: 20, markup_percentage: 15 } });

      await followApi.updateMarkup(20, '15', 'test-token');

      const requestData = JSON.parse(mock.history.put[0].data);
      expect(requestData.markupPercentage).toBe(15);
      expect(typeof requestData.markupPercentage).toBe('number');
    });

    it('правильный URL с followId', async () => {
      mock.onPut('/follows/999/markup').reply(200, { data: { id: 999 } });

      await followApi.updateMarkup(999, 10, 'test-token');

      expect(mock.history.put[0].url).toBe('/follows/999/markup');
    });
  });

  describe('switchMode', () => {
    it('переключение на monitor → вернуть обновлённый follow', async () => {
      const mockResponse = {
        id: 30,
        mode: 'monitor',
        markup_percentage: 0
      };

      mock.onPut('/follows/30/mode').reply(200, { data: mockResponse });

      const result = await followApi.switchMode(30, 'monitor', 'test-token');

      expect(result.mode).toBe('monitor');
      expect(mock.history.put.length).toBe(1);

      const requestData = JSON.parse(mock.history.put[0].data);
      expect(requestData.mode).toBe('monitor');
    });

    it('переключение на resell с markup → вернуть follow с markup', async () => {
      const mockResponse = {
        id: 40,
        mode: 'resell',
        markup_percentage: 20
      };

      mock.onPut('/follows/40/mode').reply(200, { data: mockResponse });

      const result = await followApi.switchMode(40, 'resell', 'test-token', 20);

      expect(result.mode).toBe('resell');
      expect(result.markup_percentage).toBe(20);
    });

    it('правильный URL и Authorization header', async () => {
      mock.onPut('/follows/50/mode').reply(200, { data: { id: 50 } });

      await followApi.switchMode(50, 'monitor', 'my-secret-token');

      expect(mock.history.put[0].url).toBe('/follows/50/mode');
      expect(mock.history.put[0].headers.Authorization).toBe('Bearer my-secret-token');
    });
  });

  describe('deleteFollow', () => {
    it('успешное удаление → вернуть success', async () => {
      mock.onDelete('/follows/60').reply(200, { data: { success: true } });

      const result = await followApi.deleteFollow(60, 'test-token');

      expect(result.success).toBe(true);
      expect(mock.history.delete.length).toBe(1);
    });

    it('правильный URL с followId', async () => {
      mock.onDelete('/follows/777').reply(200, { data: { success: true } });

      await followApi.deleteFollow(777, 'test-token');

      expect(mock.history.delete[0].url).toBe('/follows/777');
    });

    it('передача Authorization header', async () => {
      mock.onDelete('/follows/80').reply(200, { data: { success: true } });

      await followApi.deleteFollow(80, 'delete-token');

      expect(mock.history.delete[0].headers.Authorization).toBe('Bearer delete-token');
    });

    it('API error (404) → пробросить ошибку', async () => {
      mock.onDelete('/follows/999').reply(404, { error: 'Follow not found' });

      await expect(
        followApi.deleteFollow(999, 'test-token')
      ).rejects.toThrow();
    });

    it('API error (500) → пробросить ошибку', async () => {
      mock.onDelete('/follows/90').reply(500, { error: 'Cannot delete' });

      await expect(
        followApi.deleteFollow(90, 'test-token')
      ).rejects.toThrow();
    });
  });

  describe('data unwrapping (data.data || data)', () => {
    it('response с data.data → unwrap к data', async () => {
      const innerData = [{ id: 1 }];
      mock.onGet('/follows/my').reply(200, { data: { data: innerData } });

      const result = await followApi.getMyFollows(1, 'token');

      expect(result).toEqual({ data: innerData });
    });

    it('response с прямым data → вернуть как есть', async () => {
      const directData = [{ id: 2 }];
      mock.onGet('/follows/my').reply(200, { data: directData });

      const result = await followApi.getMyFollows(1, 'token');

      expect(result).toEqual(directData);
    });
  });
});
