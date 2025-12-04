/**
 * Product Management Tools for DeepSeek Function Calling
 * Defines available operations for AI-powered product management
 * WITH STRICT MODE for enhanced reliability (DeepSeek Beta)
 */

export const productTools = [
  {
    type: 'function',
    strict: true, // DeepSeek strict mode for schema validation
    function: {
      name: 'addProduct',
      description: `Add a single product instantly.

Use it for commands like "add iPhone 15 for 999", "new case arrived $20". If you need multiple products at once - use bulkAddProducts.

Examples:
- "add iPhone 15 999" → addProduct({ name: "iPhone 15", price: 999, stock: 1 })
- "create MacBook Air 1299, 3 pieces" → addProduct({ name: "MacBook Air", price: 1299, stock: 3 })

Rules:
- Price is required - if missing, ask "What price should I set?"
- CRITICAL: Price MUST be > 0, NEVER use 0 or negative values
- Minimum price: 0.01 USD
- Default stock = 1, if user didn't specify (no questions needed).
- Name must be meaningful (at least 3 characters).`,
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'Product name (minimum 3 characters). Examples: "iPhone 15 Pro", "Samsung Galaxy S24", "AirPods Headphones". Must be specified by user.',
          },
          price: {
            type: 'number',
            description:
              "Product price in USD (must be > 0). Examples: 999, 1299.99, 49.90, 0.01 (minimum). REQUIRED: If user didn't mention price, ask before calling function. NEVER use 0 or negative values.",
            minimum: 0.01,
          },
          stock: {
            type: 'number',
            description:
              'Stock quantity. If missing, treat as 1 automatically. Examples: 1, 5, 100. Must be >= 0.',
          },
        },
        required: ['name', 'price'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'bulkAddProducts',
      description: `Add multiple products at once (2+ items).

CALL CONDITIONS:
- User lists 2 or more products in one message → CALL THIS FUNCTION IMMEDIATELY
- User says "add: X, Y, Z" → CALL bulkAddProducts, DON'T describe action in text
- User says "add Case 20 5pcs, Headphones 150 10pcs" → CALL bulkAddProducts({products: [...]})

WHEN TO USE:
✅ "add: iPhone 999 3pcs, Samsung 799 5pcs, Xiaomi 399" → CALL bulkAddProducts
✅ "add Case 20 5pcs, Headphones 150 10pcs, Charger 30" → CALL bulkAddProducts
✅ "new arrivals: red mug $10, green one $12" → CALL bulkAddProducts
❌ "add iPhone for 999" → use addProduct (single item)

CRITICAL - ANTI-HALLUCINATION:
- NEVER invent products that user did NOT request
- If user said "2 products" → add EXACTLY 2 products
- If user said "iPhone and Samsung" → add EXACTLY these 2 products
- FORBIDDEN to add "similar", "additional" or "recommended" products
- Only THOSE products that user EXPLICITLY listed

CRITICAL - EXECUTION:
- NEVER respond with text when user lists multiple products
- ALWAYS call this function immediately when 2+ products detected
- Extract all product data from user message and call function
- Default stock = 1 if not specified
- DO NOT ask confirmation, DO NOT describe action - just CALL the function`,
      parameters: {
        type: 'object',
        properties: {
          products: {
            type: 'array',
            description:
              'Array of products to add. Example: [{name: "iPhone", price: 999, stock: 3}, {name: "AirPods", price: 199}]',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description:
                    'Product name (minimum 3 characters). Extract from user message. Examples: "iPhone 15", "Case", "red car"',
                },
                price: {
                  type: 'number',
                  description:
                    'Product price in USD (must be > 0). Extract from user message: "$500", "1000$", "price 999". Examples: 999, 49.90, 0.01 (minimum). NEVER use 0 or negative values.',
                  minimum: 0.01,
                },
                stock: {
                  type: 'number',
                  description:
                    'Stock quantity. Defaults to 1 if not specified. Extract from: "5pcs", "10 pcs", "2 pieces". Must be >= 0.',
                },
              },
              required: ['name', 'price'],
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
      name: 'deleteProduct',
      description: `Delete a single product by name.

Use this when:
- User wants to remove one specific product
- User says "delete iPhone", "delete Samsung", "remove product"

Don't use if:
- User wants to delete multiple specific products (use bulkDeleteByNames)
- User wants to delete ALL products (use bulkDeleteAll)

IMPORTANT:
- If user didn't specify product name, ask "Which product to delete?" BEFORE calling
- If search returns multiple matches, ask user to clarify which one`,
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description:
              'Product name to delete (fuzzy match supported). REQUIRED: If user didn\'t mention product name, ask before calling. Examples: "iPhone" will match "iPhone 15 Pro", "Case" will find "Case for Samsung"',
          },
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
      name: 'listProducts',
      description: `Show list of all products in the shop.

Use this when:
- User wants to see all products
- User says "show products", "list products", "what's in the store?", "show all items"

Don't use if:
- User wants to find specific product (use searchProduct)

No parameters needed - returns all products automatically.`,
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
      description: `Search for product by name using fuzzy matching.

Use this when:
- User asks about specific product but name is partial/unclear
- You need to confirm which product user means (multiple possible matches)
- User says "find iPhone", "search for Samsung", "do you have a Case?"

Don't use if:
- User wants to see ALL products (use listProducts)
- You already know exact product name (use getProductInfo)

Fuzzy match examples:
- Query "iPhone" will find: "iPhone 15 Pro", "iPhone 14", "Case for iPhone"
- Query "Case" will find: "Case for Samsung", "Leather Case"`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Search query (partial match supported). Examples: "iPhone" will match "iPhone 15 Pro Max", "case" will match "Case for Samsung". Can be in any language.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'bulkUpdateProducts',
      description: `Update MULTIPLE SPECIFIC products (2-5 products) at once by their names.

WHEN TO USE:
✅ User mentions 2+ specific product names → CALL THIS FUNCTION (not updateProduct multiple times)
✅ "20% discount on iPhone and MacBook" → bulkUpdateProducts([{productName:"iPhone",updates:{discount_percentage:20}},{productName:"MacBook",updates:{discount_percentage:20}}])
✅ "set price 100 for iPhone, iPad, MacBook" → bulkUpdateProducts with 3 products
✅ "rename iPhone to iPhone 15 and MacBook to MacBook Pro" → bulkUpdateProducts with name updates
❌ "discount on everything" → use bulkUpdatePrices (all products)
❌ "discount on iPhone" → use updateProduct or applyDiscount (single product)

IMPORTANT: When user lists multiple products with same operation (e.g., "20% discount on iPhone and MacBook"), DO NOT call updateProduct/applyDiscount multiple times. Instead, call bulkUpdateProducts ONCE with ALL products.

Examples:
- "20% discount on iPhone and MacBook" → bulkUpdateProducts({products:[{productName:"iPhone",updates:{discount_percentage:20}},{productName:"MacBook",updates:{discount_percentage:20}}]})
- "set stock 5 for iPhone and iPad" → bulkUpdateProducts({products:[{productName:"iPhone",updates:{stock_quantity:5}},{productName:"iPad",updates:{stock_quantity:5}}]})
- "price 999 for iPhone, 1299 for MacBook" → bulkUpdateProducts({products:[{productName:"iPhone",updates:{price:999}},{productName:"MacBook",updates:{price:1299}}]})`,
      parameters: {
        type: 'object',
        properties: {
          products: {
            type: 'array',
            description: 'Array of products to update with their names and updates',
            items: {
              type: 'object',
              properties: {
                productName: {
                  type: 'string',
                  description: 'Exact name of the product to update',
                },
                updates: {
                  type: 'object',
                  description: 'Fields to update for this product',
                  properties: {
                    name: {
                      type: 'string',
                      description: 'New product name',
                    },
                    price: {
                      type: 'number',
                      description: 'New price in USD',
                    },
                    stock_quantity: {
                      type: 'number',
                      description: 'New stock quantity',
                    },
                    discount_percentage: {
                      type: 'number',
                      description: 'Discount percentage (0-100)',
                      minimum: 0,
                      maximum: 100,
                    },
                  },
                  additionalProperties: false,
                },
              },
              required: ['productName', 'updates'],
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
      description: `Modify an existing product: name, price, stock, discount.

Use for commands "rename", "set price", "set stock", "15% discount", "make out of stock".

Examples:
- "set price 1299" (after discussing MacBook) → updateProduct({ productName: "MacBook...", updates: { price: 1299 } })
- "set stock 0" → updates.stock_quantity = 0
- "25% discount on iPhone for 3 days" → updates.discount_percentage = 25, updates.discount_expires_at = "3d"
- "скидка 20% на iPad на 24 часа" → updates.discount_percentage = 20, updates.discount_expires_at = "24h"
- "cancel discount on AirPods" → discount_percentage = 0 (backend will restore price from original_price)

Rules:
- If product is not specified and cannot be clearly understood from context - ask which one.
- If product is the only one or was just discussed - use it without questions.
- discount_percentage 0-100. For timer you can pass ISO date or phrase like "6 hours".
- If user gives multiple changes at once, combine them into one call.`,
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description:
              'Current product name to search (fuzzy match supported). REQUIRED: If user didn\'t mention product name, ask "Which product to update?" before calling. Examples: "iPhone" will match "iPhone 15 Pro", "Case" will match "Case for Samsung"',
          },
          updates: {
            type: 'object',
            description:
              'Fields to update (at least one required). Only include fields that user wants to change.',
            properties: {
              name: {
                type: 'string',
                description:
                  'New product name. Only include if user wants to rename. Example: user says "rename iPhone to iPhone 15 Pro Max" → extract "iPhone 15 Pro Max"',
              },
              price: {
                type: 'number',
                description:
                  'New price in USD. Only include if user wants to change price. Must be positive. Examples: user says "set price 999" → 999, "change price to $1299" → 1299',
              },
              stock_quantity: {
                type: 'number',
                description:
                  'New stock count. Use when user says "set stock 10", "set availability 5", "set stock to 20". Must be >= 0. Examples: "5 pieces" → 5, "out of stock" → 0, "100 pcs" → 100',
              },
              discount_percentage: {
                type: 'number',
                description:
                  'Discount percentage (0-100). Use to apply or remove a discount for this product. 0 removes the discount.',
              },
              discount_expires_at: {
                type: 'string',
                description:
                  'Discount expiry. Use EXACT number from user. Examples: "6h"/"6 hours"/"6 часов", "24h"/"24 hours"/"24 часа", "3d"/"3 days"/"3 дня". Russian: "на 24 часа" → "24h", "на 2 дня" → "2d". Leave empty/null for permanent discount.',
              },
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
      name: 'bulkDeleteAll',
      description: `Delete ALL products from the shop.

Use this when:
- User explicitly wants to delete ALL products
- User says "delete all products", "delete all products", "clear the store"

Don't use if:
- User wants to delete specific products (use deleteProduct or bulkDeleteByNames)

DANGEROUS OPERATION!
- NEVER call this function directly when user first asks
- ALWAYS return error asking for confirmation first (call with confirm: false or without confirm parameter)
- Function will show confirmation buttons to user
- ONLY call with confirm: true after user clicked confirmation button (you'll see "confirmed" in next message)

Critical rules:
- First call: bulkDeleteAll({ confirm: false }) - shows buttons, returns needsConfirmation: true
- User confirms by clicking button (not by text "yes")
- After button click: function executes automatically
- DO NOT call this function multiple times in one conversation
- If function returns needsConfirmation: true - tell user to click button

Example flow:
1. User: "delete all products"
2. You: Call bulkDeleteAll({ confirm: false })
3. Function: Returns { needsConfirmation: true, message: "..." }
4. You: Tell user "Click the button to confirm"
5. User: *clicks button*
6. System: Executes deletion automatically (you don't call function again)`,
      parameters: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            description:
              'Confirmation flag (must be true to proceed). Set to true ONLY after user explicitly confirmed deletion of all products. Never set to true without confirmation.',
          },
        },
        required: ['confirm'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'bulkDeleteByNames',
      description: `Delete multiple specific products by their names.

Use this when:
- User wants to delete 2 or more specific products
- User says "delete iPhone and Samsung", "delete MacBook, iPad, AirPods"
- User provides a list of products to remove

Don't use if:
- User wants to delete only one product (use deleteProduct)
- User wants to delete ALL products (use bulkDeleteAll)

IMPORTANT: DO NOT respond with text explanation. Extract product names from user message and CALL the function immediately.`,
      parameters: {
        type: 'object',
        properties: {
          productNames: {
            type: 'array',
            items: {
              type: 'string',
            },
            description:
              'Array of product names to delete (fuzzy match supported for each). Examples: ["iPhone", "Samsung"] will match "iPhone 15 Pro" and "Samsung Galaxy S24". Extract all product names from user message.',
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
      name: 'bulkDeleteExcept',
      description: `Delete all products EXCEPT specified ones.

CALL CONDITIONS:
- User says "delete everything except iPad", "delete all except iPhone", "remove everything except MacBook and AirPods" → CALL THIS FUNCTION IMMEDIATELY
- User wants to keep specific products and delete the rest → CALL bulkDeleteExcept
- Extract product names to KEEP from user message → CALL function with excludedProducts

WHEN TO USE:
✅ "delete everything except iPad" → CALL bulkDeleteExcept({ excludedProducts: ["iPad"] })
✅ "delete all except iPhone and Samsung" → CALL bulkDeleteExcept({ excludedProducts: ["iPhone", "Samsung"] })
✅ "clear store except MacBook" → CALL bulkDeleteExcept({ excludedProducts: ["MacBook"] })
❌ "delete all products" → use bulkDeleteAll (no exceptions)
❌ "delete iPhone and Samsung" → use bulkDeleteByNames (specific products)

CRITICAL:
- NEVER respond with text when user says "everything except X"
- ALWAYS call this function immediately
- Extract names of products to KEEP (not to delete)
- DO NOT ask confirmation - just CALL the function`,
      parameters: {
        type: 'object',
        properties: {
          excludedProducts: {
            type: 'array',
            items: {
              type: 'string',
            },
            description:
              'Array of product names to KEEP (not delete). All other products will be deleted. Fuzzy match supported. Examples: ["iPad"] will keep "iPad Pro", ["iPhone", "MacBook"] will keep both. Extract from "except X" or "except Y".',
          },
        },
        required: ['excludedProducts'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'recordSale',
      description: `Record a sale - decrease stock quantity.

CALL CONDITIONS:
- User says "sold iPhone", "sold 3 AirPods", "bought 5 Samsung" → CALL THIS FUNCTION IMMEDIATELY
- User reports any sale → CALL recordSale, DON'T respond with text
- Extract product name and quantity from user message → CALL function

WHEN TO USE:
✅ "sold iPhone" → CALL recordSale({ productName: "iPhone", quantity: 1 })
✅ "sold 3 MacBook" → CALL recordSale({ productName: "MacBook", quantity: 3 })
✅ "bought 2 AirPods" → CALL recordSale({ productName: "AirPods", quantity: 2 })
❌ "set stock 5" → use updateProduct (manual stock change)

CRITICAL:
- NEVER respond with text when user reports a sale
- ALWAYS call this function immediately when sale is mentioned
- Default quantity = 1 if not specified
- DO NOT describe action - just CALL the function`,
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description:
              'Product name (fuzzy match supported). REQUIRED: If user didn\'t mention product, ask before calling. Examples: "iPhone" will match "iPhone 15 Pro", "Case" will match "Case for Samsung"',
          },
          quantity: {
            type: 'number',
            description:
              'Number of items sold. If omitted, assume 1 automatically. Examples: "sold 5 pieces" → 5, "sold iPhone" → 1. Must be positive number.',
          },
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
      name: 'getProductInfo',
      description: `Get detailed information about a product (price, stock, etc).

Use this when:
- User asks about specific product details
- User says "how much is iPhone?", "what's the price of Samsung?"
- User says "how many Cases left?", "how many AirPods left?"

Don't use if:
- User wants to see all products (use listProducts)
- User wants to search/find products (use searchProduct)

IMPORTANT: If user didn't specify product name, ask "Which product?" before calling.`,
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description:
              'Product name to get info about (fuzzy match supported). REQUIRED: If user didn\'t mention product, ask before calling. Examples: "iPhone" will find "iPhone 15 Pro", "Headphones" will find "AirPods Headphones"',
          },
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
      name: 'applyDiscount',
      description: `Apply discount to a specific product.

Examples:
- User: "30% discount on iPhone" → applyDiscount({ productName: "iPhone", percentage: 30 })
- User: "15% discount on AirPods for 6 hours" → applyDiscount({ productName: "AirPods", percentage: 15, duration: "6h" })
- User: "20% discount on MacBook for 2 days" → applyDiscount({ productName: "MacBook", percentage: 20, duration: "2d" })
- User: "скидка 25% на iPhone на 24 часа" → applyDiscount({ productName: "iPhone", percentage: 25, duration: "24h" })
- User: "скидка 10% на iPad на 3 дня" → applyDiscount({ productName: "iPad", percentage: 10, duration: "3d" })

Duration format (English and Russian):
- "6h" / "6 hours" / "6 часов" - expires in 6 hours
- "2d" / "2 days" / "2 дня" - expires in 2 days
- "1w" / "1 week" / "1 неделя" - expires in 1 week
- "24h" / "24 hours" / "24 часа" - expires in 24 hours
- IMPORTANT: Use EXACT number from user request (user says "24 часа" → duration: "24h", NOT "20h")
- null - permanent discount`,
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description: 'Name of the product to apply discount to',
          },
          percentage: {
            type: 'number',
            description: 'Discount percentage (1-99)',
          },
          duration: {
            type: 'string',
            description:
              'Optional: discount duration. Use EXACT number from user request. Examples: "24h" for "24 часа/hours", "6h" for "6 часов/hours", "2d" for "2 дня/days", "1w" for "1 неделя/week". Russian: "на 24 часа" → "24h", "на 3 дня" → "3d". If not specified - permanent discount.',
          },
        },
        required: ['productName', 'percentage'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    strict: true,
    function: {
      name: 'removeDiscount',
      description: `Remove discount from a product.

Examples:
- User: "remove discount from iPhone" → removeDiscount({ productName: "iPhone" })
- User: "delete discount MacBook" → removeDiscount({ productName: "MacBook" })`,
      parameters: {
        type: 'object',
        properties: {
          productName: {
            type: 'string',
            description: 'Name of the product to remove discount from',
          },
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
      name: 'bulkUpdatePrices',
      description: `Apply discount or markup to the whole catalog.

Use when user explicitly says "15% discount on everything", "raise prices by 5%", "20% sale except MacBook". For single product use updateProduct.

Examples:
- "20% discount on everything" → bulkUpdatePrices({ percentage: 20, operation: 'decrease', discount_type: 'permanent' })
- "-15% on catalog for 6 hours" → percentage: 15, operation: 'decrease', discount_type: 'timer', duration: '6h'
- "скидка 10% на всё на 24 часа" → percentage: 10, operation: 'decrease', discount_type: 'timer', duration: '24h'
- "raise prices by 7%, except accessories" → operation: 'increase', excludedProducts: ['accessory']

Rules:
- Percentage is required (0.1-100). Reject values >100 with a hint.
- If type not specified, default to permanent discount. Only require timer when user mentions it.
- excludedProducts - list of names or parts thereof to skip.
- Markup (increase) is always permanent, don't send duration in this case.`,
      parameters: {
        type: 'object',
        properties: {
          percentage: {
            type: 'number',
            description:
              'Percentage to change (positive number, 0.1 to 100). Examples: user says "10% discount" → 10, "increase by 5%" → 5, "markup 15%" → 15. Extract ONLY the number.',
            minimum: 0.1,
            maximum: 100,
          },
          operation: {
            type: 'string',
            enum: ['increase', 'decrease'],
            description:
              'Operation type. "decrease" = discount (lower prices). "increase" = markup (raise prices). Examples: "discount" → decrease, "raise prices" → increase, "discount" → decrease.',
          },
          discount_type: {
            type: 'string',
            enum: ['permanent', 'timer'],
            description:
              'Optional explicit discount type. Use "timer" together with duration, or "permanent" for indefinite discounts.',
          },
          duration: {
            type: 'string',
            description:
              'Duration for timer discount. Use EXACT number from user. Examples: "6h"/"6 hours"/"6 часов", "24h"/"24 hours"/"24 часа", "2d"/"2 days"/"2 дня". Russian: "на 24 часа" → "24h", "на 3 дня" → "3d". Only fill if user provided duration.',
          },
          excludedProducts: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Product names to EXCLUDE from discount. Use when user says "except X", "except Y", "all except Z", "without X". Example: ["MacBook", "iPhone"]. Supports partial names - "iPhone" will exclude "iPhone 12 Pro", "iPhone 13", etc. Case insensitive.',
          },
        },
        required: ['percentage', 'operation'],
        additionalProperties: false,
      },
    },
  },
];

export default productTools;
