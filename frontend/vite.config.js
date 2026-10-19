import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwindcss()],server:{port:5173,strictPort:true,proxy:{'/api':{target:process.env.API_PROXY_TARGET || 'http://localhost:3000'}}},test:{environment:'jsdom',setupFiles:'./src/tests/setup.js',include:['src/**/*.test.{js,jsx}']}});
