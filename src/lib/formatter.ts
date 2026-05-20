// formatter.ts
//
// Formatter utilities for the CLI presentation layer and reporting structures.

import color from 'picocolors';

/**
 * Truncates a string to a maximum length, replacing extra characters with an ellipsis,
 * and normalizing whitespace.
 */
export function truncate(s: string, max: number): string {
  const trimmed = s.replace(/\s+/g, ' ').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * Formats a duration in milliseconds to an easily readable, human-friendly duration string.
 */
export function formatEta(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '<1s';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

/**
 * Returns a padded tag indicator representing current progress, e.g., `[ 1/15]`.
 */
export function progressTag(i: number, n: number): string {
  const width = String(n).length;
  return color.dim(`[${String(i).padStart(width)}/${n}]`);
}

/**
 * Generates an easy-to-read descriptive presentation string for an action payload.
 */
export function describeAction(action: {
  kind: string;
  selector?: string | null;
  url?: string | null;
  text?: string | null;
  ms?: number | null;
}): string {
  const verb = (v: string) => color.yellow(v.padEnd(8));
  switch (action.kind) {
    case 'navigate':
      return `${verb('navigate')} ${truncate(action.url ?? '', 60)}`;
    case 'click':
      return `${verb('click')} ${truncate(action.selector ?? '', 60)}`;
    case 'type':
      return `${verb('type')} "${truncate(action.text ?? '', 30)}" → ${truncate(action.selector ?? '', 40)}`;
    case 'scroll':
      return verb('scroll');
    case 'wait':
      return `${verb('wait')} ${action.ms ?? 0}ms`;
    case 'finish':
      return verb('finish');
    default:
      return action.kind;
  }
}
