import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getOrdersByShop,
  updateOrderStatus
} from '../utils/api.js';
import {
  productListKeyboard,
  productDetailKeyboard,
  editProductKeyboard,
  ordersMenuKeyboard,
  orderDetailKeyboard,
  backToSellerMenuKeyboard
} from '../keyboards/sellerMenu.js';

// Handle add product
export async function handleAddProduct(ctx) {
  try {
    await ctx.answerCbQuery();

    // Check if seller has a shop
    if (!ctx.session.shopId) {
      await ctx.reply('❌ У вас нет магазина. Создайте магазин сначала.');
      return;
    }

    ctx.session.state = 'adding_product_name';
    ctx.session.data = {
      shopId: ctx.session.shopId,
      product: {}
    };

    await ctx.editMessageText(
      `➕ Добавление товара\n\n` +
      `Шаг 1/5: Введите название товара\n\n` +
      `Например: "Nike Air Max 90" или "iPhone 15 Pro"`
    );
  } catch (error) {
    console.error('Error in handleAddProduct:', error);
    await ctx.reply('❌ Ошибка при добавлении товара.');
  }
}

// Handle product name input
export async function handleProductNameInput(ctx) {
  try {
    if (ctx.session.state !== 'adding_product_name') {
      return;
    }

    const productName = ctx.message.text.trim();

    if (productName.length < 3) {
      await ctx.reply('❌ Название слишком короткое. Минимум 3 символа.');
      return;
    }

    if (productName.length > 100) {
      await ctx.reply('❌ Название слишком длинное. Максимум 100 символов.');
      return;
    }

    ctx.session.data.product.name = productName;
    ctx.session.state = 'adding_product_description';

    await ctx.reply(
      `✅ Название: ${productName}\n\n` +
      `Шаг 2/5: Введите описание товара\n\n` +
      `Опишите товар подробно. Укажите особенности, характеристики, состояние.`
    );
  } catch (error) {
    console.error('Error in handleProductNameInput:', error);
    await ctx.reply('❌ Ошибка при вводе названия.');
  }
}

// Handle product description input
export async function handleProductDescriptionInput(ctx) {
  try {
    if (ctx.session.state !== 'adding_product_description') {
      return;
    }

    const description = ctx.message.text.trim();

    if (description.length < 10) {
      await ctx.reply('❌ Описание слишком короткое. Минимум 10 символов.');
      return;
    }

    if (description.length > 1000) {
      await ctx.reply('❌ Описание слишком длинное. Максимум 1000 символов.');
      return;
    }

    ctx.session.data.product.description = description;
    ctx.session.state = 'adding_product_price';

    await ctx.reply(
      `✅ Описание сохранено\n\n` +
      `Шаг 3/5: Введите цену товара в долларах\n\n` +
      `Например: 150 или 1499.99`
    );
  } catch (error) {
    console.error('Error in handleProductDescriptionInput:', error);
    await ctx.reply('❌ Ошибка при вводе описания.');
  }
}

// Handle product price input
export async function handleProductPriceInput(ctx) {
  try {
    if (ctx.session.state !== 'adding_product_price') {
      return;
    }

    const priceText = ctx.message.text.trim();
    const price = parseFloat(priceText);

    if (isNaN(price) || price <= 0) {
      await ctx.reply('❌ Неверный формат цены. Введите число больше 0.');
      return;
    }

    if (price > 1000000) {
      await ctx.reply('❌ Цена слишком высокая. Максимум $1,000,000.');
      return;
    }

    ctx.session.data.product.price = price;
    ctx.session.state = 'adding_product_stock';

    await ctx.reply(
      `✅ Цена: $${price.toFixed(2)}\n\n` +
      `Шаг 4/5: Введите количество товара в наличии\n\n` +
      `Например: 10 или 1`
    );
  } catch (error) {
    console.error('Error in handleProductPriceInput:', error);
    await ctx.reply('❌ Ошибка при вводе цены.');
  }
}

// Handle product stock input
export async function handleProductStockInput(ctx) {
  try {
    if (ctx.session.state !== 'adding_product_stock') {
      return;
    }

    const stockText = ctx.message.text.trim();
    const stock = parseInt(stockText);

    if (isNaN(stock) || stock < 0) {
      await ctx.reply('❌ Неверный формат количества. Введите целое число больше или равное 0.');
      return;
    }

    if (stock > 10000) {
      await ctx.reply('❌ Слишком большое количество. Максимум 10,000.');
      return;
    }

    ctx.session.data.product.stock = stock;
    ctx.session.state = 'adding_product_image';

    await ctx.reply(
      `✅ Количество: ${stock}\n\n` +
      `Шаг 5/5: Отправьте фото товара\n\n` +
      `Отправьте изображение товара или напишите "пропустить" если хотите добавить фото позже.`
    );
  } catch (error) {
    console.error('Error in handleProductStockInput:', error);
    await ctx.reply('❌ Ошибка при вводе количества.');
  }
}

// Handle product image input
export async function handleProductImageInput(ctx) {
  try {
    if (ctx.session.state !== 'adding_product_image') {
      return;
    }

    let imageUrl = null;

    // Check if user sent a photo
    if (ctx.message.photo && ctx.message.photo.length > 0) {
      // Get the largest photo
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      imageUrl = photo.file_id; // Store file_id for now
      // In production, you should upload this to your storage and get URL
    } else if (ctx.message.text && ctx.message.text.toLowerCase() === 'пропустить') {
      imageUrl = null;
    } else {
      await ctx.reply(
        '❌ Пожалуйста, отправьте фото или напишите "пропустить".'
      );
      return;
    }

    ctx.session.data.product.imageUrl = imageUrl;

    await ctx.reply('⏳ Создаем товар...');

    // Create product
    const productData = {
      name: ctx.session.data.product.name,
      description: ctx.session.data.product.description,
      price: ctx.session.data.product.price,
      stock: ctx.session.data.product.stock,
      imageUrl: ctx.session.data.product.imageUrl,
    };

    const result = await createProduct(ctx.session.data.shopId, productData);

    if (result.success) {
      const product = result.data;

      // Clear session
      ctx.session.state = null;
      ctx.session.data = {};

      await ctx.reply(
        `✅ Товар успешно добавлен!\n\n` +
        `📦 ${product.name}\n` +
        `💰 Цена: $${product.price}\n` +
        `📊 В наличии: ${product.stock}\n\n` +
        `Товар теперь доступен для покупателей!`,
        backToSellerMenuKeyboard()
      );
    } else {
      await ctx.reply(
        `❌ Ошибка создания товара: ${result.error}\n\n` +
        `Попробуйте еще раз.`,
        backToSellerMenuKeyboard()
      );
    }
  } catch (error) {
    console.error('Error in handleProductImageInput:', error);
    await ctx.reply('❌ Ошибка при добавлении изображения.');
  }
}

// Handle view products list
export async function handleViewProducts(ctx, shopId) {
  try {
    await ctx.answerCbQuery();

    await ctx.editMessageText('⏳ Загружаем товары...');

    const result = await getProducts(shopId);

    if (result.success && result.data) {
      const products = result.data;

      if (products.length === 0) {
        await ctx.editMessageText(
          `📦 Товары магазина\n\n` +
          `У вас пока нет товаров.\n\n` +
          `Добавьте первый товар!`,
          productListKeyboard([])
        );
      } else {
        await ctx.editMessageText(
          `📦 Товары магазина (${products.length})\n\n` +
          `Выберите товар для просмотра:`,
          productListKeyboard(products)
        );
      }
    } else {
      await ctx.editMessageText(
        `❌ Ошибка загрузки товаров: ${result.error}`,
        backToSellerMenuKeyboard()
      );
    }
  } catch (error) {
    console.error('Error in handleViewProducts:', error);
    await ctx.reply('❌ Ошибка при загрузке товаров.');
  }
}

// Handle view product detail
export async function handleViewProductDetail(ctx, productId) {
  try {
    await ctx.answerCbQuery();

    // Get product from session or fetch from API
    // For now, using mock data
    const product = {
      id: productId,
      name: 'Product Name',
      description: 'Product description',
      price: 100,
      stock: 10,
      imageUrl: null
    };

    let message = `📦 ${product.name}\n\n`;
    message += `📝 ${product.description}\n\n`;
    message += `💰 Цена: $${product.price}\n`;
    message += `📊 В наличии: ${product.stock}\n`;

    await ctx.editMessageText(message, productDetailKeyboard(productId));
  } catch (error) {
    console.error('Error in handleViewProductDetail:', error);
    await ctx.reply('❌ Ошибка при загрузке товара.');
  }
}

// Handle delete product
export async function handleDeleteProduct(ctx, productId) {
  try {
    await ctx.answerCbQuery('⏳ Удаляем товар...');

    const result = await deleteProduct(productId);

    if (result.success) {
      await ctx.answerCbQuery('✅ Товар удален');

      await ctx.editMessageText(
        `✅ Товар успешно удален!\n\n` +
        `Товар больше не доступен для покупателей.`,
        backToSellerMenuKeyboard()
      );
    } else {
      await ctx.answerCbQuery(`❌ ${result.error}`);
    }
  } catch (error) {
    console.error('Error in handleDeleteProduct:', error);
    await ctx.answerCbQuery('❌ Ошибка при удалении товара.');
  }
}

// Handle my orders
export async function handleMyOrders(ctx) {
  try {
    await ctx.answerCbQuery();

    await ctx.editMessageText(
      `📦 Мои заказы\n\n` +
      `Выберите категорию заказов:`,
      ordersMenuKeyboard()
    );
  } catch (error) {
    console.error('Error in handleMyOrders:', error);
    await ctx.reply('❌ Ошибка при загрузке заказов.');
  }
}

// Handle orders by status
export async function handleOrdersByStatus(ctx, status) {
  try {
    await ctx.answerCbQuery();

    if (!ctx.session.shopId) {
      await ctx.reply('❌ У вас нет магазина.');
      return;
    }

    await ctx.editMessageText('⏳ Загружаем заказы...');

    const result = await getOrdersByShop(ctx.session.shopId);

    if (result.success && result.data) {
      let orders = result.data;

      // Filter by status
      orders = orders.filter(o => o.status === status);

      if (orders.length === 0) {
        const statusText = status === 'new' ? 'новых' :
                          status === 'processing' ? 'в обработке' :
                          status === 'completed' ? 'завершенных' :
                          'отмененных';

        await ctx.editMessageText(
          `📦 Заказы\n\n` +
          `У вас нет ${statusText} заказов.`,
          ordersMenuKeyboard()
        );
      } else {
        let ordersList = `📦 Заказы (${orders.length})\n\n`;

        orders.slice(0, 10).forEach((order, index) => {
          const statusEmoji = order.status === 'new' ? '🆕' :
                             order.status === 'processing' ? '⏳' :
                             order.status === 'shipped' ? '📦' :
                             order.status === 'completed' ? '✅' : '❌';

          ordersList += `${index + 1}. ${statusEmoji} Заказ #${order.id}\n`;
          ordersList += `   Покупатель: ${order.buyer?.username || 'N/A'}\n`;
          ordersList += `   Сумма: $${order.total}\n\n`;
        });

        if (orders.length > 10) {
          ordersList += `\n... и еще ${orders.length - 10} заказов\n`;
          ordersList += `\nОткройте веб-приложение для просмотра всех заказов.`;
        }

        await ctx.editMessageText(ordersList, ordersMenuKeyboard());
      }
    } else {
      await ctx.editMessageText(
        `❌ Ошибка загрузки заказов: ${result.error}`,
        ordersMenuKeyboard()
      );
    }
  } catch (error) {
    console.error('Error in handleOrdersByStatus:', error);
    await ctx.reply('❌ Ошибка при загрузке заказов.');
  }
}

// Handle update order status
export async function handleUpdateOrderStatus(ctx, orderId, newStatus) {
  try {
    await ctx.answerCbQuery('⏳ Обновляем статус...');

    const result = await updateOrderStatus(orderId, newStatus);

    if (result.success) {
      await ctx.answerCbQuery('✅ Статус обновлен');

      const statusText = newStatus === 'processing' ? 'принят в обработку' :
                        newStatus === 'shipped' ? 'отправлен' :
                        newStatus === 'completed' ? 'завершен' :
                        newStatus === 'rejected' ? 'отклонен' : 'обновлен';

      await ctx.editMessageText(
        `✅ Заказ #${orderId} ${statusText}\n\n` +
        `Покупатель получит уведомление об изменении статуса.`,
        backToSellerMenuKeyboard()
      );

      // TODO: Send notification to buyer
    } else {
      await ctx.answerCbQuery(`❌ ${result.error}`);
    }
  } catch (error) {
    console.error('Error in handleUpdateOrderStatus:', error);
    await ctx.answerCbQuery('❌ Ошибка при обновлении статуса.');
  }
}

// Handle open webapp for seller
export async function handleOpenWebappSeller(ctx) {
  try {
    await ctx.answerCbQuery();

    const webappUrl = process.env.WEBAPP_URL || 'https://your-webapp-url.com';

    await ctx.editMessageText(
      `🌐 Веб-приложение\n\n` +
      `Откройте полную версию панели управления для:\n` +
      `• Расширенного управления товарами\n` +
      `• Детальной аналитики продаж\n` +
      `• Управления заказами\n` +
      `• Настройки магазина\n\n` +
      `🔗 [Открыть веб-приложение](${webappUrl}/seller)`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌐 Открыть', url: `${webappUrl}/seller` }],
            [{ text: '⬅️ Назад', callback_data: 'seller_menu' }],
          ],
        },
      }
    );
  } catch (error) {
    console.error('Error in handleOpenWebappSeller:', error);
    await ctx.reply('❌ Ошибка при открытии веб-приложения.');
  }
}
