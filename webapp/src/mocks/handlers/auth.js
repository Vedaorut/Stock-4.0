import { http, HttpResponse } from 'msw';

const BASE_URL = 'http://localhost:3000';

export const authHandlers = [
  // POST /api/auth/telegram-validate - Telegram WebApp authorization
  http.post(`${BASE_URL}/api/auth/telegram-validate`, async ({ request }) => {
    await request.json();

    // Mock JWT token
    const mockToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidGVsZWdyYW1JZCI6IjEyMzQ1Njc4OSIsInVzZXJuYW1lIjoidGVzdCIsImlhdCI6MTY5MDAwMDAwMCwiZXhwIjoxNzAwMDAwMDAwfQ.mock-signature';

    return HttpResponse.json({
      success: true,
      token: mockToken,
      user: {
        id: 1,
        telegram_id: '123456789',
        username: 'test_user',
        first_name: 'Test',
        last_name: 'User',
      },
    });
  }),
];
