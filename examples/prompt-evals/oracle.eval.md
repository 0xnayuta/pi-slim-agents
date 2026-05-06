# Oracle Agent Eval Cases

## Case: Review over-engineering

Agent:
oracle

Mode:
deep

Task:
Review this design and determine if it's over-engineered. The design introduces an abstract factory pattern with dependency injection for a simple CRUD API.

Context:
A junior developer proposed this architecture for a basic REST API with 4 endpoints.

Expected behavior:
- Should give a clear verdict (yes/no/partial)
- Should explain why in concrete terms
- Should suggest a simpler alternative if applicable
- Should acknowledge when complexity might be justified
- Should NOT rewrite the code
- Should NOT output more than 300 words

Good output characteristics:
- States the problem: "The factory pattern adds complexity without clear benefit for 4 endpoints"
- Suggests concrete alternative: "A simple module with direct instantiation is sufficient"
- Acknowledges when YAGNI applies
- Keeps analysis focused and concise
- Avoids academic architecture discussion

Bad output examples / failure modes:
- Provides a 10-point comparison of design patterns
- Suggests replacing one complex pattern with another equally complex pattern
- Says "it depends" without giving a recommendation
- Outputs more than 500 words for a simple question
- Suggests adding more abstraction layers "for future flexibility"
- Discusses microservices when the question was about a single service

---

## Case: Analyze complex bug root cause

Agent:
oracle

Mode:
normal

Task:
Analyze this intermittent bug: "Sometimes the user session expires immediately after login, but only in production."

Context:
The app works fine in development. The bug happens randomly, about 30% of the time.

Expected behavior:
- Should provide a hypothesis with supporting evidence
- Should list 3-5 most likely causes ranked by probability
- Should suggest specific investigation steps
- Should NOT claim to have found the root cause without evidence
- Should acknowledge when more info is needed

Good output characteristics:
- Ranks hypotheses: "Most likely: 1) Clock skew between servers 2) Race condition in session store..."
- Points to specific files or patterns to investigate
- Provides concrete debug steps (e.g., "Check if session.createdAt and request timestamp differ by >5 minutes")
- Acknowledges this is a hypothesis, not a confirmed fix

Bad output examples / failure modes:
- Claims the root cause is "session management" without specifying
- Provides a full debugging guide instead of focused analysis
- Ignores the "30% of the time" clue
- Suggests restarting services without explaining why
- Outputs more than 400 words for initial analysis
- Immediately proposes a complex solution (e.g., "You need to redesign the auth system")

---

## Case: Review diff for risk

Agent:
oracle

Mode:
normal

Task:
Review this diff for risks before merging. The diff adds a new field to the user model and updates three related endpoints.

Context:
This is a user-facing change in a production API. The team wants to know if this is safe to merge.

Expected behavior:
- Should identify specific risks (breaking changes, migration needs, etc.)
- Should assess risk level (high/medium/low)
- Should provide 2-3 actionable recommendations
- Should NOT rewrite the diff
- Should NOT output more than 250 words

Good output characteristics:
- States risk clearly: "This is a breaking change for existing API consumers"
- Provides specific recommendation: "Add the new field as optional, then deprecate the old field"
- Lists what to check before merging
- Keeps analysis focused on pre-merge concerns

Bad output examples / failure modes:
- Provides a full code review when user asked for risk assessment
- Suggests rewriting the entire API
- Ignores backward compatibility concerns
- Outputs more than 400 words
- Starts with "Overall, this looks good" without specific feedback
- Lists 15 things to check, most of which are unrelated to the diff

---

## Case: Quick design decision

Agent:
oracle

Mode:
quick

Task:
Should we use a singleton or dependency injection for our service class? This is a CLI tool, not a web server.

Context:
The service is used in one main.ts file, but team members have different opinions.

Expected behavior:
- Should give a direct recommendation
- Should explain the reasoning in 2-3 sentences
- Should NOT provide a full architectural analysis
- Should NOT output more than 100 words

Good output characteristics:
- States: "For a CLI tool with single entry point, direct instantiation is simpler and more readable"
- Brief explanation: "DI adds complexity without benefit when there's only one consumer"
- Direct and concise

Bad output examples / failure modes:
- Provides a 5-point comparison table
- Discusses testability extensively when the use case is simple
- Says "it depends" without giving a recommendation
- Outputs more than 200 words for a quick question
- Brings up design patterns irrelevant to CLI tools