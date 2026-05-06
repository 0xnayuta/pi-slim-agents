# Designer Agent Eval Cases

## Case: Review UI control layout

Agent:
designer

Mode:
normal

Task:
Review the layout of the settings panel in our app. The panel has 12 settings organized in two columns. Users are saying it's confusing.

Context:
Settings include: username, email, password, theme, language, notifications, privacy, backup, about, help, logout, delete account.

Expected behavior:
- Should give specific grouping recommendations
- Should explain why the current grouping is confusing
- Should suggest a better organization (e.g., group by frequency of change)
- Should NOT just say "make it cleaner"
- Should provide actionable grouping suggestions

Good output characteristics:
- Groups settings logically: "Account (username, email, password), Preferences (theme, language, notifications), Privacy (privacy, backup), Info (about, help), Danger Zone (logout, delete account)"
- Explains why: "Settings that change behavior should be separate from account management"
- Gives specific layout suggestions: "2-column with 5-4-3 groupings"
- References accessibility if relevant
- Keeps analysis focused on the specific issue

Bad output examples / failure modes:
- Says "the layout needs work" without specifics
- Suggests a complete redesign instead of incremental improvements
- Lists all 12 settings individually without grouping
- Talks about color schemes when the issue is information architecture
- Ignores the user's complaint about confusion
- Suggests hiding some settings instead of improving organization

---

## Case: Review interaction flow

Agent:
designer

Mode:
quick

Task:
Review the onboarding flow for new users. Currently: sign up → email verification → profile setup → dashboard.

Context:
Users are dropping off at the profile setup step.

Expected behavior:
- Should identify why users might be dropping off
- Should suggest specific improvements to reduce friction
- Should keep suggestions actionable and scoped
- Should NOT suggest a complete redesign
- Should output no more than 200 words

Good output characteristics:
- States: "Profile setup often feels like work. Consider: 1) Make it optional with 'skip for now' 2) Reduce required fields..."
- Provides specific, actionable suggestions
- Keeps analysis brief
- Focuses on the specific pain point

Bad output examples / failure modes:
- Provides a 20-step redesign of the entire onboarding flow
- Suggests adding gamification, badges, and rewards for a simple signup
- Ignores the specific complaint and talks about general UX best practices
- Outputs more than 400 words for a quick review
- Suggests removing email verification entirely without acknowledging the security implications

---

## Case: Give visual card suggestion for README

Agent:
designer

Mode:
normal

Task:
Suggest a visual card layout for the features section of our README. We have 6 features to highlight.

Context:
The README is for an open-source CLI tool. Current layout is a bullet list.

Expected behavior:
- Should give specific layout suggestion (e.g., 2x3 grid, icons, descriptions)
- Should provide example HTML/CSS or suggest a markdown-based approach
- Should NOT design the entire README
- Should give concrete visual direction, not generic advice

Good output characteristics:
- Suggests: "2-column grid with icons. Each card: icon + title + 1-line description."
- Provides example structure (text-based, not full code)
- Mentions visual hierarchy: "Icon should be above title"
- Notes: "For markdown, consider using shields.io for status badges"
- Keeps suggestions focused and actionable

Bad output examples / failure modes:
- Designs the entire README page instead of one section
- Provides a full React component for the card layout
- Says "use a nice design" without specifics
- Includes 20 different layout options without recommendation
- Outputs more than 300 words for a section suggestion
- Doesn't provide any visual direction or example structure

---

## Case: Review responsive behavior

Agent:
designer

Mode:
quick

Task:
Review the mobile responsiveness of the navigation. The desktop nav is a horizontal menu, but on mobile it becomes a dropdown that users can't find.

Context:
Analytics show 40% of users never click the hamburger menu.

Expected behavior:
- Should identify the visibility problem
- Should suggest specific improvements to make the hamburger more noticeable
- Should provide 2-3 concrete options
- Should NOT suggest a complete nav redesign
- Should output no more than 150 words

Good output characteristics:
- States: "Hamburger icon blends into header. Options: 1) Use a more recognizable icon (three-line + outline)..."
- Provides specific, actionable options
- References mobile UX patterns
- Keeps it brief and focused

Bad output examples / failure modes:
- Suggests replacing the hamburger with a bottom tab bar
- Provides a full responsive design system instead of targeted fix
- Says "make it more visible" without suggesting how
- Ignores the analytics showing low usage
- Outputs more than 300 words for a quick review
- Proposes a complex gesture-based navigation for a simple nav