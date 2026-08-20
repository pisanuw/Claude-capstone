import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps the build portable: works at the domain root (Netlify)
// and under a subpath (GitHub Pages project sites) without configuration.
export default defineConfig({
  base: './',
  plugins: [react()],
});
