export interface ClaudeLogEntry {
  type: string;
  timestamp: string;
  message?: {
    // Content can be:
    // - string: direct user text message
    // - array with type='text': user text in array format
    // - array with type='tool_result': system tool result response
    // - array with type='tool_use': assistant tool invocation
    content: string | Array<{
      type: string;
      name?: string;
      input?: any;
      text?: string;
      tool_use_id?: string;  // For tool_result entries
    }>;
  };
  tool?: string;
  parameters?: any;
  result?: any;
  error?: any;
}

export interface SessionMetadata {
  sessionId: string;
  sessionFile: string;
  timestamp: string;
  mtime: number;  // File modification time (used to determine latest session)
  userMessage: string;
  fileCount: number;
  isLatest: boolean;
}

export interface FileChange {
  id: string;
  timestamp: string;
  type: 'create' | 'edit' | 'delete' | 'write';
  filePath: string;
  oldContent?: string;
  newContent?: string;
  changes?: Array<{
    oldString: string;
    newString: string;
    replaceAll?: boolean;
  }>;
  sessionId?: string;
  sessionFile?: string;
  isLatestSession?: boolean;
  userMessage?: string;
}

export interface ParsedChange {
  id: string;
  timestamp: string;
  type: 'create' | 'edit' | 'delete' | 'write';
  filePath: string;
  diff?: string;
  oldContent?: string;
  newContent?: string;
  oldString?: string;  // For edit changes
  newString?: string;  // For edit changes
  canRevert: boolean;
  sessionId?: string;
  sessionFile?: string;
  isLatestSession?: boolean;
  userMessage?: string;
  turnId?: string;  // Which conversation turn this change belongs to
}

// Conversation turn: a user message and the AI's response with file changes
export interface ConversationTurn {
  id: string;
  timestamp: string;
  userMessage: string;
  userMessageFull?: string;  // Full user message (not truncated)
  assistantMessage?: string;  // Consolidated AI text response
  fileChanges: FileChange[];
  parsedChanges?: ParsedChange[];  // Processed changes with diffs
  isLatestSession: boolean;
}

// Session with conversation turns
export interface SessionWithTurns {
  sessionId: string;
  sessionFile: string;
  timestamp: string;
  mtime: number;
  isLatest: boolean;
  turns: ConversationTurn[];
}