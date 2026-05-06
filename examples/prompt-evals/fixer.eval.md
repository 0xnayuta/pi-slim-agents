# Fixer Agent Eval Cases

## Case: Small bug fix

Agent:
fixer

Mode:
quick

Task:
Add a null check for the `config` parameter in the `loadConfig` function in `src/config.ts:12`.

Context:
The function crashes when `config` is undefined.

Expected behavior:
- Should read the file first before editing
- Should add a simple null check
- Should NOT expand scope beyond the specific function
- Should NOT introduce new dependencies
- Should output changes made (if any)
- If in prompt-only mode: should output proposed change, not claim to have modified

Good output characteristics:
- States "Proposed change at src/config.ts:12"
- Shows the exact diff or change
- Explains why the null check is needed
- Includes a simple test case suggestion if relevant
- Limits output to the specific fix

Bad output examples / failure modes:
- Claims to have modified the file in prompt-only mode
- Rewrites the entire function instead of adding a null check
- Adds logging, error handling, or other unrelated changes
- Introduces a new library for null checking
- Outputs more than 20 lines of changes for a simple fix
- Provides a full test suite instead of a focused fix

---

## Case: Wire up a small feature

Agent:
fixer

Mode:
normal

Task:
Connect the `UserService.getProfile()` method to the `/profile` route handler in `src/routes/user.ts`.

Context:
The method exists but isn't called by the route.

Expected behavior:
- Should read both files first
- Should identify exactly where to add the call
- Should make a minimal, targeted change
- Should NOT redesign the routing structure
- Should NOT add error handling beyond what's already in the route

Good output characteristics:
- States "Adding call at src/routes/user.ts:XX"
- Shows the one-line change needed
- Points to the exact location
- Keeps the change minimal
- In prompt-only mode: describes the change, doesn't claim execution

Bad output examples / failure modes:
- Rewrites the entire route handler
- Adds new error handling, logging, and validation when the task was just to wire up a call
- Creates new files or directories
- Claims to have modified the file in prompt-only mode
- Introduces a service locator or other architectural patterns
- Outputs more than 15 lines of code for a simple wiring task

---

## Case: Add test case suggestions

Agent:
fixer

Mode:
quick

Task:
Suggest test cases for the `parseConfig` function in `src/config.ts`.

Context:
The function parses JSON config files with defaults.

Expected behavior:
- Should suggest 3-5 focused test cases
- Should describe each test case concisely (input, expected output)
- Should NOT write full test code (unless explicitly asked)
- Should focus on edge cases and boundary conditions
- Should NOT claim to have written tests

Good output characteristics:
- Lists test cases: "1) Valid config returns defaults... 2) Invalid JSON throws..."
- Keeps each test case brief (one line)
- Focuses on edge cases
- Notes what edge cases are NOT covered by existing tests
- Doesn't write actual test code (unless asked)

Bad output examples / failure modes:
- Writes full test code when user only asked for suggestions
- Suggests 50 test cases instead of focused high-value ones
- Includes tests for unrelated functionality
- Claims to have run tests when it hasn't
- Outputs more than 30 lines for test suggestions
- Adds tests for things that don't exist in the codebase

---

## Case: Fix syntax error

Agent:
fixer

Mode:
quick

Task:
Fix the TypeScript error in `src/utils.ts:45`. The error is "Argument of type 'string' is not assignable to parameter of type 'number'".

Context:
The function expects a number but is receiving a string.

Expected behavior:
- Should read the file to find the exact issue
- Should make a minimal fix (type cast or conversion)
- Should NOT add validation or error handling
- Should NOT refactor the function
- Should output the fix precisely

Good output characteristics:
- Shows the exact fix: "Changed `parse(value)` to `parseInt(value, 10)` at line 45"
- Explains why this fixes the type error
- Keeps the change minimal
- In prompt-only mode: proposes the change, doesn't claim execution

Bad output examples / failure modes:
- Adds input validation instead of fixing the type error
- Rewrites the entire function to accept both string and number
- Changes the function signature instead of the call site
- Claims to have modified the file in prompt-only mode
- Suggests disabling TypeScript strict mode
- Outputs more than 10 lines for a simple type fix