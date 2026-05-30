import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 3002, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
});
