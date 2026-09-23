import { computeRetention } from './retention.js';
import { estimateTokens } from './tokens.js';
import type { CompressionResult, RetentionReport, TokenEstimate } from './types.js';

export interface CompressionSummary {
  original: TokenEstimate;
  compressed: TokenEstimate;
  savedTokens: number;
  savedPercent: number;
  retention: RetentionReport;
}

export function summarize(result: CompressionResult): CompressionSummary {
  const original = estimateTokens(result.originalText);
  const compressed = estimateTokens(result.compressedText);
  const savedTokens = Math.max(0, original.estimatedTokens - compressed.estimatedTokens);
  const savedPercent =
    original.estimatedTokens === 0 ? 0 : Math.round((savedTokens / original.estimatedTokens) * 100);
  const retention = computeRetention(result.originalText, result.compressedText);
  return { original, compressed, savedTokens, savedPercent, retention };
}
