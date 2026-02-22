export interface SlashCommand {
  name: string;
  description: string;
  /** Whether it takes additional text after the command name. */
  takesArgument: boolean;
  /** Placeholder for the argument input. */
  argumentPlaceholder?: string;
}

export const AI_COMMANDS: SlashCommand[] = [
  {
    name: 'summarize',
    description: 'Summarize the recent conversation',
    takesArgument: false,
  },
  {
    name: 'catch-up',
    description: 'Catch up on messages since you were last here',
    takesArgument: false,
  },
  {
    name: 'draft',
    description: 'Draft a message with AI assistance',
    takesArgument: true,
    argumentPlaceholder: 'What should the message say?',
  },
];

/** Find matching commands for a partial input. */
export function matchCommands(input: string): SlashCommand[] {
  const lower = input.toLowerCase().replace(/^\//, '');
  if (!lower) return AI_COMMANDS;
  return AI_COMMANDS.filter((cmd) => cmd.name.startsWith(lower));
}
