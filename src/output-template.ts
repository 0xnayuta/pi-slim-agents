/**
 * Output template for structured agent delegation responses.
 *
 * When enabled (default), agents are instructed to format their output
 * using XML-like tags for structured, parseable results.
 *
 * These tags are output conventions, NOT strict parsers.
 * They help the main agent (and users) quickly locate key information.
 */

// ─── Template Builder ───────────────────────────────────────────────

/**
 * Build the expected output section for a delegation prompt.
 *
 * Returns an empty string when outputTemplate is disabled.
 */
export function buildExpectedOutputSection(
  agentName: string,
  readonly: boolean,
  outputTemplate: boolean | undefined,
): string {
  if (outputTemplate === false) {
    // Fallback to original simple output
    return readonly
      ? 'Search, analyze, and report clearly. Do not modify files.'
      : 'Complete the task and report concise, actionable results.';
  }

  // Default: output template enabled
  return getAgentOutputTemplate(agentName, readonly);
}

// ─── Per-Agent Templates ────────────────────────────────────────────

function getAgentOutputTemplate(agentName: string, readonly: boolean): string {
  switch (agentName) {
    case 'explorer':
      return explorerTemplate();
    case 'librarian':
      return librarianTemplate();
    case 'oracle':
      return oracleTemplate();
    case 'fixer':
      return fixerTemplate(readonly);
    case 'designer':
      return designerTemplate();
    case 'orchestrator':
      return orchestratorTemplate();
    default:
      return defaultTemplate(readonly);
  }
}

function explorerTemplate(): string {
  return [
    'Format your response using these sections:',
    '',
    '<summary>',
    'One-line answer to the question',
    '</summary>',
    '',
    '<findings>',
    '- What was found',
    '</findings>',
    '',
    '<evidence>',
    '- path:line — relevant snippet or description',
    '</evidence>',
    '',
    'Focus on precise file paths and line numbers. Be exhaustive but concise.',
  ].join('\n');
}

function librarianTemplate(): string {
  return [
    'Format your response using these sections:',
    '',
    '<summary>',
    'One-line answer or recommendation',
    '</summary>',
    '',
    '<findings>',
    '- Key findings from documentation or research',
    '</findings>',
    '',
    '<evidence>',
    '- Source references (URLs, file paths, doc quotes)',
    '</evidence>',
    '',
    '<risks>',
    '- Caveats, version-specific behavior, documentation gaps',
    '</risks>',
    '',
    'Cite sources. Flag uncertainty. Do NOT modify files.',
  ].join('\n');
}

function oracleTemplate(): string {
  return [
    'Format your response using these sections:',
    '',
    '<summary>',
    'One-line conclusion or recommendation',
    '</summary>',
    '',
    '<findings>',
    '- Key observations from analysis',
    '</findings>',
    '',
    '<evidence>',
    '- File paths, line numbers, or code references',
    '</evidence>',
    '',
    '<risks>',
    '- Risks, tradeoffs, and uncertainties',
    '</risks>',
    '',
    '<next_actions>',
    '- Recommended next steps',
    '</next_actions>',
    '',
    'Emphasize tradeoffs and risks. Be direct. Prefer simplicity.',
  ].join('\n');
}

function fixerTemplate(readonly: boolean): string {
  const sections = [
    'Format your response using these sections:',
    '',
    '<summary>',
    'Brief summary of what was implemented or analyzed',
    '</summary>',
    '',
    '<changes>',
    '- file.ts: description of change',
    '</changes>',
    '',
    '<evidence>',
    '- File paths, line numbers, test results',
    '</evidence>',
    '',
    '<risks>',
    '- Potential issues or incomplete coverage',
    '</risks>',
    '',
    '<next_actions>',
    '- Verification steps or remaining work',
    '</next_actions>',
  ];

  if (readonly) {
    sections.push(
      '',
      'READ-ONLY mode: Do NOT modify files. Only analyze and report.',
    );
  } else {
    sections.push(
      '',
      'IMPORTANT: If you do not have real tool access, do NOT claim to have modified files.',
      'Report what changes should be made instead.',
    );
  }

  return sections.join('\n');
}

function designerTemplate(): string {
  return [
    'Format your response using these sections:',
    '',
    '<summary>',
    'One-line assessment of the design/UX',
    '</summary>',
    '',
    '<findings>',
    '- UX observations, visual issues, interaction patterns',
    '</findings>',
    '',
    '<evidence>',
    '- File paths, CSS classes, component references',
    '</evidence>',
    '',
    '<risks>',
    '- Accessibility, responsiveness, visual consistency concerns',
    '</risks>',
    '',
    '<next_actions>',
    '- Design improvements or implementation guidance',
    '</next_actions>',
    '',
    'Focus on what users see and feel. Be specific about visual and interaction details.',
  ].join('\n');
}

function orchestratorTemplate(): string {
  return [
    'Format your response using these sections:',
    '',
    '<summary>',
    'High-level plan or routing decision',
    '</summary>',
    '',
    '<findings>',
    '- Task decomposition and agent assignments',
    '</findings>',
    '',
    '<next_actions>',
    '- Steps to execute, in order',
    '</next_actions>',
    '',
    'Be clear about which agent handles what. Keep the plan simple.',
  ].join('\n');
}

function defaultTemplate(readonly: boolean): string {
  return [
    'Format your response using these sections:',
    '',
    '<summary>',
    'One-line conclusion',
    '</summary>',
    '',
    '<findings>',
    '- Key findings',
    '</findings>',
    '',
    '<evidence>',
    '- File paths, line numbers, configuration items, documentation references',
    '</evidence>',
    '',
    '<risks>',
    '- Risks or uncertainties',
    '</risks>',
    '',
    '<next_actions>',
    '- Suggested next steps',
    '</next_actions>',
    readonly
      ? '\nREAD-ONLY: Do not modify files. Analyze and report only.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
