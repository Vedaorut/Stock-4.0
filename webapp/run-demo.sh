#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 Starting WebApp in FRONTEND DEMO MODE..."
echo "Simulating backend data. No server required."
export VITE_DEMO_MODE=true
npm run dev
