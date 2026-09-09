import { describe, it, expect } from 'vitest'
import { runSkillEvaluations } from '../scripts/eval-skills'

describe('S4-4 · Skill Evaluation Suite (pnpm eval:skills)', () => {
  it('runs all >= 5 evaluation scenarios and asserts machine-checkable invariants pass', async () => {
    const results = await runSkillEvaluations()

    expect(results.length).toBeGreaterThanOrEqual(5)

    // Check that we have at least 1 negative scenario
    const negativeScenario = results.find(r => r.id.includes('negative'))
    expect(negativeScenario).toBeDefined()
    expect(negativeScenario!.passed).toBe(true)

    // Check all scenarios passed
    for (const r of results) {
      if (!r.passed) {
        throw new Error(`Scenario ${r.id} failed: ${r.error || 'invariants unmet'}`)
      }
      expect(r.passed).toBe(true)
      expect(r.invariants.length).toBeGreaterThan(0)
      for (const inv of r.invariants) {
        expect(inv.passed).toBe(true)
      }
    }
  }, 30000)
})
