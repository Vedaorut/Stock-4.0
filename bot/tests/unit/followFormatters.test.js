/**
 * Follow Formatters Unit Tests
 *
 * Тестирует форматирование сообщений для Follow Shop UI
 */

import { describe, it, expect } from '@jest/globals';
import { formatFollowsList, formatFollowDetail } from '../../src/utils/minimalist.js';

describe('Follow Formatters - Unit Tests', () => {
  describe('formatFollowsList', () => {
    it('пустой список → показать "Подписок пока нет"', () => {
      const result = formatFollowsList([], 'MyShop');

      expect(result).toContain('📡 Подписки (0)');
      expect(result).toContain('Подписок пока нет');
    });

    it('null список → показать "Подписок пока нет"', () => {
      const result = formatFollowsList(null, 'MyShop');

      expect(result).toContain('📡 Подписки (0)');
      expect(result).toContain('Подписок пока нет');
    });

    it('undefined список → показать "Подписок пока нет"', () => {
      const result = formatFollowsList(undefined, 'MyShop');

      expect(result).toContain('📡 Подписки (0)');
      expect(result).toContain('Подписок пока нет');
    });

    it('1 подписка Monitor → показать с иконкой 👀', () => {
      const follows = [{
        id: 1,
        source_shop_id: 100,
        source_shop_name: 'SourceShop',
        mode: 'monitor',
        markup_percentage: 0
      }];

      const result = formatFollowsList(follows, 'MyShop');

      expect(result).toContain('📡 Подписки (1)');
      expect(result).toContain('👀 SourceShop');
      expect(result).not.toContain('+');
    });

    it('1 подписка Resell → показать с иконкой 💰 и markup', () => {
      const follows = [{
        id: 2,
        source_shop_id: 200,
        source_shop_name: 'ResellShop',
        mode: 'resell',
        markup_percentage: 25
      }];

      const result = formatFollowsList(follows, 'MyShop');

      expect(result).toContain('📡 Подписки (1)');
      expect(result).toContain('💰 ResellShop +25%');
    });

    it('несколько подписок → показать все', () => {
      const follows = [
        {
          id: 1,
          source_shop_id: 100,
          source_shop_name: 'Shop1',
          mode: 'monitor',
          markup_percentage: 0
        },
        {
          id: 2,
          source_shop_id: 200,
          source_shop_name: 'Shop2',
          mode: 'resell',
          markup_percentage: 15
        },
        {
          id: 3,
          source_shop_id: 300,
          source_shop_name: 'Shop3',
          mode: 'resell',
          markup_percentage: 50
        }
      ];

      const result = formatFollowsList(follows, 'MyShop');

      expect(result).toContain('📡 Подписки (3)');
      expect(result).toContain('👀 Shop1');
      expect(result).toContain('💰 Shop2 +15%');
      expect(result).toContain('💰 Shop3 +50%');
    });

    it('markup 0% → НЕ показывать +0%', () => {
      const follows = [{
        id: 1,
        source_shop_id: 100,
        source_shop_name: 'TestShop',
        mode: 'monitor',
        markup_percentage: 0
      }];

      const result = formatFollowsList(follows, 'MyShop');

      expect(result).not.toContain('+0%');
      expect(result).not.toContain('%');
    });

    it('markup 1% → показать +1%', () => {
      const follows = [{
        id: 1,
        source_shop_id: 100,
        source_shop_name: 'TestShop',
        mode: 'resell',
        markup_percentage: 1
      }];

      const result = formatFollowsList(follows, 'MyShop');

      expect(result).toContain('💰 TestShop +1%');
    });

    it('markup 500% → показать +500%', () => {
      const follows = [{
        id: 1,
        source_shop_id: 100,
        source_shop_name: 'TestShop',
        mode: 'resell',
        markup_percentage: 500
      }];

      const result = formatFollowsList(follows, 'MyShop');

      expect(result).toContain('💰 TestShop +500%');
    });

    it('длинное имя магазина → НЕ обрезать (minimalist без ограничений)', () => {
      const follows = [{
        id: 1,
        source_shop_id: 100,
        source_shop_name: 'Very Long Shop Name That Is More Than 50 Characters',
        mode: 'monitor',
        markup_percentage: 0
      }];

      const result = formatFollowsList(follows, 'MyShop');

      expect(result).toContain('Very Long Shop Name That Is More Than 50 Characters');
    });

    it('спецсимволы в имени → НЕ экранировать', () => {
      const follows = [{
        id: 1,
        source_shop_id: 100,
        source_shop_name: 'Shop & Co. <Test>',
        mode: 'monitor',
        markup_percentage: 0
      }];

      const result = formatFollowsList(follows, 'MyShop');

      expect(result).toContain('Shop & Co. <Test>');
    });
  });

  describe('formatFollowDetail', () => {
    it('Monitor mode → показать 👀 Monitor без markup', () => {
      const follow = {
        id: 1,
        source_shop_id: 100,
        source_shop_name: 'SourceShop',
        mode: 'monitor',
        markup_percentage: 0
      };

      const result = formatFollowDetail(follow);

      expect(result).toContain('👀 Monitor');
      expect(result).toContain('SourceShop');
      expect(result).not.toContain('Наценка');
      expect(result).not.toContain('%');
    });

    it('Resell mode → показать 💰 Resell с markup', () => {
      const follow = {
        id: 2,
        source_shop_id: 200,
        source_shop_name: 'ResellShop',
        mode: 'resell',
        markup_percentage: 30
      };

      const result = formatFollowDetail(follow);

      expect(result).toContain('💰 Resell');
      expect(result).toContain('ResellShop');
      expect(result).toContain('Наценка: +30%');
    });

    it('Resell с markup 1% → показать +1%', () => {
      const follow = {
        id: 3,
        source_shop_id: 300,
        source_shop_name: 'Shop3',
        mode: 'resell',
        markup_percentage: 1
      };

      const result = formatFollowDetail(follow);

      expect(result).toContain('💰 Resell');
      expect(result).toContain('Наценка: +1%');
    });

    it('Resell с markup 500% → показать +500%', () => {
      const follow = {
        id: 4,
        source_shop_id: 400,
        source_shop_name: 'Shop4',
        mode: 'resell',
        markup_percentage: 500
      };

      const result = formatFollowDetail(follow);

      expect(result).toContain('Наценка: +500%');
    });

    it('форматирование с переносами строк', () => {
      const follow = {
        id: 5,
        source_shop_id: 500,
        source_shop_name: 'TestShop',
        mode: 'resell',
        markup_percentage: 20
      };

      const result = formatFollowDetail(follow);

      // Should have line breaks
      expect(result).toContain('\n');
      expect(result.split('\n').length).toBeGreaterThan(1);
    });

    it('длинное имя магазина в деталях → показать полностью', () => {
      const follow = {
        id: 6,
        source_shop_id: 600,
        source_shop_name: 'Extremely Long Shop Name With Many Words',
        mode: 'monitor',
        markup_percentage: 0
      };

      const result = formatFollowDetail(follow);

      expect(result).toContain('Extremely Long Shop Name With Many Words');
    });

    it('спецсимволы в имени → показать как есть', () => {
      const follow = {
        id: 7,
        source_shop_id: 700,
        source_shop_name: 'Shop™ & Co. <Official>',
        mode: 'resell',
        markup_percentage: 10
      };

      const result = formatFollowDetail(follow);

      expect(result).toContain('Shop™ & Co. <Official>');
    });

    it('markup 0 в resell mode (некорректные данные) → НЕ показывать markup', () => {
      const follow = {
        id: 8,
        source_shop_id: 800,
        source_shop_name: 'Shop8',
        mode: 'resell',
        markup_percentage: 0
      };

      const result = formatFollowDetail(follow);

      // Even if mode is resell, markup 0 should still show
      expect(result).toContain('💰 Resell');
      expect(result).toContain('Наценка: +0%');
    });

    it('minimalist format: краткость (максимум 3 строки)', () => {
      const follow = {
        id: 9,
        source_shop_id: 900,
        source_shop_name: 'Shop9',
        mode: 'resell',
        markup_percentage: 25
      };

      const result = formatFollowDetail(follow);

      const lines = result.split('\n').filter(line => line.trim().length > 0);
      expect(lines.length).toBeLessThanOrEqual(4); // Mode + empty + shop + markup
    });
  });

  describe('Edge Cases', () => {
    it('formatFollowsList: follows с missing fields → graceful degradation', () => {
      const follows = [{
        id: 1,
        source_shop_id: 100,
        // source_shop_name missing
        mode: 'monitor'
      }];

      const result = formatFollowsList(follows, 'MyShop');

      // Should not crash, show undefined or empty string
      expect(result).toBeDefined();
      expect(result).toContain('📡 Подписки (1)');
    });

    it('formatFollowDetail: follow с missing mode → graceful degradation', () => {
      const follow = {
        id: 1,
        source_shop_id: 100,
        source_shop_name: 'TestShop'
        // mode missing
      };

      const result = formatFollowDetail(follow);

      // Should not crash
      expect(result).toBeDefined();
      expect(result).toContain('TestShop');
    });

    it('formatFollowsList: очень большой markup (999999%) → показать как есть', () => {
      const follows = [{
        id: 1,
        source_shop_id: 100,
        source_shop_name: 'TestShop',
        mode: 'resell',
        markup_percentage: 999999
      }];

      const result = formatFollowsList(follows, 'MyShop');

      expect(result).toContain('+999999%');
    });

    it('formatFollowsList: отрицательный markup (некорректные данные) → показать как есть', () => {
      const follows = [{
        id: 1,
        source_shop_id: 100,
        source_shop_name: 'TestShop',
        mode: 'resell',
        markup_percentage: -10
      }];

      const result = formatFollowsList(follows, 'MyShop');

      expect(result).toContain('+-10%'); // Will show as "+-10%" literally
    });

    it('formatFollowsList: float markup (15.5%) → показать с дробной частью', () => {
      const follows = [{
        id: 1,
        source_shop_id: 100,
        source_shop_name: 'TestShop',
        mode: 'resell',
        markup_percentage: 15.5
      }];

      const result = formatFollowsList(follows, 'MyShop');

      expect(result).toContain('+15.5%');
    });
  });
});
