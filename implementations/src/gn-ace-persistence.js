/**
 * GN ACE Persistence Layer
 * Saves/loads ACE learning state to database
 */

class GNACEPersistence {
  constructor(db) {
    this.db = db;
    this.initTables();
  }

  initTables() {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS ace_state (
          id INTEGER PRIMARY KEY,
          symbol_freq TEXT NOT NULL,
          phrase_freq TEXT NOT NULL,
          zlib_level REAL,
          catalyst_strength REAL,
          avg_ratio REAL,
          learning_rate REAL,
          saved_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (e) {
      // Table exists
    }
  }

  /**
   * Save ACE state
   */
  save(aceState) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO ace_state 
        (id, symbol_freq, phrase_freq, zlib_level, catalyst_strength, avg_ratio, learning_rate)
        VALUES (1, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        JSON.stringify(Array.from(aceState.symbolFreq.entries())),
        JSON.stringify(Array.from(aceState.phraseFreq.entries())),
        aceState.zlibLevel,
        aceState.catalystStrength,
        aceState.avgRatio,
        aceState.learningRate
      );

      console.log('[ACE-PERSIST] State saved');
      return true;
    } catch (e) {
      console.error('[ACE-PERSIST] Save error:', e.message);
      return false;
    }
  }

  /**
   * Load ACE state
   */
  load() {
    try {
      const stmt = this.db.prepare(`
        SELECT symbol_freq, phrase_freq, zlib_level, catalyst_strength, avg_ratio, learning_rate
        FROM ace_state WHERE id = 1
      `);
      const row = stmt.get();

      if (row) {
        const loaded = {
          symbolFreq: new Map(JSON.parse(row.symbol_freq)),
          phraseFreq: new Map(JSON.parse(row.phrase_freq)),
          zlibLevel: row.zlib_level || 6,
          catalystStrength: row.catalyst_strength || 0.5,
          avgRatio: row.avg_ratio || 1.0,
          learningRate: row.learning_rate || 0.1
        };

        console.log('[ACE-PERSIST] State loaded from persistence');
        return loaded;
      }
    } catch (e) {
      console.error('[ACE-PERSIST] Load error:', e.message);
    }

    return null;
  }

  /**
   * Clear persisted state
   */
  clear() {
    try {
      this.db.prepare('DELETE FROM ace_state WHERE id = 1').run();
      console.log('[ACE-PERSIST] State cleared');
      return true;
    } catch (e) {
      console.error('[ACE-PERSIST] Clear error:', e.message);
      return false;
    }
  }
}

module.exports = GNACEPersistence;
