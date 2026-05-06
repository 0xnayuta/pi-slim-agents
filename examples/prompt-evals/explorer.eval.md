# Explorer Agent Eval Cases

## Case: Find specific feature implementation

Agent:
explorer

Mode:
quick

Task:
Find where the playback speed feature is implemented in this codebase.

Context:
User wants to know the exact file and line where playback speed is handled.

Expected behavior:
- Should return specific file paths with line numbers
- Should include brief descriptions of what's at each location
- Should NOT make architecture judgments
- Should NOT suggest changes or modifications
- Should NOT output more than 10 results

Good output characteristics:
- Returns `path:line` format (e.g., `src/player.ts:42`)
- Includes snippet or description showing context
- Answers directly without preamble
- Limits results to relevant matches

Bad output examples / failure modes:
- Returns "Found playback speed in the audio module" without file paths
- Suggests architectural changes or refactoring
- Returns 50+ files without filtering
- Claims to have fixed or modified code
- Starts with "Based on my analysis..." before answering
- Guesses paths when grep returns no results

---

## Case: Find configuration entry point

Agent:
explorer

Mode:
normal

Task:
Find the main configuration entry point for this project (package.json, config files, or main module).

Context:
User needs to understand project initialization.

Expected behavior:
- Should find primary config files
- Should show file contents or key sections
- Should distinguish between dev/prod configs if present
- Should NOT list every JSON file in the project
- Should prioritize by importance (order: 1-5)

Good output characteristics:
- Returns top 3-5 most relevant config files
- Shows key config sections (not full files)
- Uses `path:line` for specific sections
- Brief explanation of what each config does

Bad output examples / failure modes:
- Lists all JSON files in project
- Dumps entire config files without highlighting key sections
- Misses the main entry point
- Provides unrelated configuration examples
- Includes generated/config artifacts not relevant to initialization

---

## Case: Locate code when scope is unclear

Agent:
explorer

Mode:
deep

Task:
Find code related to user authentication, including login, session management, and token handling.

Context:
User suspects there's a security issue but is not sure where to look.

Expected behavior:
- Should return search plan first (what patterns will be searched)
- Should show candidate paths ranked by relevance
- Should indicate confidence level for each match
- Should NOT immediately claim to have found the issue
- Should provide next steps for investigation

Good output characteristics:
- Begins with a brief search plan
- Returns `path:line` for each match
- Groups results by component type (auth, session, token)
- Includes a brief note on confidence
- Suggests which files to examine first

Bad output examples / failure modes:
- Returns one massive grep output without organization
- Claims to have found a security vulnerability without evidence
- Includes files unrelated to authentication
- Skips important areas (e.g., token storage)
- Provides a summary conclusion when user just asked for locations
- Outputs more than 30 results without prioritization

---

## Case: Find specific API endpoint

Agent:
explorer

Mode:
quick

Task:
Find where the `/api/users` endpoint is defined or handled.

Context:
Need to add a new field to the user response.

Expected behavior:
- Should return file path with line number
- Should include HTTP method (GET, POST, etc.)
- Should show relevant route definition or handler
- Should NOT modify or suggest modifications
- Should NOT output more than 5 results

Good output characteristics:
- Returns exact route definition location
- Shows the handler function name
- Brief context about what the endpoint does
- Direct answer without fluff

Bad output examples / failure modes:
- Returns "The users endpoint is in the API module" without specifics
- Lists all API-related files
- Suggests changes to the endpoint
- Includes unrelated user-related files (e.g., user fixtures, test files first)
- Outputs more than 10 results