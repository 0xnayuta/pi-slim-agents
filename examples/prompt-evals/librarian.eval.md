# Librarian Agent Eval Cases

## Case: Find official documentation for a library

Agent:
librarian

Mode:
quick

Task:
Find the official documentation for the `zod` library, specifically for schema validation with custom error messages.

Context:
User wants to validate user input with custom error messages but is unsure of the correct API.

Expected behavior:
- Should cite official zod docs (not community tutorials)
- Should provide the specific API pattern for custom errors
- Should include a brief code example from docs
- Should NOT fabricate documentation or APIs
- Should acknowledge version if relevant

Good output characteristics:
- Links to official zod documentation
- Shows `z.string()` with `.refine()` or `.superRefine()` syntax
- Notes if the API changed between versions
- Direct, concise answer

Bad output examples / failure modes:
- Invents an API that doesn't exist (e.g., "use `z.validate()`")
- Cites a Stack Overflow answer as if it were official docs
- Provides a full tutorial when user only needed a quick reference
- Doesn't distinguish between v2 and v3 zod APIs
- Includes unrelated validation libraries

---

## Case: Distinguish official patterns from community patterns

Agent:
librarian

Mode:
normal

Task:
Find the recommended way to handle async operations with React Query, specifically for dependent queries.

Context:
User has two queries where the second depends on data from the first.

Expected behavior:
- Should distinguish between official React Query patterns and community solutions
- Should recommend the official `enabled` option approach
- Should acknowledge alternative community patterns (e.g., custom hooks)
- Should cite source (official docs vs. blog post)
- Should NOT claim community solutions are "official"

Good output characteristics:
- Clearly labels sources (e.g., "Official docs say...", "A common community pattern is...")
- Shows the `enabled` option pattern with code example
- Mentions potential pitfalls with alternative approaches
- Keeps answer focused on the specific use case

Bad output examples / failure modes:
- Presents a third-party blog solution as the official approach
- Doesn't mention the `enabled` option
- Provides a full React Query tutorial instead of targeted answer
- Fabricates an API that doesn't exist in React Query
- Includes code for multiple different state management libraries

---

## Case: Handle insufficient information

Agent:
librarian

Mode:
deep

Task:
Find the best practices for handling database migrations in a Node.js project with PostgreSQL.

Context:
User is starting a new project and wants to establish good practices early.

Expected behavior:
- Should acknowledge that "best practices" depend on project specifics
- Should ask clarifying questions or state assumptions
- Should provide general guidance with caveats
- Should NOT claim there is one definitive answer
- Should cite sources for each recommendation

Good output characteristics:
- States assumptions (e.g., "Assuming you're using a migration tool like...")
- Provides 2-3 recommended approaches with trade-offs
- Cites sources for each approach
- Ends with "Based on your specific requirements, consider X"
- Acknowledges uncertainty where evidence is thin

Bad output examples / failure modes:
- Claims "the best way is X" without caveats
- Doesn't acknowledge different project scales (solo vs. team)
- Fabricates specific library names or APIs
- Provides a full tutorial on database basics
- Ignores the fact that "best practices" vary by context

---

## Case: Find API reference for specific version

Agent:
librarian

Mode:
normal

Task:
Find the Express.js 4.x API documentation for `app.use()` specifically for mounting middleware at a specific path.

Context:
User is migrating from Express 3 and needs to understand the correct pattern for mounted middleware.

Expected behavior:
- Should specify it's for Express 4.x (not 5.x which has different behavior)
- Should show the `app.use('/path', middleware)` pattern
- Should include a code example from official docs
- Should note any breaking changes from Express 3
- Should NOT provide Express 5.x syntax if user specified 4.x

Good output characteristics:
- States "Express 4.x docs show..."
- Includes the mount path pattern with code
- Notes the difference from Express 3 if relevant
- Points to official docs URL
- Brief and targeted

Bad output examples / failure modes:
- Shows Express 5.x syntax when user asked for 4.x
- Doesn't mention version differences
- Provides a full Express tutorial instead of targeted answer
- Fabricates an API that doesn't exist
- Lists every `app.use` variant without focusing on the path mounting use case