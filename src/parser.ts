import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ClaudeLogEntry, FileChange, SessionMetadata, ConversationTurn, SessionWithTurns } from './types.js';

export class ClaudeLogParser {
  private logDir: string;
  private currentProjectPath: string;
  private projectLogDir: string;

  constructor() {
    // Claude logs are stored in ~/.claude/projects/
    this.logDir = path.join(os.homedir(), '.claude', 'projects');
    this.currentProjectPath = this.getCurrentProjectPath();
    this.projectLogDir = path.join(this.logDir, this.currentProjectPath);
  }

  private getCurrentProjectPath(): string {
    // Get current working directory and convert to project dir format
    const cwd = process.cwd();
    // Claude stores project paths with hyphens instead of special characters
    // Characters replaced: / \ : _
    // On Windows: C:\Users\Foo_Bar -> C--Users-Foo-Bar
    // On Unix: /Users/foo_bar -> -Users-foo-bar
    return cwd.replace(/[\/\\:_]/g, '-');
  }

  async getLatestLogFile(): Promise<string | null> {
    try {
      const projectDirs = await fs.promises.readdir(this.logDir);
      let allFiles: Array<{file: string, mtime: Date}> = [];
      
      // Filter to only the current project directory
      const matchingDirs = projectDirs.filter(dir => dir === this.currentProjectPath);
      
      if (matchingDirs.length === 0) {
        console.log(`No log directory found for current project path: ${this.currentProjectPath}`);
        return null;
      }
      
      // Search through matching project directories
      for (const projectDir of matchingDirs) {
        const projectPath = path.join(this.logDir, projectDir);
        try {
          const stat = await fs.promises.stat(projectPath);
          if (stat.isDirectory()) {
            const files = await fs.promises.readdir(projectPath);
            const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
            
            for (const file of jsonlFiles) {
              const filePath = path.join(projectPath, file);
              const fileStat = await fs.promises.stat(filePath);
              allFiles.push({
                file: filePath,
                mtime: fileStat.mtime
              });
            }
          }
        } catch (error) {
          // Skip directories we can't read
          continue;
        }
      }
      
      if (allFiles.length === 0) {
        return null;
      }

      // Sort by modification time to get the latest
      allFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      return allFiles[0].file;
    } catch (error) {
      console.error('Error reading log directory:', error);
      return null;
    }
  }

  async parseLogFile(filePath: string): Promise<FileChange[]> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    const changes: FileChange[] = [];

    for (const line of lines) {
      try {
        const entry: ClaudeLogEntry = JSON.parse(line);
        
        // Check if this is an assistant message with tool_use content
        if (entry.type === 'assistant' && entry.message?.content) {
          const change = this.extractFileChange(entry);
          if (change) {
            changes.push(change);
          }
        }
      } catch (error) {
        // Skip malformed lines
      }
    }

    return changes;
  }

  private extractFileChange(entry: ClaudeLogEntry): FileChange | null {
    const { timestamp } = entry;

    // Look for tool_use in message content (only in array format)
    if (entry.message?.content && Array.isArray(entry.message.content)) {
      for (const content of entry.message.content) {
        if (content.type === 'tool_use') {
          const toolName = content.name;
          const input = content.input;

          switch (toolName) {
            case 'Write':
              return {
                id: `${timestamp}-write`,
                timestamp,
                type: 'write',
                filePath: input?.file_path,
                newContent: input?.content
              };

            case 'Edit':
              return {
                id: `${timestamp}-edit`,
                timestamp,
                type: 'edit',
                filePath: input?.file_path,
                changes: [{
                  oldString: input?.old_string,
                  newString: input?.new_string,
                  replaceAll: input?.replace_all
                }]
              };

            case 'MultiEdit':
              return {
                id: `${timestamp}-multiedit`,
                timestamp,
                type: 'edit',
                filePath: input?.file_path,
                changes: input?.edits
              };

            default:
              continue;
          }
        }
      }
    }

    return null;
  }

  async getFileChanges(logFile?: string): Promise<FileChange[]> {
    const file = logFile || await this.getLatestLogFile();
    if (!file) {
      throw new Error('No Claude log files found');
    }

    return this.parseLogFile(file);
  }

  async getAllSessionMetadata(): Promise<SessionMetadata[]> {
    try {
      // Check if project directory exists
      const stat = await fs.promises.stat(this.projectLogDir);
      if (!stat.isDirectory()) {
        return [];
      }

      const files = await fs.promises.readdir(this.projectLogDir);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

      if (jsonlFiles.length === 0) {
        return [];
      }

      const sessions: SessionMetadata[] = [];

      // Get metadata for each session
      for (const file of jsonlFiles) {
        const filePath = path.join(this.projectLogDir, file);
        const metadata = await this.extractSessionMetadata(filePath);
        if (metadata) {
          sessions.push(metadata);
        }
      }

      // Sort by file modification time (newest first)
      // This ensures that sessions you return to and continue working on are marked as latest
      sessions.sort((a, b) => b.mtime - a.mtime);

      // Mark the latest session (the one most recently modified)
      if (sessions.length > 0) {
        sessions[0].isLatest = true;
      }

      return sessions;
    } catch (error) {
      console.error('Error reading session metadata:', error);
      return [];
    }
  }

  private async extractSessionMetadata(filePath: string): Promise<SessionMetadata | null> {
    try {
      // Get file stats for mtime (critical for determining latest session)
      const fileStat = await fs.promises.stat(filePath);

      const content = await fs.promises.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      if (lines.length === 0) {
        return null;
      }

      // Extract session ID from filename (e.g., "abc-def-ghi.jsonl" -> "abc-def-ghi")
      const filename = path.basename(filePath);
      const sessionId = filename.replace('.jsonl', '');

      // Find first user message and timestamp
      let firstUserMessage = 'No message';
      let timestamp = '';
      let fileCount = 0;

      for (const line of lines) {
        try {
          const entry: ClaudeLogEntry = JSON.parse(line);

          // Get first user message
          if (!timestamp && entry.timestamp) {
            timestamp = entry.timestamp;
          }

          // Fixed: Check if still equal to 'No message' instead of !firstUserMessage
          if (entry.type === 'user' && firstUserMessage === 'No message' && entry.message?.content) {
            // Handle both string and array formats for message.content
            if (typeof entry.message.content === 'string') {
              // Direct string format: {"message":{"content":"user question..."}}
              firstUserMessage = entry.message.content.substring(0, 100);
            } else if (Array.isArray(entry.message.content)) {
              // Array format: {"message":{"content":[{"type":"text","text":"..."}]}}
              for (const content of entry.message.content) {
                if (content.type === 'text' && content.text) {
                  firstUserMessage = content.text.substring(0, 100);
                  break;
                }
              }
            }
          }

          // Count file changes (only in array format content)
          if (entry.type === 'assistant' && entry.message?.content && Array.isArray(entry.message.content)) {
            for (const content of entry.message.content) {
              if (content.type === 'tool_use' &&
                  (content.name === 'Write' || content.name === 'Edit' || content.name === 'MultiEdit')) {
                fileCount++;
              }
            }
          }
        } catch (e) {
          continue;
        }
      }

      return {
        sessionId,
        sessionFile: filePath,
        timestamp: timestamp || new Date().toISOString(),
        mtime: fileStat.mtime.getTime(),  // Use file modification time
        userMessage: firstUserMessage,
        fileCount,
        isLatest: false
      };
    } catch (error) {
      console.error(`Error extracting metadata from ${filePath}:`, error);
      return null;
    }
  }

  async getSessionChanges(sessionId: string): Promise<FileChange[]> {
    const filePath = path.join(this.projectLogDir, `${sessionId}.jsonl`);

    try {
      await fs.promises.access(filePath);
    } catch (error) {
      throw new Error(`Session file not found: ${sessionId}`);
    }

    const changes = await this.parseLogFile(filePath);

    // Add session metadata to each change
    const firstUserMessage = await this.getFirstUserMessage(filePath);

    // Determine if this is the latest session
    const sessions = await this.getAllSessionMetadata();
    const isLatest = sessions.length > 0 && sessions[0].sessionId === sessionId;

    return changes.map(change => ({
      ...change,
      sessionId,
      sessionFile: filePath,
      userMessage: firstUserMessage,
      isLatestSession: isLatest
    }));
  }

  private async getFirstUserMessage(filePath: string): Promise<string> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      for (const line of lines) {
        try {
          const entry: ClaudeLogEntry = JSON.parse(line);

          // Find first user message with text content
          if (entry.type === 'user' && entry.message?.content) {
            // Handle both string and array formats
            if (typeof entry.message.content === 'string' && entry.message.content.trim()) {
              return entry.message.content;
            } else if (Array.isArray(entry.message.content)) {
              for (const content of entry.message.content) {
                if (content.type === 'text' && content.text && content.text.trim()) {
                  return content.text;
                }
              }
            }
          }
        } catch (e) {
          continue;
        }
      }

      return 'No message';
    } catch (error) {
      return 'No message';
    }
  }

  // Parse session into conversation turns
  async getSessionWithTurns(sessionId: string): Promise<SessionWithTurns> {
    const filePath = path.join(this.projectLogDir, `${sessionId}.jsonl`);

    try {
      await fs.promises.access(filePath);
    } catch (error) {
      throw new Error(`Session file not found: ${sessionId}`);
    }

    const fileStat = await fs.promises.stat(filePath);
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    // Determine if this is the latest session
    const sessions = await this.getAllSessionMetadata();
    const isLatest = sessions.length > 0 && sessions[0].sessionId === sessionId;

    // Parse all entries with their UUIDs
    interface ParsedEntry extends ClaudeLogEntry {
      uuid?: string;
      parentUuid?: string;
    }

    const entries: ParsedEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as ParsedEntry;
        entries.push(entry);
      } catch (e) {
        continue;
      }
    }

    // Build conversation turns
    const turns: ConversationTurn[] = [];
    let currentTurn: ConversationTurn | null = null;
    let turnCounter = 0;

    for (const entry of entries) {
      // Start a new turn when we see a REAL user message (not tool_result)
      if (entry.type === 'user') {
        // Check if this is an actual human message or a tool_result
        const isToolResult = this.isToolResultEntry(entry);

        if (!isToolResult) {
          // Save previous turn if it has file changes
          if (currentTurn && currentTurn.fileChanges.length > 0) {
            turns.push(currentTurn);
          }

          turnCounter++;
          const userMessage = this.extractUserMessage(entry);
          console.log(`Turn ${turnCounter} user message:`, userMessage.substring(0, 50) + '...');

          currentTurn = {
            id: `${sessionId}-turn-${turnCounter}`,
            timestamp: entry.timestamp || new Date().toISOString(),
            userMessage: userMessage,  // Full message, no truncation
            userMessageFull: userMessage,
            assistantMessage: '',  // Will be populated from assistant entries
            fileChanges: [],
            isLatestSession: isLatest
          };
        }
        // If it's a tool_result, we just continue with the current turn
      }

      // Process assistant messages: extract file changes AND text content
      if (entry.type === 'assistant' && entry.message?.content && Array.isArray(entry.message.content)) {
        const changes = this.extractAllFileChanges(entry, currentTurn?.id || `${sessionId}-turn-0`, isLatest);
        const assistantText = this.extractAssistantText(entry);

        // If no turn exists yet, create a default turn for early content
        if (!currentTurn && (changes.length > 0 || assistantText)) {
          turnCounter++;
          currentTurn = {
            id: `${sessionId}-turn-${turnCounter}`,
            timestamp: entry.timestamp || new Date().toISOString(),
            userMessage: 'No message',
            userMessageFull: 'No message',
            assistantMessage: '',
            fileChanges: [],
            isLatestSession: isLatest
          };
        }

        if (currentTurn) {
          // Add file changes
          if (changes.length > 0) {
            currentTurn.fileChanges.push(...changes);
          }
          // Append assistant text (consolidate multiple assistant messages)
          if (assistantText) {
            if (currentTurn.assistantMessage) {
              currentTurn.assistantMessage += '\n\n' + assistantText;
            } else {
              currentTurn.assistantMessage = assistantText;
            }
          }
        }
      }
    }

    // Don't forget the last turn
    if (currentTurn && currentTurn.fileChanges.length > 0) {
      turns.push(currentTurn);
    }

    // Get first timestamp from entries
    const firstTimestamp = entries.find(e => e.timestamp)?.timestamp || new Date().toISOString();

    return {
      sessionId,
      sessionFile: filePath,
      timestamp: firstTimestamp,
      mtime: fileStat.mtime.getTime(),
      isLatest,
      turns
    };
  }

  // Check if a user entry is actually a tool_result (system response) rather than human message
  private isToolResultEntry(entry: ClaudeLogEntry): boolean {
    if (!entry.message?.content) {
      return false;
    }

    // If content is a string, it's a real user message
    if (typeof entry.message.content === 'string') {
      return false;
    }

    // If content is an array, check if it only contains tool_result items
    if (Array.isArray(entry.message.content)) {
      // If there's any text content, it's a real user message
      for (const content of entry.message.content) {
        if (content.type === 'text' && content.text && content.text.trim()) {
          return false; // Has text, so it's a real user message
        }
      }
      // Check if it has tool_result content
      for (const content of entry.message.content) {
        if (content.type === 'tool_result') {
          return true; // This is a tool_result entry
        }
      }
    }

    return false;
  }

  private extractUserMessage(entry: ClaudeLogEntry): string {
    if (!entry.message?.content) {
      return 'No message';
    }

    if (typeof entry.message.content === 'string') {
      return entry.message.content.trim() || 'No message';
    }

    if (Array.isArray(entry.message.content)) {
      for (const content of entry.message.content) {
        if (content.type === 'text' && content.text && content.text.trim()) {
          return content.text;
        }
      }
    }

    return 'No message';
  }

  // Extract text content from assistant messages (not tool_use)
  private extractAssistantText(entry: ClaudeLogEntry): string {
    if (!entry.message?.content) {
      return '';
    }

    // If content is a string, return it directly
    if (typeof entry.message.content === 'string') {
      return entry.message.content.trim();
    }

    // If content is an array, extract all text items
    if (Array.isArray(entry.message.content)) {
      const textParts: string[] = [];
      for (const content of entry.message.content) {
        if (content.type === 'text' && content.text && content.text.trim()) {
          textParts.push(content.text.trim());
        }
      }
      return textParts.join('\n\n');
    }

    return '';
  }

  private extractAllFileChanges(entry: ClaudeLogEntry, turnId: string, isLatestSession: boolean): FileChange[] {
    const changes: FileChange[] = [];
    const { timestamp } = entry;

    if (!entry.message?.content || !Array.isArray(entry.message.content)) {
      return changes;
    }

    let changeIndex = 0;
    for (const content of entry.message.content) {
      if (content.type === 'tool_use') {
        const toolName = content.name;
        const input = content.input;
        changeIndex++;

        let change: FileChange | null = null;

        switch (toolName) {
          case 'Write':
            change = {
              id: `${turnId}-${timestamp}-write-${changeIndex}`,
              timestamp: timestamp || '',
              type: 'write',
              filePath: input?.file_path,
              newContent: input?.content,
              isLatestSession
            };
            break;

          case 'Edit':
            change = {
              id: `${turnId}-${timestamp}-edit-${changeIndex}`,
              timestamp: timestamp || '',
              type: 'edit',
              filePath: input?.file_path,
              changes: [{
                oldString: input?.old_string,
                newString: input?.new_string,
                replaceAll: input?.replace_all
              }],
              isLatestSession
            };
            break;

          case 'MultiEdit':
            change = {
              id: `${turnId}-${timestamp}-multiedit-${changeIndex}`,
              timestamp: timestamp || '',
              type: 'edit',
              filePath: input?.file_path,
              changes: input?.edits,
              isLatestSession
            };
            break;
        }

        if (change && change.filePath) {
          changes.push(change);
        }
      }
    }

    return changes;
  }
}