/**
 * GN Feed Pipeline v0.1
 * Continuous ingestion of new data into the ribosome
 * Watches memory, git, sessions, bugs for changes
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class GNFeedPipeline {
  constructor(workspace, db) {
    this.workspace = workspace;
    this.db = db;
    this.state = {
      lastMemoryMtime: 0,
      lastGitCommit: '',
      lastSessionCount: 0,
      lastBugCount: 0,
      feedRate: 0
    };
  }

  /**
   * Check for updates and feed new data
   */
  async checkAndFeed() {
    const updates = [];

    // Check memory updates
    const memoryUpdates = this.checkMemoryUpdates();
    if (memoryUpdates) updates.push({ type: 'memory', count: memoryUpdates });

    // Check git updates
    const gitUpdates = this.checkGitUpdates();
    if (gitUpdates) updates.push({ type: 'git', count: gitUpdates });

    // Check new sessions
    const sessionUpdates = this.checkSessionUpdates();
    if (sessionUpdates) updates.push({ type: 'sessions', count: sessionUpdates });

    // Check bug updates
    const bugUpdates = this.checkBugUpdates();
    if (bugUpdates) updates.push({ type: 'bugs', count: bugUpdates });

    this.state.feedRate = updates.length;
    return updates;
  }

  /**
   * Check MEMORY.md for changes
   */
  checkMemoryUpdates() {
    try {
      const memoryPath = path.join(this.workspace, 'MEMORY.md');
      if (!fs.existsSync(memoryPath)) return 0;

      const stat = fs.statSync(memoryPath);
      if (stat.mtime.getTime() > this.state.lastMemoryMtime) {
        this.state.lastMemoryMtime = stat.mtime.getTime();
        return 1; // Treat entire file as one update
      }
    } catch (e) {
      // Silently fail
    }
    return 0;
  }

  /**
   * Check git log for new commits
   */
  checkGitUpdates() {
    try {
      const lastCommit = execSync(
        `cd ${this.workspace} && git log -1 --oneline`,
        { encoding: 'utf8' }
      ).trim();

      if (lastCommit !== this.state.lastGitCommit) {
        this.state.lastGitCommit = lastCommit;
        return 1;
      }
    } catch (e) {
      // Not a git repo or git error
    }
    return 0;
  }

  /**
   * Check for new session files
   */
  checkSessionUpdates() {
    try {
      const sessionsDir = path.join(this.workspace, 'sessions');
      if (!fs.existsSync(sessionsDir)) return 0;

      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
      const diff = files.length - this.state.lastSessionCount;

      if (diff > 0) {
        this.state.lastSessionCount = files.length;
        return diff;
      }
    } catch (e) {
      // Directory doesn't exist or error
    }
    return 0;
  }

  /**
   * Check for new bugs
   */
  checkBugUpdates() {
    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM bugs');
      const result = stmt.get();
      const count = result.count || 0;

      const diff = count - this.state.lastBugCount;
      if (diff > 0) {
        this.state.lastBugCount = count;
        return diff;
      }
    } catch (e) {
      // Table doesn't exist
    }
    return 0;
  }

  /**
   * Get pipeline stats
   */
  getStats() {
    return {
      feedRate: this.state.feedRate,
      lastMemoryUpdate: new Date(this.state.lastMemoryMtime).toISOString(),
      lastGitCommit: this.state.lastGitCommit,
      sessionCount: this.state.lastSessionCount,
      bugCount: this.state.lastBugCount
    };
  }
}

module.exports = GNFeedPipeline;
