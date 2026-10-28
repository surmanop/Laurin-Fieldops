import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

// Two builds from one codebase:
//   npm run build       -> production app, talks to Supabase/Postgres, Microsoft sign-in
//   npm run build:demo  -> same app, data kept in the browser, sign-in replaced by a user picker
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: [react({ jsxRuntime: 'classic' })],
    resolve: {
      alias: {
        '@adapter': here(demo ? './src/data/demoAdapter.js' : './src/data/supabaseAdapter.js'),
        '@auth': here(demo ? './src/auth/demoAuth.js' : './src/auth/microsoftAuth.js'),
      },
    },
    define: { __DEMO__: JSON.stringify(demo) },
    build: demo
      ? {
          outDir: 'dist-demo',
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          rollupOptions: {
            input: here('./src/main.jsx'),
            external: ['react', 'react-dom', 'react-dom/client'],
            output: {
              format: 'iife',
              entryFileNames: 'app.js',
              assetFileNames: 'app.[ext]',
              inlineDynamicImports: true,
              globals: { react: 'React', 'react-dom': 'ReactDOM', 'react-dom/client': 'ReactDOM' },
            },
          },
        }
      : { outDir: 'dist' },
  };
});
