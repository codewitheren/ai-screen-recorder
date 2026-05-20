// constants.ts
//
// Application-wide configuration defaults, selectable options, and constants.

export const VOICES = [
  { value: 'alloy', label: 'Alloy', hint: 'neutral, balanced' },
  { value: 'echo', label: 'Echo', hint: 'warm, confident' },
  { value: 'fable', label: 'Fable', hint: 'expressive, British' },
  { value: 'onyx', label: 'Onyx', hint: 'deep, authoritative' },
  { value: 'nova', label: 'Nova', hint: 'friendly, upbeat' },
  { value: 'shimmer', label: 'Shimmer', hint: 'clear, gentle' },
] as const;

export const LANGUAGES = [
  { value: 'English', label: 'English' },
  { value: 'Turkish', label: 'Türkçe' },
  { value: 'Spanish', label: 'Español' },
  { value: 'French', label: 'Français' },
  { value: 'German', label: 'Deutsch' },
  { value: 'Japanese', label: '日本語' },
  { value: 'Chinese', label: '中文' },
  { value: 'Korean', label: '한국어' },
  { value: 'Portuguese', label: 'Português' },
  { value: 'Arabic', label: 'العربية' },
] as const;

export const DEFAULT_OUT_DIR = './out';
