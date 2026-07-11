import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@withmini/shared': path.resolve(__dirname, '../../packages/shared/src'),
        },
    },
    server: {
        port: 5175,
    },
});
