# Orchestrator Agent Eval Cases

## Case: Decide to delegate to explorer

Agent:
orchestrator

Mode:
normal

Task:
User says: "I need to find all files that use the old authentication module."

Context:
The main agent has some context but doesn't know the exact file structure.

Expected behavior:
- Should recommend delegating to explorer
- Should explain why explorer is the right choice (specific location search)
- Should provide a clear delegation task description
- Should NOT delegate when main agent can do it directly
- Should NOT delegate to oracle or other agents

Good output characteristics:
- States: "Delegate to @explorer for file location search"
- Explains: "Explorer specializes in codebase search patterns"
- Provides clear delegation task: "Find all files importing or referencing the old auth module"
- Keeps delegation focused and scoped

Bad output examples / failure modes:
- Tries to handle the search itself when it's complex
- Delegates to oracle for a simple file search
- Provides a vague delegation task that won't get useful results
- Delegates to fixer to "fix all the auth usages"
- Over-engineers a simple search task

---

## Case: Decide to delegate to oracle

Agent:
orchestrator

Mode:
deep

Task:
User says: "We're refactoring our entire data layer. Is this approach going to cause problems?"

Context:
The team is planning a major refactor that touches 20+ files across multiple services.

Expected behavior:
- Should recognize this is a strategic question requiring oracle
- Should recommend delegating to oracle with architecture review focus
- Should explain why oracle is appropriate (not fixer, not explorer)
- Should NOT try to answer architecture questions itself
- Should NOT delegate to multiple agents for a single strategic decision

Good output characteristics:
- States: "Delegate to @oracle for architecture risk assessment"
- Explains: "Oracle specializes in architectural guidance and can identify risks before the refactor begins"
- Provides context: "Share the refactoring plan and key files with oracle"
- Keeps delegation focused on the specific decision

Bad output examples / failure modes:
- Tries to answer architecture questions without specialist input
- Delegates to fixer to "implement the refactor"
- Delegates to explorer to "find all data layer files"
- Over-delegates: sends this to 5 different agents
- Provides no context with the delegation

---

## Case: Recognize simple task should not be delegated

Agent:
orchestrator

Mode:
quick

Task:
User says: "What does the package.json do?"

Context:
The main agent has full context and this is a trivial lookup.

Expected behavior:
- Should handle this directly without delegation
- Should provide a brief answer
- Should explain why delegation isn't needed (simple lookup, main agent has context)
- Should NOT delegate to librarian for every question
- Should NOT overthink a simple question

Good output characteristics:
- Handles directly: "The package.json defines your project's metadata, dependencies, and scripts"
- Brief explanation: "This is a simple documentation lookup - no specialist needed"
- Stays focused on answering the question

Bad output examples / failure modes:
- Delegates to librarian for "researching package.json documentation"
- Says "I should delegate this to a specialist" for a trivial question
- Provides a full explanation of npm package.json conventions
- Refuses to answer and says "please use /agent librarian" for a simple question

---

## Case: Delegate multiple independent tasks

Agent:
orchestrator

Mode:
normal

Task:
User says: "I need to understand this PR: it changes auth, adds a new API endpoint, and updates the UI."

Context:
The PR touches three distinct areas.

Expected behavior:
- Should identify three independent areas (auth, API, UI)
- Should recommend parallel delegation to appropriate specialists
- Should provide clear tasks for each delegation
- Should NOT try to review all three areas itself
- Should NOT delegate everything sequentially if parallel is possible

Good output characteristics:
- States: "This PR needs three specialist reviews: @oracle for auth changes, @explorer for API location, @designer for UI review"
- Explains parallel delegation where possible
- Provides clear, focused tasks for each specialist
- Notes: "Auth and API can run in parallel; designer can review UI independently"

Bad output examples / failure modes:
- Tries to review all three areas itself
- Delegates everything to oracle sequentially
- Provides vague delegation tasks: "review this PR"
- Misses one of the three areas
- Delegates the entire PR to fixer to "implement any needed changes"

---

## Case: Sequence dependent tasks

Agent:
orchestrator

Mode:
normal

Task:
User says: "We need to add feature X. It requires a new database table, a new API endpoint, and a new UI component."

Context:
The team wants to implement feature X but isn't sure where to start.

Expected behavior:
- Should recognize dependencies: database → API → UI
- Should recommend sequential delegation with clear dependencies
- Should explain the order: "First explore existing patterns, then oracle reviews design, then fixer implements"
- Should NOT recommend parallel execution of dependent tasks
- Should NOT try to plan the entire feature itself

Good output characteristics:
- States: "This requires sequential work due to dependencies"
- Provides order: "1) @explorer to find existing patterns... 2) @oracle to review design... 3) @fixer to implement"
- Explains why sequence matters
- Keeps plan focused on the main agent's role

Bad output examples / failure modes:
- Tries to plan the entire implementation itself
- Recommends all three delegations happen simultaneously
- Delegates everything to fixer immediately without understanding the scope
- Creates a detailed implementation plan instead of routing to specialists
- Skips the exploration step and asks oracle to design from scratch