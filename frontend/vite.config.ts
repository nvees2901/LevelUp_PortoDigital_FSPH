import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Limita o uso de memória do file watcher
    watch: {
      // Usa polling com intervalo maior para reduzir CPU
      usePolling: false,
      // Ignora pastas pesadas que não precisam ser monitoradas
      ignored: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    },
    // Desabilita pre-transform de todos os arquivos (carrega sob demanda)
    warmup: {
      clientFiles: [],
    },
  },
  optimizeDeps: {
    // Limita o número de dependências pré-bundled em paralelo
    entries: ['src/main.tsx'],
  },
  build: {
    // Reduz uso de memória durante build
    sourcemap: false,
    chunkSizeWarningLimit: 500,
  },
})
