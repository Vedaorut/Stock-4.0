export const productTools = [
  {
    type: 'function',
    strict: true,
    function: {
      name: 'addProduct',
      description:
        'Добавить новый товар в магазин. Use this when user wants to add/create a new product.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Название товара (минимум 3 символа). Product name in any language.',
          },
          price: {
            type: 'number',
            description:
              'Цена товара в USD (только положительные числа). Product price in USD, must be positive.',
          },
          stock: {
            type: 'number',
            description:
              'Количество на складе (опционально, по умолчанию 0). Stock quantity, optional, defaults to 0.',
          },
          is_preorder: {
            type: 'boolean',
            description:
              'Товар-предзаказ (опционально, по умолчанию false). Set to true if this is a preorder product.',
          },
        },
        required: ['name', 'price', 'stock'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'bulkAddProducts',
      description:
        'Добавить несколько товаров одновременно. ALWAYS use this when user wants to add 2+ products in one command.',
      parameters: {
        type: 'object',
        properties: {
          products: {
            type: 'array',
            description: 'Массив товаров для добавления.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                price: { type: 'number' },
                stock: { type: 'number' },
                is_preorder: { type: 'boolean' },
              },
              required: ['name', 'price', 'stock'],
              additionalProperties: false,
            },
            minItems: 2,
          },
        },
        required: ['products'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'updateProduct',
      description: 'Обновить товар (цену, название или количество).',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string' },
          updates: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              price: { type: 'number' },
              stock_quantity: { type: 'number' },
            },
            additionalProperties: false,
          },
        },
        required: ['productName', 'updates'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'deleteProduct',
      description: 'Удалить один товар по названию.',
      parameters: {
        type: 'object',
        properties: {
          productName: { type: 'string' },
        },
        required: ['productName'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'bulkDeleteByNames',
      description: 'Удалить несколько товаров по названиям.',
      parameters: {
        type: 'object',
        properties: {
          productNames: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
          },
        },
        required: ['productNames'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'listProducts',
      description: 'Показать список всех товаров магазина.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'searchProduct',
      description: 'Найти товар по названию (fuzzy search).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
];

export default productTools;
