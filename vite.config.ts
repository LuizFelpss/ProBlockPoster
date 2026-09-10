import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // O worker importa o jsPDF, e o formato IIFE padrão não permite code-splitting.
  // Navegador sem worker de módulo cai no caminho da thread principal (posterPdf.ts).
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
