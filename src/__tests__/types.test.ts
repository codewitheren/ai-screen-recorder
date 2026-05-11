import { describe, it, expect } from 'vitest';
import {
  StepActionSchema,
  VerifiedStepSchema,
  ExploreResultSchema,
  AgentTurnSchema,
} from '../types.js';

describe('StepActionSchema', () => {
  it('accepts valid actions', () => {
    expect(StepActionSchema.parse('navigate')).toBe('navigate');
    expect(StepActionSchema.parse('click')).toBe('click');
    expect(StepActionSchema.parse('type')).toBe('type');
    expect(StepActionSchema.parse('wait')).toBe('wait');
    expect(StepActionSchema.parse('scroll')).toBe('scroll');
  });

  it('rejects invalid actions', () => {
    expect(() => StepActionSchema.parse('hover')).toThrow();
    expect(() => StepActionSchema.parse('')).toThrow();
    expect(() => StepActionSchema.parse(123)).toThrow();
  });
});

describe('VerifiedStepSchema', () => {
  it('parses a valid step', () => {
    const step = {
      id: 1,
      action: 'click',
      selector: 'role=button[name="Submit"]',
      input: null,
      narration: 'Clicking the submit button',
    };
    const result = VerifiedStepSchema.parse(step);
    expect(result.id).toBe(1);
    expect(result.action).toBe('click');
    expect(result.selector).toBe('role=button[name="Submit"]');
  });

  it('rejects id <= 0', () => {
    const step = { id: 0, action: 'click', selector: 'a', narration: 'test' };
    expect(() => VerifiedStepSchema.parse(step)).toThrow();
  });

  it('rejects non-integer id', () => {
    const step = { id: 1.5, action: 'click', selector: 'a', narration: 'test' };
    expect(() => VerifiedStepSchema.parse(step)).toThrow();
  });

  it('rejects empty narration', () => {
    const step = { id: 1, action: 'click', selector: 'a', narration: '' };
    expect(() => VerifiedStepSchema.parse(step)).toThrow();
  });

  it('allows nullish selector and input', () => {
    const step = { id: 1, action: 'scroll', narration: 'Scrolling down' };
    const result = VerifiedStepSchema.parse(step);
    expect(result.selector).toBeUndefined();
    expect(result.input).toBeUndefined();
  });
});

describe('ExploreResultSchema', () => {
  it('parses valid explore result', () => {
    const data = {
      title: 'Test title',
      steps: [
        {
          id: 1,
          action: 'navigate',
          selector: null,
          input: 'https://example.com',
          narration: 'Going to the site',
        },
      ],
    };
    const result = ExploreResultSchema.parse(data);
    expect(result.title).toBe('Test title');
    expect(result.steps).toHaveLength(1);
  });

  it('rejects empty steps array', () => {
    const data = { title: 'Test', steps: [] };
    expect(() => ExploreResultSchema.parse(data)).toThrow();
  });
});

describe('AgentTurnSchema', () => {
  it('parses a valid agent turn', () => {
    const turn = {
      thought: 'I need to click the button',
      narration: 'Clicking the sign-up button',
      action: {
        kind: 'click',
        selector: 'role=button[name="Sign Up"]',
        text: null,
        url: null,
        ms: null,
      },
    };
    const result = AgentTurnSchema.parse(turn);
    expect(result.action.kind).toBe('click');
    expect(result.narration).toBe('Clicking the sign-up button');
  });

  it('applies defaults for missing thought and narration', () => {
    const turn = {
      action: { kind: 'finish' },
    };
    const result = AgentTurnSchema.parse(turn);
    expect(result.thought).toBe('');
    expect(result.narration).toBe('');
  });

  it('rejects invalid action kind', () => {
    const turn = {
      thought: '',
      narration: '',
      action: { kind: 'delete' },
    };
    expect(() => AgentTurnSchema.parse(turn)).toThrow();
  });

  it('rejects negative ms', () => {
    const turn = {
      thought: '',
      narration: '',
      action: { kind: 'wait', ms: -100 },
    };
    expect(() => AgentTurnSchema.parse(turn)).toThrow();
  });
});
