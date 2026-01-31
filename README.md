# 🔄 Crevr

A beautiful web-based UI for reviewing and reverting Claude Code changes. Think of it as "git diff" but for your Claude conversations.

## ⚠️ Alpha Version Disclaimer

**This is an alpha release (v0.0.1) and is quite raw.** Please be aware:

- 🐛 **May contain bugs** - File parsing or revert operations might not work correctly in all cases
- ⚠️ **Incorrect reverts possible** - Always backup important files before using  
- 🧪 **Experimental features** - Some functionality may be unstable or incomplete
- 📝 **Limited testing** - Not all Claude Code scenarios have been tested
- 💾 **Use with caution** - We recommend testing on non-critical projects first

**Always review changes carefully before reverting and keep backups of important work.**

If you encounter issues, please [report them on GitHub](https://github.com/garrrikkotua/crevr/issues) to help improve the tool.

## ✨ Features

- **🗨️ Session Timeline** - View all your Claude conversations organized chronologically
- **🔗 Change Attribution** - See which user question triggered each file modification
- **📌 Latest Session Focus** - Automatically loads your most recent conversation
- **🔍 Visual Diff Viewer** - See exactly what Claude changed with before/after comparisons
- **🎯 Selective Reversion** - Revert individual changes or entire files (latest session only)
- **⚠️ Historical Protection** - Old session changes are marked as read-only to prevent conflicts
- **📁 Smart File Organization** - Changes grouped by session and file
- **🗂️ Two View Modes** - Diff view and inline view for different perspectives
- **💾 Persistent Tracking** - Reverted changes stay hidden (never modifies Claude logs)
- **🔄 Smart Recovery** - Restore deleted files or undo unwanted modifications
- **⚡ On-Demand Loading** - Fast initial load, fetches session details only when needed
- **🌐 Web-based** - Works in any browser, no IDE integration needed

## 🚀 Quick Start

### Install globally via npm:

```bash
npm install -g crevr
```

### Use in any directory where Claude Code has been used:

```bash
# Navigate to your project directory
cd /your/project

# Start Crevr (opens in browser automatically)
crevr

# Or specify a custom port
crevr --port 8080

# Don't auto-open browser
crevr --no-open
```

That's it! Crevr will scan your Claude Code session and show you all the changes.

## 🆕 What's New in v0.0.2

### Session Timeline View
- **📅 All conversations in one place** - See every Claude session organized by date and time
- **🗨️ Context at a glance** - Each session shows your initial question, helping you quickly identify conversations
- **📌 Latest first** - Your most recent session is automatically selected and loaded

### Change Attribution
- **Link changes to questions** - Each file modification now displays the user question that triggered it
- **Better debugging** - Understand why Claude made specific changes by reviewing the original prompt
- **Improved learning** - See how your phrasing affects Claude's code modifications

### Historical Protection
- **🔒 Read-only old sessions** - Changes from historical sessions are marked and cannot be reverted
- **⚠️ Conflict prevention** - Prevents accidentally reverting outdated changes that may conflict with newer code
- **Clear indicators** - Visual badges show which changes are from the current vs. historical sessions

### Performance Improvements
- **⚡ Faster initial load** - Session metadata loads instantly, full details load on-demand
- **📊 Scalable** - Handles projects with dozens of Claude sessions efficiently
- **🎯 Smart loading** - Only loads data for the sessions you actually view

## 🛠️ How It Works

Crevr reads your Claude Code session files (stored in `~/.claude/projects/`) and presents all file changes in an intuitive web interface. It never modifies your original Claude logs - reverted changes are tracked separately in `~/.crevr/`.

### Key Concepts:

- **Session-based organization** - All your Claude conversations are listed chronologically in the sidebar
- **Change attribution** - Each modification displays the user question that triggered it, helping you understand the context
- **On-demand loading** - Sessions are loaded only when you click on them for optimal performance
- **Latest session priority** - Your most recent conversation is automatically loaded and displayed
- **Historical protection** - Changes from older sessions are marked as read-only to prevent conflicts with subsequent modifications
- **Changes grouped by file** - Within each session, see all modifications organized by file
- **Visual diffs** - Before/after text with syntax highlighting and line-by-line comparisons
- **Safe reversion** - Only latest session changes can be reverted to ensure consistency
- **File recovery** - Deleted files can be restored by reverting their deletion (latest session only)

## 🔧 CLI Options

```bash
crev [options]

Options:
  -p, --port <port>    Port to run the server on (default: 3456)
  --no-open           Don't automatically open the browser
  -V, --version       Output the version number
  -h, --help          Display help information
```

### Additional Commands

```bash
# List recent changes in terminal (no UI)
crevr list
```

## 🎯 Use Cases

- **Conversation-to-code mapping** - Understand which question led to which file changes
- **Review Claude's changes before committing** - See exactly what was modified in each conversation
- **Iterative development analysis** - Compare changes across multiple Claude sessions
- **Selective cleanup** - Keep the good changes from the latest session, revert the problematic ones
- **File recovery** - Restore accidentally deleted files from recent conversations
- **Change auditing** - Track the full history of what Claude has done to your codebase
- **Learning tool** - See how Claude interprets your questions and translates them into code changes
- **Session replay** - Review past conversations and their resulting code modifications

## 🤝 Comparison with Similar Tools

| Feature | Crevr | ccundo | Claude Code Diff |
|---------|------|---------|------------------|
| Web UI | ✅ | ❌ | ❌ |
| Visual diffs | ✅ | ❌ | ✅ |
| Session timeline | ✅ | ❌ | ❌ |
| Change attribution | ✅ | ❌ | ❌ |
| Multi-session support | ✅ | ❌ | ❌ |
| Selective revert | ✅ | ✅ | ❌ |
| File recovery | ✅ | ✅ | ❌ |
| Persistent state | ✅ | ✅ | ❌ |
| Historical protection | ✅ | ❌ | ❌ |
| On-demand loading | ✅ | ❌ | ❌ |

## 🔒 Privacy & Security

- **Local only** - Crevr runs entirely on your machine
- **No data collection** - Nothing is sent to external servers
- **Safe operations** - Original Claude logs are never modified
- **File access** - Only reads files in your current working directory

## 🐛 Troubleshooting

### No sessions showing?
- Make sure you're in a directory where Claude Code has been used
- Check that `~/.claude/projects/` contains session files for your project
- The project path must match exactly (case-sensitive on Unix systems)

### No changes showing in a session?
- Click on a session in the sidebar to load its changes
- Some sessions may not have any file modifications (read-only conversations)
- Try the `crevr list` command to see if changes are detected

### Can't revert a change?
- Only changes from the **latest session** can be reverted
- Historical session changes are marked with "⚠️ Historical" and cannot be reverted
- This prevents conflicts with subsequent modifications
- Check file permissions in your project directory

### Browser doesn't open?
- Use `crevr --no-open` and manually visit the URL shown
- Check if another process is using the port (`crevr --port 8080`)

### Session list is slow to load?
- Initial load fetches only session metadata (fast)
- Full change details load when you click a session
- If you have many sessions, try closing and reopening Crevr to refresh

## 🛣️ Roadmap

- [x] Support for multiple Claude sessions
- [x] Change attribution (link changes to user questions)
- [ ] Undo reverts (re-apply changes)
- [ ] Export diffs to patch files
- [ ] Search and filter sessions by content
- [ ] Integration with git workflows
- [ ] Session comparison (diff between sessions)
- [ ] Dark/light theme toggle
- [ ] Keyboard shortcuts
- [ ] Session notes and bookmarks

## 🤝 Contributing

Found a bug or have a feature request? Please open an issue on [GitHub](https://github.com/garrrikkotua/crevr/issues).

## 👥 Contributors

- **JiunYi Yang (Abao)** - [jiunyi.yang.abao@gmail.com](mailto:jiunyi.yang.abao@gmail.com)

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by [ccundo](https://github.com/RonitSachdev/ccundo) for the revert tracking approach
- Built for the [Claude Code](https://claude.ai/code) community

---

**Made with ❤️ for Claude Code users**