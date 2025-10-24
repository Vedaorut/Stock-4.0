# Follow Shop Integration - Implementation Summary

## Overview
Implemented "Подписки" (Subscribers) feature for bot sellers to view who is following/subscribed to their shop.

## Files Created

### 1. `/bot/src/handlers/seller/follows.js`
- **Purpose**: Handler for viewing shop subscribers
- **Key Functions**:
  - `formatFollowsList()` - Formats subscriber list (minimalist design, max 10 items)
  - `handleViewFollows()` - Main handler for `seller:follows` action
  - `setupFollowHandlers()` - Registers handlers with bot
- **API Integration**: Uses `subscriptionApi.getShopSubscribers()` (GET `/api/subscriptions/shop/:shopId`)
- **Error Handling**:
  - 403 Forbidden → "Нет доступа"
  - Other errors → "Ошибка загрузки"
- **Session Requirements**: Requires `shopId` and `token`

## Files Modified

### 2. `/bot/src/handlers/seller/index.js`
- **Change**: Added export for follows handlers
- **Line**: Added `export * from './follows.js';` at top with imports

### 3. `/bot/src/utils/api.js`
- **Change**: Added `getShopSubscribers()` method to `subscriptionApi`
- **Endpoint**: `GET /api/subscriptions/shop/:shopId`
- **Response**: Array of subscribers with user info and subscription dates

### 4. `/bot/src/keyboards/seller.js`
- **Change**: Added "📡 Подписки" button to seller menu
- **Position**: Between "📦 Товары" and "💰 Продажи" buttons
- **Action**: `seller:follows`

### 5. `/bot/src/bot.js`
- **Changes**:
  1. Import: Added `setupFollowHandlers` to imports from `./handlers/seller/index.js`
  2. Registration: Called `setupFollowHandlers(bot)` after `setupSellerHandlers(bot)`

## Backend Integration

### Existing API Endpoint
- **Route**: `GET /api/subscriptions/shop/:shopId`
- **Auth**: JWT token required (Bearer)
- **Access Control**: Only shop owner can view (403 if not owner)
- **Response Structure**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 123,
      "shop_id": 456,
      "user_username": "buyer123",
      "user_first_name": "John",
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 15
  }
}
```

## User Flow

1. **Seller with active shop** → Clicks "📡 Подписки" button
2. **Handler checks**:
   - Shop ID exists in session
   - Token exists in session
3. **API call** to backend: `GET /api/subscriptions/shop/:shopId`
4. **Display**:
   - If no subscribers: "Пока нет подписчиков"
   - If has subscribers: Shows up to 10 with username/name and date
   - "« Назад" button to return to seller menu

## Minimalist Design Compliance

### Message Format
```
📡 Подписки (3) • ShopName

1. @username • 15.01.2025
2. FirstName • 14.01.2025
3. @anotheruser • 13.01.2025

« Назад
```

### Features
- Max 10 subscribers shown
- "+X ещё" if more than 10
- Username preferred, fallback to first name
- Date in Russian locale format
- Single "« Назад" button

## Testing Checklist

- [ ] Seller without shop → Shows "Сначала создайте магазин"
- [ ] Seller without token → Shows "Необходима авторизация"
- [ ] Shop with 0 subscribers → Shows "Пока нет подписчиков"
- [ ] Shop with 1-10 subscribers → Shows all with dates
- [ ] Shop with 11+ subscribers → Shows first 10 + "+X ещё"
- [ ] API 403 error → Shows "Нет доступа"
- [ ] API 500 error → Shows "Ошибка загрузки"
- [ ] Back button → Returns to seller menu

## Integration Points

### Session Data Required
- `ctx.session.shopId` - Current shop ID
- `ctx.session.token` - JWT auth token
- `ctx.session.shopName` - Shop name (for header)

### Handler Registration
```javascript
// In bot.js
setupFollowHandlers(bot);  // After setupSellerHandlers()
```

### Action Triggers
- `seller:follows` - Main entry point (from seller menu button)
- `follows:list` - Alternative trigger (for future use)

## Future Enhancements (Not Implemented)

These features exist in backend but NOT in this bot implementation:
- Create follow (subscribe to another shop for reselling)
- Manage follow markup percentage
- Switch follow mode (monitor vs resell)
- Delete follow
- View detailed follow info

**Note**: The "Подписки" button shows SUBSCRIBERS (who follows the seller's shop), NOT who the seller is following. This is a view-only feature for shop owners.

## Files Summary

**Created**: 1 file
- `/bot/src/handlers/seller/follows.js`

**Modified**: 4 files
- `/bot/src/handlers/seller/index.js`
- `/bot/src/utils/api.js`
- `/bot/src/keyboards/seller.js`
- `/bot/src/bot.js`

**Backend**: No changes needed (API already exists)

## Absolute File Paths

All modified files with absolute paths:
1. `/Users/sile/Documents/Status Stock 4.0/bot/src/handlers/seller/follows.js` (created)
2. `/Users/sile/Documents/Status Stock 4.0/bot/src/handlers/seller/index.js` (modified)
3. `/Users/sile/Documents/Status Stock 4.0/bot/src/utils/api.js` (modified)
4. `/Users/sile/Documents/Status Stock 4.0/bot/src/keyboards/seller.js` (modified)
5. `/Users/sile/Documents/Status Stock 4.0/bot/src/bot.js` (modified)
