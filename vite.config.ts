import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // O worker importa o jsPDF, e o formato IIFE padrão não permite code-splitting.
  // Navegador sem worker de módulo cai no caminho da thread principal (posterPdf.ts).
  worker: { format: 'es' },
  /*
    O ONNX Runtime localiza o próprio .wasm com `new URL(arquivo, import.meta.url)`. Se o
    pacote for pré-empacotado pelo Vite, esse import.meta.url passa a apontar para
    `node_modules/.vite/deps/`, o arquivo não está lá, e o dev server responde o
    index.html — a inferência morre com "expected magic word 00 61 73 6d, found 3c 21 64
    6f", que são os primeiros bytes de "<!doctype". Fora da otimização, o URL resolve
    para o pacote de verdade. No build de produção o Vite já emite o wasm como asset e
    isto não tem efeito.
  */
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
