import { describe, expect, it } from 'vitest';
import { formatBytes, sanitizeFileName } from '../../src/services/image';

/**
 * O nome do arquivo é o único texto controlado pelo usuário que chega ao PDF: vai para
 * o nome do download e é impresso na folha de montagem (req. 10).
 */
describe('sanitizeFileName', () => {
  it('remove a extensão e troca espaços por hífens', () => {
    expect(sanitizeFileName('minha foto de férias.jpg')).toBe('minha-foto-de-férias');
    expect(sanitizeFileName('poster.final.png')).toBe('poster.final');
  });

  it('remove separadores de caminho', () => {
    expect(sanitizeFileName('../../etc/passwd.jpg')).toBe('etcpasswd');
    expect(sanitizeFileName('C:/Users/alguem/foto.jpg')).toBe('CUsersalguemfoto');
  });

  it('remove a barra invertida, que escapa strings dentro de um PDF', () => {
    expect(sanitizeFileName(String.raw`pasta\sub\foto.jpg`)).toBe('pastasubfoto');
  });

  it('remove parênteses e colchetes, que delimitam strings e vetores em PDF', () => {
    expect(sanitizeFileName('foto (1) [copia] {x}.jpg')).toBe('foto-1-copia-x');
  });

  it('remove caracteres de controle', () => {
    expect(sanitizeFileName('foto\u0000\u001b\u007fruim.jpg')).toBe('fotoruim');
  });

  it('não deixa o nome começar por ponto nem hífen', () => {
    expect(sanitizeFileName('...oculto.jpg')).toBe('oculto');
    expect(sanitizeFileName('--flag.jpg')).toBe('flag');
  });

  it('limita o comprimento', () => {
    expect(sanitizeFileName('a'.repeat(500) + '.jpg')).toHaveLength(60);
  });

  it('cai em um nome padrão quando não sobra nada', () => {
    expect(sanitizeFileName('///.jpg')).toBe('poster');
    expect(sanitizeFileName('')).toBe('poster');
    expect(sanitizeFileName('   ')).toBe('poster');
  });

  it('preserva acentuação, que é legítima em nome de arquivo', () => {
    expect(sanitizeFileName('coração.png')).toBe('coração');
  });
});

describe('formatBytes', () => {
  it('escolhe a unidade legível', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 kB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
