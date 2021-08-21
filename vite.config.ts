import { defineConfig } from 'vite';
import path from 'path';
import vitePluginTs from 'vite-plugin-ts';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vitePluginTs({
      babelPlugins: [path.join(__dirname, './plugin.js')],
    }),
  ],
});
