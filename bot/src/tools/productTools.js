/**
 * Product Management Tools for DeepSeek Function Calling
 * Defines available operations for AI-powered product management
 * WITH STRICT MODE for enhanced reliability (DeepSeek Beta)
 */

export const productTools = [
  {
    type: 'function',
    strict: true,  // DeepSeek strict mode for schema validation
    function: {
      name: 'addProduct',
      description: 'Добавить новый товар в магазин. Use this when user wants to add/create a new product.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Название товара (минимум 3 символа). Product name in any language.'
          },
          price: {
            type: 'number',
            description: 'Цена товара в USD (только положительные числа). Product price in USD, must be positive.'
          },
          stock: {
            type: 'number',
            description: 'Количество на складе (опционально, по умолчанию 0). Stock quantity, optional, defaults to 0.'
          }
        },
        required: ['name', 'price', 'stock'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'bulkAddProducts',
      description: 'Добавить несколько товаров одновременно. ALWAYS use this when user wants to add 2+ products in one command (e.g. "add red car $10 and green car $10 2 pcs"). DO NOT ask clarifying questions - extract all products and add them immediately.',
      parameters: {
        type: 'object',
        properties: {
          products: {
            type: 'array',
            description: 'Массив товаров для добавления. Array of products to add.',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Название товара (минимум 3 символа). Product name in any language.'
                },
                price: {
                  type: 'number',
                  description: 'Цена товара в USD (только положительные числа). Product price in USD, must be positive.'
                },
                stock: {
                  type: 'number',
                  description: 'Количество на складе (опционально, по умолчанию 10). Stock quantity, optional, defaults to 10.'
                }
              },
              required: ['name', 'price', 'stock'],
              additionalProperties: false
            },
            minItems: 2
          }
        },
        required: ['products'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'deleteProduct',
      description: 'Удалить один товар по названию. Use this when user wants to delete a single product.',
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description: 'Название товара для удаления. Exact or partial product name to delete.'
          }
        },
        required: ['productName'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'listProducts',
      description: 'Показать список всех товаров магазина. Use this when user wants to see/list/show all products.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'searchProduct',
      description: 'Найти товар по названию (fuzzy search). Use this when user mentions a product name but you need to confirm which one (e.g. multiple matches).',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Поисковый запрос. Search query for product name.'
          }
        },
        required: ['query'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'updateProduct',
      description: 'Обновить товар (цену, название или количество). ALWAYS call this function when user wants to: "изменить цену", "переименовать", "выставить наличие", "поставить сток", "добавить количество", "обновить остаток". IMPORTANT: If user does not specify product name, ask which product to update. DO NOT respond with text, CALL the function.',
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description: 'Текущее название товара для поиска. Current product name to find (exact or fuzzy match).'
          },
          updates: {
            type: 'object',
            description: 'Объект с изменениями. Object with updates to apply.',
            properties: {
              name: {
                type: 'string',
                description: 'Новое название товара (если меняем название). New product name if renaming.'
              },
              price: {
                type: 'number',
                description: 'Новая цена в USD (если меняем цену). New price in USD if changing price.'
              },
              stock_quantity: {
                type: 'number',
                description: 'Новое количество на складе (если меняем остаток). New stock quantity if changing stock.'
              }
            },
            additionalProperties: false
          }
        },
        required: ['productName', 'updates'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'bulkDeleteAll',
      description: 'Удалить ВСЕ товары из магазина. Use ONLY when user explicitly wants to delete ALL products.',
      parameters: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            description: 'Подтверждение удаления всех товаров. Must be true.'
          }
        },
        required: ['confirm'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'bulkDeleteByNames',
      description: 'Удалить несколько товаров по названиям. ALWAYS call this function when user wants to delete 2+ specific products (e.g. "удали iPhone и Samsung", "delete MacBook, iPad, AirPods"). DO NOT respond with text, CALL the function.',
      parameters: {
        type: 'object',
        properties: {
          productNames: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Массив названий товаров для удаления. Array of product names to delete (can be fuzzy matches).'
          }
        },
        required: ['productNames'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'recordSale',
      description: 'Записать продажу товара (уменьшить количество на складе). Use when user says "sold X items", "купили X штук", or just "купили iPhone" (default quantity=1).',
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description: 'Название товара. Product name (exact or fuzzy match).'
          },
          quantity: {
            type: 'number',
            description: 'Количество проданных единиц (по умолчанию 1). Number of items sold, defaults to 1 if not specified.'
          }
        },
        required: ['productName', 'quantity'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'getProductInfo',
      description: 'Получить информацию о товаре (цена, количество на складе). Use when user asks "what\'s the price?" or "how many left?".',
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description: 'Название товара. Product name to query.'
          }
        },
        required: ['productName'],
        additionalProperties: false
      }
    }
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'bulkUpdatePrices',
      description: 'Массовое изменение цен ВСЕХ товаров (скидка или повышение). Use when user says "скидка 10%", "подними цены на 5%", "raise all prices 15%", "discount 20%". DO NOT respond with text - CALL this function immediately!',
      parameters: {
        type: 'object',
        properties: {
          percentage: {
            type: 'number',
            description: 'Процент изменения (положительное число, например 10 означает 10%). Percentage to change (positive number, e.g. 10 means 10%).',
            minimum: 0.1,
            maximum: 100
          },
          operation: {
            type: 'string',
            enum: ['increase', 'decrease'],
            description: 'Операция: increase (повысить цены) или decrease (снизить цены, скидка). Operation: increase prices or decrease (discount).'
          }
        },
        required: ['percentage', 'operation'],
        additionalProperties: false
      }
    }
  }
];

export default productTools;
