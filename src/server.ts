import express from 'express';
import { WebSocketServer } from 'ws';
import * as path from 'path';
import * as http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { ClaudeLogParser } from './parser.js';
import { ChangeTracker } from './change-tracker.js';
import { ParsedChange } from './types.js';

export class RevertServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private parser: ClaudeLogParser;
  private tracker: ChangeTracker;
  private changes: ParsedChange[] = [];
  private port: number;

  constructor(port: number = 3456) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.parser = new ClaudeLogParser();
    this.tracker = new ChangeTracker();

    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupRoutes() {
    // Serve static files from public directory
    this.app.use(express.static(path.join(__dirname, '..', 'public')));

    // Serve index.html for root route
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    });

    // API endpoint to get all sessions metadata
    this.app.get('/api/sessions', async (req, res) => {
      try {
        const sessions = await this.parser.getAllSessionMetadata();
        res.json(sessions);
      } catch (error) {
        console.error('Error getting sessions:', error);
        res.status(500).json({ error: 'Failed to load sessions' });
      }
    });

    // API endpoint to get changes for a specific session
    this.app.get('/api/session/:sessionId', async (req, res) => {
      try {
        const sessionId = req.params.sessionId;
        const changes = await this.parser.getSessionChanges(sessionId);
        res.json(changes);
      } catch (error) {
        console.error('Error getting session changes:', error);
        res.status(500).json({ error: 'Failed to load session changes' });
      }
    });

    // API endpoint to get file content
    this.app.get('/api/file-content', async (req, res) => {
      try {
        const filePath = req.query.path as string;
        if (!filePath) {
          return res.status(400).json({ error: 'File path is required' });
        }

        // Security check: ensure file is within current working directory
        const absolutePath = path.resolve(filePath);
        const cwd = process.cwd();
        if (!absolutePath.startsWith(cwd)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const fs = await import('fs');
        const content = await fs.promises.readFile(absolutePath, 'utf-8');
        res.send(content);
      } catch (error) {
        console.error('Error reading file:', error);
        res.status(404).json({ error: 'File not found' });
      }
    });

    // API endpoint to check file existence
    this.app.get('/api/file-exists', async (req, res) => {
      try {
        const filePath = req.query.path as string;
        if (!filePath) {
          return res.status(400).json({ error: 'File path is required' });
        }

        // Security check: ensure file is within current working directory
        const absolutePath = path.resolve(filePath);
        const cwd = process.cwd();
        if (!absolutePath.startsWith(cwd)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const fs = await import('fs');
        try {
          await fs.promises.access(absolutePath);
          res.json({ exists: true });
        } catch {
          res.json({ exists: false });
        }
      } catch (error: any) {
        res.status(500).json({ error: 'Failed to check file existence' });
      }
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('Client connected');

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());

          switch (data.type) {
            case 'getSessions':
              await this.handleGetSessions(ws);
              break;
            case 'getSessionTurns':
              await this.handleGetSessionTurns(ws, data.sessionId);
              break;
            case 'getSessionChanges':
              await this.handleGetSessionChanges(ws, data.sessionId);
              break;
            case 'getChanges':
              await this.handleGetChanges(ws);
              break;
            case 'revert':
              await this.handleRevert(ws, data.changeId);
              break;
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format'
          }));
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
      });
    });
  }

  private async handleGetSessions(ws: any) {
    try {
      console.log('Getting sessions metadata...');
      const sessions = await this.parser.getAllSessionMetadata();
      console.log(`Found ${sessions.length} sessions`);

      ws.send(JSON.stringify({
        type: 'sessions',
        sessions
      }));
    } catch (error: any) {
      console.error('Error getting sessions:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message || 'Failed to load sessions'
      }));
    }
  }

  private async handleGetSessionTurns(ws: any, sessionId: string) {
    try {
      console.log(`Getting turns for session ${sessionId}...`);
      const sessionWithTurns = await this.parser.getSessionWithTurns(sessionId);
      console.log(`Found ${sessionWithTurns.turns.length} conversation turns`);

      // Process file changes for each turn
      for (const turn of sessionWithTurns.turns) {
        if (turn.fileChanges.length > 0) {
          const processedChanges = await this.tracker.processChanges(turn.fileChanges);
          turn.parsedChanges = processedChanges;

          // Add to global changes list for revert tracking
          this.changes = [...this.changes, ...processedChanges];
        }
      }

      // Debug: log the turns being sent
      console.log(`Sending ${sessionWithTurns.turns.length} turns:`);
      for (const turn of sessionWithTurns.turns) {
        console.log(`  Turn ${turn.id}: "${turn.userMessage}" (${turn.fileChanges.length} file changes)`);
      }

      ws.send(JSON.stringify({
        type: 'sessionTurns',
        sessionId,
        session: sessionWithTurns
      }));
    } catch (error: any) {
      console.error('Error getting session turns:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message || 'Failed to load session turns'
      }));
    }
  }

  private async handleGetSessionChanges(ws: any, sessionId: string) {
    try {
      console.log(`Getting changes for session ${sessionId}...`);
      const fileChanges = await this.parser.getSessionChanges(sessionId);
      console.log(`Found ${fileChanges.length} file changes`);

      console.log('Processing changes...');
      const processedChanges = await this.tracker.processChanges(fileChanges);
      console.log(`Processed ${processedChanges.length} changes`);

      // Add to global changes list
      this.changes = [...this.changes, ...processedChanges];

      // Sort changes by timestamp (newest first)
      processedChanges.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      ws.send(JSON.stringify({
        type: 'sessionChanges',
        sessionId,
        changes: processedChanges
      }));
    } catch (error: any) {
      console.error('Error getting session changes:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message || 'Failed to load session changes'
      }));
    }
  }

  private async handleGetChanges(ws: any) {
    try {
      // Get and parse changes from Claude logs
      console.log('Getting file changes...');
      const fileChanges = await this.parser.getFileChanges();
      console.log(`Found ${fileChanges.length} file changes`);

      console.log('Processing changes...');
      this.changes = await this.tracker.processChanges(fileChanges);
      console.log(`Processed ${this.changes.length} changes`);

      // Sort changes by timestamp (newest first)
      this.changes.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      console.log('Sending changes to client:', this.changes.length);
      ws.send(JSON.stringify({
        type: 'changes',
        changes: this.changes
      }));
    } catch (error: any) {
      console.error('Error getting changes:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message || 'Failed to load changes'
      }));
    }
  }

  private async handleRevert(ws: any, changeId: string) {
    try {
      console.log('Handling revert for change:', changeId);
      const change = this.changes.find(c => c.id === changeId);
      if (!change) {
        console.error('Change not found:', changeId);
        throw new Error('Change not found');
      }

      console.log('Found change:', change);
      await this.tracker.revertChange(change);
      console.log('Revert successful');

      ws.send(JSON.stringify({
        type: 'revertSuccess',
        changeId
      }));
    } catch (error: any) {
      console.error('Error reverting change:', error);
      ws.send(JSON.stringify({
        type: 'revertError',
        error: error.message || 'Failed to revert change'
      }));
    }
  }

  async start() {
    // Initialize the change tracker
    await this.tracker.init();
    
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`Claude Revert server running on http://localhost:${this.port}`);
        resolve(true);
      });
    });
  }

  stop() {
    this.server.close();
    this.wss.close();
  }
}