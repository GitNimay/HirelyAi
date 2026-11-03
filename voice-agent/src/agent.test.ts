import { expect, test } from 'vitest';
import { stripLabels } from './agent.ts';

test('stripLabels drops STT non-speech labels, keeps real words', () => {
  expect(stripLabels('Silence.')).toBe('');
  expect(stripLabels('Silence. Hi Alex,')).toBe('Hi Alex,');
  expect(stripLabels('[noise] I used React. (inaudible) Then Next.js.')).toBe(
    'I used React. Then Next.js.',
  );
  expect(stripLabels('Sure. Silence. We cut the noise floor.')).toBe(
    'Sure. We cut the noise floor.',
  );
  expect(stripLabels('Background noise was an issue in the music app.')).toBe(
    'Background noise was an issue in the music app.',
  );
});
