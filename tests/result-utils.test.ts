import { describe, expect, it } from 'vitest';
import { describeConnectionIssue } from '../src/result-utils.js';

describe('result-utils connection helpers', () => {
  it('describes connection issues for offline errors', () => {
    const issue = describeConnectionIssue(new Error('fetch failed: connect ECONNREFUSED 127.0.0.1:9999'));
    expect(issue.kind).toBe('offline');
  });
});
