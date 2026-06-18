import { defineConfig } from 'vite';
import { builtinModules } from 'module';

export default defineConfig({
  resolve: {
    // Force CJS entry points so Vite doesn't pick up ESM "module" fields
    // that it then fails to bundle and falls back to require().
    mainFields: ['main'],
    conditions: ['node', 'require', 'default'],
  },
  build: {
    rollupOptions: {
      external: ['electron', ...builtinModules, 'bufferutil', 'utf-8-validate'],
    },
  },
});
