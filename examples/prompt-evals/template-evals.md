# Template Eval Cases

This file covers eval cases for all built-in agent templates.

## security-reviewer

### Case: Review input validation

Agent:
security-reviewer

Mode:
normal

Task:
Review the user registration endpoint for input validation vulnerabilities.

Context:
The endpoint accepts username, email, and password.

Expected behavior:
- Should identify injection risks in input fields
- Should check for proper sanitization
- Should NOT run automated scanners
- Should prioritize high-severity issues

**Good fit for**:
- Input validation review
- Auth flow security
- Dependency vulnerability checks
- Permission boundary review

**Not good fit for**:
- Writing secure code (use fixer for implementation)
- Full architecture review (use oracle)
- Performance optimization
- UI/UX security issues

**Expected output**:
```
<summary>
One-sentence risk assessment
</summary>
<risks>
- [high] SQL injection in username field - src/auth.ts:42
</risks>
<recommendations>
- Use parameterized queries for username validation
</recommendations>
```

**Common failure modes**:
- Suggests adding a WAF instead of fixing code
- Focuses on low-severity issues while missing critical ones
- Runs automated tools without being asked

---

## test-writer

### Case: Generate test plan for a function

Agent:
test-writer

Mode:
normal

Task:
Create a test plan for the `calculateDiscount(price, couponCode)` function.

Context:
The function applies a discount based on a coupon code. Coupon codes can be invalid, expired, or already used.

Expected behavior:
- Should identify edge cases (null coupon, expired, already used)
- Should suggest test case names and inputs
- Should NOT write full test code unless asked
- Should focus on high-value test cases

**Good fit for**:
- Test case planning
- Coverage gap analysis
- Test structure suggestions
- Integration test planning

**Not good fit for**:
- Writing production code (use fixer)
- Architecture review (use oracle)
- Security testing (use security-reviewer)
- Exploratory testing in the codebase

**Expected output**:
```
<summary>
4 key test cases for calculateDiscount
</summary>
<test_cases>
1. valid_coupon — price: 100, coupon: SAVE10, expected: 90
2. expired_coupon — price: 100, coupon: EXPIRED, expected: 100 (no discount)
</test_cases>
<coverage_gaps>
- No tests for concurrent coupon usage
</coverage_gaps>
```

**Common failure modes**:
- Writes full test code when only a plan was requested
- Suggests 50+ test cases instead of focused high-value ones
- Includes tests for unrelated functions

---

## doc-generator

### Case: Generate README section

Agent:
doc-generator

Mode:
normal

Task:
Write a "Getting Started" section for a new CLI tool. The tool is called `pix` and it manages pi extensions.

Context:
The tool has three main commands: `pix install`, `pix list`, `pix remove`.

Expected behavior:
- Should follow project documentation style
- Should include code examples
- Should be concise
- Should NOT modify existing files without authorization

**Good fit for**:
- README generation
- API documentation
- Changelog entries
- Usage guide updates

**Not good fit for**:
- Writing code comments (use fixer)
- Architecture documentation (use oracle)
- Translating existing docs
- Legal/compliance docs

**Expected output**:
```
<summary>
Getting Started section for pix CLI
</summary>
<content>
## Getting Started

Install an extension:
$ pix install my-extension

List installed:
$ pix list

Remove:
$ pix remove my-extension
</content>
```

**Common failure modes**:
- Writes a full README when only a section was needed
- Uses placeholder text like "[your extension name]"
- Copies documentation style from an unrelated project

---

## refactor-planner

### Case: Plan extraction of utility functions

Agent:
refactor-planner

Mode:
normal

Task:
Plan the extraction of duplicated date formatting code from multiple files into a shared utility.

Context:
Date formatting is duplicated in: `src/a.ts`, `src/b.ts`, `src/c.ts`. The code uses `new Date().toISOString()` in 12 places.

Expected behavior:
- Should identify the duplication pattern
- Should propose a step-by-step extraction plan
- Should note test requirements
- Should NOT actually perform the refactoring

**Good fit for**:
- Code cleanup planning
- Migration planning
- Dependency upgrade sequencing
- Large-scale refactoring

**Not good fit for**:
- Actually writing code (use fixer)
- Quick fixes
- Performance optimization planning
- Architecture decisions

**Expected output**:
```
<current_state>
Date formatting duplicated in 12 places across 3 files
</current_state>
<target_state>
src/utils/date.ts with typed date helpers
</target_state>
<steps>
1. Create src/utils/date.ts — add tests first
2. Update src/a.ts — replace 4 occurrences
3. Update src/b.ts — replace 5 occurrences
4. Update src/c.ts — replace 3 occurrences
</steps>
<risks>
- Ensure tests pass after each file update
- Some callers may rely on specific date format string
</risks>
```

**Common failure modes**:
- Proposes a complete refactoring architecture instead of incremental steps
- Skips the "tests first" recommendation
- Suggests renaming all files instead of just extracting utilities

---

## bug-triager

### Case: Triage a production error

Agent:
bug-triager

Mode:
quick

Task:
Triage this error: "TypeError: Cannot read property 'name' of undefined at processUser (/app/server.js:142)"

Context:
This error happens during user login, only for users who signed up before January 2024.

Expected behavior:
- Should narrow down likely causes
- Should provide investigation order
- Should reference specific areas to check
- Should acknowledge when symptom could have multiple causes

**Good fit for**:
- Initial bug investigation
- Narrowing down root causes
- Prioritizing debugging steps
- Identifying whether issue is code, config, or data

**Not good fit for**:
- Actually fixing the bug (use fixer)
- Deep code review (use oracle)
- Performance investigation
- Security vulnerability assessment

**Expected output**:
```
<symptom>
TypeError in processUser during login — affects pre-Jan 2024 users
</symptom>
<likely_causes>
1. [high] Missing 'name' field in legacy user data — probability: high
   - Evidence: Only affects old users, likely schema migration gap
   - Where to look: Database migration scripts, src/server.js:142
2. [medium] Race condition during user data loading — probability: low
   - Evidence: New users unaffected
   - Where to look: Async handling in processUser
</likely_causes>
<investigation_order>
1. Check user table schema — does 'name' allow NULL for old records?
2. Check if any migration script failed for pre-Jan 2024 users
3. Examine processUser to see how 'name' is accessed (line 142)
</investigation_order>
```

**Common failure modes**:
- Immediately claims the root cause without evidence
- Provides a debugging tutorial instead of focused triage
- Ignores the specific clue about pre-Jan 2024 users

---

## release-checker

### Case: Pre-release verification

Agent:
release-checker

Mode:
quick

Task:
Check if we're ready for version 1.2.0 release. Current version in package.json is 1.1.0.

Context:
This is a minor release with new features but no breaking changes.

Expected behavior:
- Should check version consistency
- Should verify changelog has 1.2.0 entry
- Should list what passes and what fails
- Should NOT run CI/CD pipelines

**Good fit for**:
- Pre-release checklist
- Version bump verification
- CHANGELOG review
- Dry-run validation

**Not good fit for**:
- Actually creating releases (use manual process)
- Running tests (use fixer or manual)
- Pushing tags
- Writing changelogs (use doc-generator)

**Expected output**:
```
<release_summary>
Version: 1.2.0 | Type: minor
</release_summary>
<checklist>
- [x] Version bump in package.json
- [ ] CHANGELOG entry missing for 1.2.0
- [x] README version references updated
- [x] Tests pass locally
- [ ] Build/dry-run not verified
- [x] No uncommitted release-critical changes
</checklist>
<issues>
- [ ] CHANGELOG missing — add entry before release
- [ ] Build not verified — run `pnpm pack --dry-run`
</issues>
```

**Common failure modes**:
- Runs CI/CD pipelines instead of listing what to check
- Provides a generic checklist that doesn't match the actual project
- Marks everything as pass without checking

---

## cpp-reviewer

### Case: Review memory safety in function

Agent:
cpp-reviewer

Mode:
normal

Task:
Review this C++ function for memory safety issues:

```cpp
char* processData(const char* input) {
    char* buffer = new char[256];
    strcpy(buffer, input);
    return buffer;
}
```

Context:
This function is called from multiple places in the codebase.

Expected behavior:
- Should identify memory leak (caller must delete buffer)
- Should identify buffer overflow risk (no length check)
- Should provide specific fixes
- Should reference clangd diagnostics if available

**Good fit for**:
- Memory safety review
- CMake configuration review
- C++ specific patterns
- clangd integration

**Not good fit for**:
- Writing C++ code (use fixer with cpp context)
- General code review (use oracle)
- Python/JS/other language review
- Build system design

**Expected output**:
```
<summary>
Memory safety issues found — caller responsibility creates risk
</summary>
<issues>
- [high] src/processor.cpp:12 — Buffer overflow: no length check before strcpy
  Fix: Use strncpy or std::string
- [medium] src/processor.cpp:11 — Memory leak: caller must delete[] returned buffer
  Fix: Return std::string instead of raw pointer
</issues>
<cmake_notes>
- No issues with current CMake configuration
</cmake_notes>
```

**Common failure modes**:
- Suggests using smart pointers for simple cases
- Misses the buffer overflow risk
- Provides a full code rewrite instead of targeted fixes
- Ignores clangd diagnostics when available