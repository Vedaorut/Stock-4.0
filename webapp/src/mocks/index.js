export async function enableMocking() {
  const useMockData = import.meta.env.VITE_USE_MOCK_DATA === 'true';

  if (!useMockData) {
    // Using real backend API
    return;
  }

  // Mock mode enabled - using MSW
  const { worker } = await import('./browser');

  await worker.start({
    onUnhandledRequest: 'bypass',
  });

  // MSW worker started
}
