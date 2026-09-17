import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the pure modules (formatting, geometry, plan reducer, agent
 * tools with mocked upstreams). The GUI scenarios in lib/testing run in the
 * app itself (?test=1) because they need the real model and Google Places.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    clearMocks: true,
  },
});
