---
tags:
  - documentation
  - status
  - roadmap
type: prompt
priority: 1
---

# Generate PROGRESS.md

## Purpose
Track what's done, what's next, and what's blocking progress.

## Questions to Ask

### Current Phase
1. What phase is the project in?
   - Phase 1: Infrastructure (complete?)
   - Phase 2: FHIR Integration?
   - Phase 3: Beta Launch?
   - Phase 4: Scale?

2. What's the completion percentage?
   - Infrastructure: X%
   - Database: X%
   - API: X%
   - Frontend: X%
   - Deployment: X%

### Recently Completed

**Last 7 Days:**
1. What was accomplished in the past week?
   - Code changes?
   - Data imports?
   - Bug fixes?
   - Infrastructure?

**Last 30 Days:**
1. What major milestones hit in the past month?
   - NPI imports?
   - Deployment?
   - Features shipped?

### Currently In Progress

1. What are you actively working on right now?

2. What's partially complete?

3. What's in the "waiting for" state?
   - Waiting for data?
   - Waiting for decisions?
   - Waiting for external dependencies?

### Next Up (Priority Order)

**Immediate (Next 1-2 weeks):**
1. What MUST be done before anything else?
   - Security fixes? (rate limiting!)
   - Critical bugs?
   - Blockers for launch?

**Short-term (Next month):**
1. What's on the roadmap for the next 4 weeks?

**Medium-term (Next quarter):**
1. What's planned for Q1 2026?

**Long-term (2026):**
1. What's the vision for end of year?

### Blockers

1. What's currently blocking progress?
   - Technical blockers?
   - Decision blockers?
   - Resource blockers?

2. For each blocker:
   - What's the impact?
   - What's the workaround?
   - What's needed to unblock?

### NPI Data Import Status

1. How many states imported?
2. Which states are complete?
3. Which states are in progress?
4. Which states are remaining?
5. What's the total provider count?
6. Any import issues or failures?

### Test Coverage

1. How many tests passing?
2. Any failing tests?
3. What's not covered by tests?

### Deployment Status

1. Is production deployed?
2. Is staging deployed?
3. What's the current version/commit?
4. Any deployment issues?

### Security Status

1. What security vulnerabilities exist?
2. What's the severity of each?
3. What's the plan to fix each?
4. Timeline for security hardening?

### Known Issues

1. What bugs are known but not yet fixed?
2. What's the priority of each?
3. Any workarounds?

### Decisions Needed

1. What decisions are blocking progress?
2. What technical decisions need to be made?
3. What product decisions need to be made?
4. What business decisions need to be made?

### Success Metrics

**Phase 1 (Proof of Concept):**
1. Target metrics:
   - Users?
   - Verifications?
   - Providers with high confidence?
2. Current vs target?

**Phase 2 (One-City Utility):**
1. Target metrics:
   - [same questions]

**Phase 3 (Regional Scale):**
1. Target metrics:
   - [same questions]

### Timeline

1. What's the target date for beta launch?
2. What's the target date for public launch?
3. What's the target date for profitability?
4. Any missed deadlines or delays?

### Risks

1. What are the top 3-5 risks to the project?
2. What's being done to mitigate each?

## Output Format

```markdown
# VerifyMyProvider Progress Status

**Last Updated:** [Date]
**Current Phase:** Phase X
**Overall Completion:** X%

---

## Current Status

**Phase Completion:**
| Component | Status | Completion |
|-----------|--------|------------|
| Infrastructure | ✅ Complete | 100% |
| Database | 🔄 In Progress | X% |
| API | [status] | X% |
| Frontend | [status] | X% |
| Security | ⚠️ Blocker | X% |

---

## Recently Completed

### Last 7 Days
- ✅ [accomplishment]
- ✅ [accomplishment]

### Last 30 Days
- ✅ [milestone]
- ✅ [milestone]

---

## Currently In Progress

- 🔄 [task] - [status]
- 🔄 [task] - [status]

---

## Next Up (Priority Order)

### Immediate (Next 1-2 weeks) - CRITICAL
1. ⚠️ **[URGENT TASK]** - [why urgent]
2. [task]

### Short-term (Next month)
- [ ] [task]
- [ ] [task]

### Medium-term (Next quarter)
- [ ] [goal]
- [ ] [goal]

---

## Blockers 🚫

| Blocker | Impact | Workaround | Unblock Plan |
|---------|--------|------------|--------------|
| [blocker] | [impact] | [workaround] | [plan] |

---

## NPI Data Import Status

**Progress:**
- ✅ States complete: [list]
- 🔄 States in progress: [list]
- ⏳ States remaining: [list]

**Statistics:**
- Total providers: [count]
- Total records: [count]
- Import time: [duration]

**Issues:**
- [any issues]

---

## Test Coverage

- **Total tests:** X passing
- **Coverage:** X%
- **Failing:** X tests
- **Not covered:** [areas]

---

## Deployment Status

- **Production:** ✅ Deployed
  - URL: [url]
  - Commit: [hash]
  - Deployed: [date]
- **Issues:** [any issues]

---

## Security Status

| Vulnerability | Severity | Status | Timeline |
|---------------|----------|--------|----------|
| [vuln] | [severity] | [status] | [eta] |

---

## Known Issues

| Issue | Priority | Workaround | ETA |
|-------|----------|------------|-----|
| [bug] | [priority] | [workaround] | [eta] |

---

## Decisions Needed

- [ ] **[DECISION]** - [context, options]
- [ ] [decision] - [context]

---

## Success Metrics

### Phase 1 (Current)
| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Users | 50 | X | [on/off track] |
| Verifications | 100 | X | [on/off track] |

### Phase 2 (Next)
[same structure]

---

## Timeline

- **Beta Launch:** [target date] - [on/off track]
- **Public Launch:** [target date]
- **Profitability:** [target date]

**Delays:**
- [any delays and reasons]

---

## Top Risks

1. **[RISK]** - [probability] [impact]
   - Mitigation: [plan]

2. [risk]
   - Mitigation: [plan]

---

## Next Session Focus

**Priority for next coding session:**
1. [task]
2. [task]

**Questions to answer:**
- [question]
- [question]
```
