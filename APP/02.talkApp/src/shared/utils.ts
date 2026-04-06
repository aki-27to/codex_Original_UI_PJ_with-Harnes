import crypto from 'node:crypto';

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeText(input: unknown, fallback = '', maxLength = 12_000): string {
  if (typeof input !== 'string') {
    return fallback;
  }
  const cleaned = input.replace(/\r\n?/gu, '\n').replace(/\u0000/gu, '').trim();
  if (!cleaned) {
    return fallback;
  }
  return cleaned.slice(0, maxLength);
}

export function compactText(input: string, maxLength = 400): string {
  return sanitizeText(input, '', maxLength).replace(/\s+/gu, ' ');
}

export function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function pickTop<T>(items: T[], count: number): T[] {
  return items.slice(0, Math.max(0, count));
}

export function safeJsonParse<T>(input: string, fallback: T): T {
  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

export function ratio(numerator: number, denominator: number): number {
  if (!denominator) {
    return 0;
  }
  return numerator / denominator;
}

export function average(numbers: number[]): number {
  if (!numbers.length) {
    return 0;
  }
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

export function toPct(value: number): number {
  return Number((value * 100).toFixed(2));
}
