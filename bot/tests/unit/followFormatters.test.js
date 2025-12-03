/**
 * Follow Formatters Unit Tests
 */

import { describe, it, expect } from '@jest/globals';
import { formatFollowsList, formatFollowDetail } from '../../src/utils/minimalist.js';
import { messages } from '../../src/texts/messages.js';

const { follows: followMessages } = messages;

describe('Follow Formatters', () => {
  describe('formatFollowsList', () => {
    it('возвращает текст об отсутствии подписок для пустого списка', () => {
      expect(formatFollowsList([])).toBe(followMessages.listEmpty);
      expect(formatFollowsList(null)).toBe(followMessages.listEmpty);
      expect(formatFollowsList(undefined)).toBe(followMessages.listEmpty);
    });

    it('отображает одну подписку мониторинга', () => {
      const follows = [
        {
          id: 1,
          source_shop_id: 100,
          source_shop_name: 'SourceShop',
          mode: 'monitor',
          markup_percentage: 0,
        },
      ];

      const result = formatFollowsList(follows);

      expect(result).toContain(followMessages.listHeader(1));
      expect(result).toContain('1. SourceShop (Мониторинг)');
      expect(result).toContain(followMessages.listManageHint);
    });

    it('отображает подписку перепродажи с наценкой', () => {
      const follows = [
        {
          id: 2,
          source_shop_id: 200,
          source_shop_name: 'ResellShop',
          mode: 'resell',
          markup_percentage: 25,
        },
      ];

      const result = formatFollowsList(follows);

      expect(result).toContain(followMessages.listHeader(1));
      expect(result).toContain('1. ResellShop (Перепродажа, +25%)');
    });

    it('отображает несколько подписок с корректными маркерами', () => {
      const follows = [
        {
          id: 1,
          source_shop_id: 100,
          source_shop_name: 'Shop1',
          mode: 'monitor',
          markup_percentage: 0,
        },
        {
          id: 2,
          source_shop_id: 200,
          source_shop_name: 'Shop2',
          mode: 'resell',
          markup_percentage: 15,
        },
      ];

      const result = formatFollowsList(follows);

      expect(result).toContain(followMessages.listHeader(2));
      expect(result).toContain('1. Shop1 (Мониторинг)');
      expect(result).toContain('2. Shop2 (Перепродажа, +15%)');
    });
  });

  describe('formatFollowDetail', () => {
    it('для мониторинга показывает базовую информацию без наценки', () => {
      const follow = {
        id: 1,
        source_shop_id: 100,
        source_shop_name: 'SourceShop',
        mode: 'monitor',
        markup_percentage: 0,
        products_count: 3,
      };

      const result = formatFollowDetail(follow);

      expect(result).toContain('Магазин: SourceShop');
      expect(result).toContain('Режим: Мониторинг');
      expect(result).toContain('Наценка: -');
      expect(result).toContain('Товаров: 3');
      // syncedProducts fallbacks to sourceProducts if not provided
      expect(result).toContain('Скопировано: 3');
    });

    it('для перепродажи показывает наценку в процентах', () => {
      const follow = {
        id: 2,
        source_shop_id: 200,
        source_shop_name: 'ResellShop',
        mode: 'resell',
        markup_percentage: 30,
        products_count: 12,
      };

      const result = formatFollowDetail(follow);

      expect(result).toContain('Магазин: ResellShop');
      expect(result).toContain('Режим: Перепродажа');
      expect(result).toContain('Наценка: 30%');
      expect(result).toContain('Товаров: 12');
      expect(result).toContain('Скопировано: 12');
    });

    it('gracefully обрабатывает отсутствующие поля', () => {
      const follow = {
        id: 3,
        mode: 'resell',
      };

      const result = formatFollowDetail(follow);

      expect(result).toContain('Магазин: Магазин');
      expect(result).toContain('Режим: Перепродажа');
    });
  });
});
