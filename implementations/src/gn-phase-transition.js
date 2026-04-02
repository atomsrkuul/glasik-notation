/**
 * GN Phase Transition (PT) Detection
 * Tracks threshold crossings in shard importance
 * Detects qualitative shifts in knowledge relevance
 */

class GNPhaseTransition {
  constructor(db) {
    this.db = db;
    this.thresholds = {
      CRITICAL: 0.80,
      HIGH: 0.60,
      MEDIUM: 0.40,
      LOW: 0.00
    };
    this.initTables();
  }

  initTables() {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS phase_transitions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shard_id INTEGER NOT NULL,
          session_id TEXT NOT NULL,
          from_phase TEXT NOT NULL,
          to_phase TEXT NOT NULL,
          importance_before REAL NOT NULL,
          importance_after REAL NOT NULL,
          delta REAL NOT NULL,
          transition_type TEXT,
          context TEXT,
          occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(shard_id) REFERENCES shards(id)
        );
        CREATE INDEX IF NOT EXISTS idx_pt_shard ON phase_transitions(shard_id);
        CREATE INDEX IF NOT EXISTS idx_pt_type ON phase_transitions(transition_type);
        CREATE INDEX IF NOT EXISTS idx_pt_occurred ON phase_transitions(occurred_at);
      `);
    } catch (e) {
      // Already exists
    }
  }

  /**
   * Determine which phase a shard is in
   */
  getPhase(importance) {
    if (importance >= this.thresholds.CRITICAL) return 'CRITICAL';
    if (importance >= this.thresholds.HIGH) return 'HIGH';
    if (importance >= this.thresholds.MEDIUM) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Detect transition type based on direction
   */
  getTransitionType(fromPhase, toPhase, delta) {
    const phaseOrder = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const fromIdx = phaseOrder.indexOf(fromPhase);
    const toIdx = phaseOrder.indexOf(toPhase);

    if (toIdx > fromIdx) {
      // Rising transition
      if (delta > 0.2) return 'RAPID_ASCENT';
      if (delta > 0.1) return 'EMERGENCE';
      return 'COALESCING';
    } else if (toIdx < fromIdx) {
      // Falling transition
      if (delta < -0.2) return 'RAPID_DESCENT';
      if (delta < -0.1) return 'DEGRADATION';
      return 'WEAKENING';
    }
    
    // Same phase
    if (delta > 0.05) return 'STRENGTHENING';
    if (delta < -0.05) return 'FADING';
    return 'STABLE';
  }

  /**
   * Log a phase transition
   */
  logTransition(shardId, sessionId, importanceBefore, importanceAfter, context) {
    try {
      const phaseFrom = this.getPhase(importanceBefore || 0);
      const phaseTo = this.getPhase(importanceAfter || 0);
      const delta = (importanceAfter || 0) - (importanceBefore || 0);
      const transitionType = this.getTransitionType(phaseFrom, phaseTo, delta);

      // Only log if there's actual phase change OR significant movement
      if (phaseFrom !== phaseTo || Math.abs(delta) > 0.05) {
        const stmt = this.db.prepare(`
          INSERT INTO phase_transitions
          (shard_id, session_id, from_phase, to_phase, importance_before, importance_after, delta, transition_type, context)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          shardId,
          sessionId,
          phaseFrom,
          phaseTo,
          importanceBefore || 0,
          importanceAfter || 0,
          delta,
          transitionType,
          context ? context.slice(0, 500) : null
        );

        return {
          shardId,
          from: phaseFrom,
          to: phaseTo,
          type: transitionType,
          delta: delta.toFixed(3)
        };
      }
      return null;
    } catch (e) {
      console.error('[PT] Log error:', e.message);
      return null;
    }
  }

  /**
   * Get all transitions for a shard
   */
  getShardTransitions(shardId, limit = 20) {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          from_phase,
          to_phase,
          importance_before,
          importance_after,
          delta,
          transition_type,
          occurred_at
        FROM phase_transitions
        WHERE shard_id = ?
        ORDER BY occurred_at DESC
        LIMIT ?
      `);
      return stmt.all(shardId, limit);
    } catch (e) {
      return [];
    }
  }

  /**
   * Get all transitions of a specific type (emergences, degradations, etc.)
   */
  getTransitionsByType(transitionType, limit = 20) {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          shard_id,
          from_phase,
          to_phase,
          importance_before,
          importance_after,
          delta,
          transition_type,
          occurred_at
        FROM phase_transitions
        WHERE transition_type = ?
        ORDER BY occurred_at DESC
        LIMIT ?
      `);
      return stmt.all(transitionType, limit);
    } catch (e) {
      return [];
    }
  }

  /**
   * Get recent phase transitions (last N)
   */
  getRecentTransitions(limit = 20) {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          shard_id,
          from_phase,
          to_phase,
          importance_before,
          importance_after,
          delta,
          transition_type,
          occurred_at
        FROM phase_transitions
        ORDER BY occurred_at DESC
        LIMIT ?
      `);
      return stmt.all(limit);
    } catch (e) {
      return [];
    }
  }

  /**
   * Get stats on phase transitions
   */
  getStats() {
    try {
      const stats = this.db.prepare(`
        SELECT 
          transition_type,
          COUNT(*) as count,
          AVG(delta) as avg_delta,
          MAX(delta) as max_delta,
          MIN(delta) as min_delta
        FROM phase_transitions
        GROUP BY transition_type
        ORDER BY count DESC
      `).all();

      const total = this.db.prepare(`
        SELECT COUNT(*) as total FROM phase_transitions
      `).get();

      return {
        total: total.total,
        byType: stats
      };
    } catch (e) {
      return { total: 0, byType: [] };
    }
  }

  /**
   * Detect shards currently in critical state
   */
  getCriticalShards(limit = 10) {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          s.id,
          s.session_id,
          s.importance_score,
          MAX(pt.occurred_at) as last_transition
        FROM shards s
        LEFT JOIN phase_transitions pt ON s.id = pt.shard_id
        WHERE s.importance_score >= ?
        GROUP BY s.id
        ORDER BY s.importance_score DESC
        LIMIT ?
      `);
      return stmt.all(this.thresholds.CRITICAL, limit);
    } catch (e) {
      return [];
    }
  }
}

module.exports = GNPhaseTransition;
