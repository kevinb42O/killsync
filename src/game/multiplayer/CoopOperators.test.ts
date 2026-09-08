import { describe, expect, it } from 'vitest';
import { COOP_OPERATOR_DEFINITIONS, isCoopArtifactSpenderCharged } from './CoopOperators';

describe('co-op operator special readiness', () => {
  it.each(COOP_OPERATOR_DEFINITIONS)('$className activates at $spenderCost $resourceLabel', operator => {
    expect(isCoopArtifactSpenderCharged(operator.id, operator.spenderCost - 1)).toBe(false);
    expect(isCoopArtifactSpenderCharged(operator.id, operator.spenderCost)).toBe(true);
  });

  it('uses the minimum viable Echo Collapse seal and Hellseed fragment cost', () => {
    expect(isCoopArtifactSpenderCharged('void_runner', 1)).toBe(true);
    expect(isCoopArtifactSpenderCharged('royal_inferno', 3)).toBe(true);
  });
});
