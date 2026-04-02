/**
 * GN v0.8 Temporal Shard Weighting
 * Weight shards by recency & access frequency for better retrieval
 * Improves relevance ordering and search speed
 * 
 * Scoring factors:
 * - Recency (50%): Recent findings ranked higher
 * - Frequency (30%): Often-accessed shards boost
 * - Time-decay (20%): Old findings gradually lose importance
 */

class GNTemporalScoring {
  constructor() {
    // Decay parameters
    this.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
    this.halfLife = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
  }

  /**
   * Calculate recency score (0-1)
   * Recent = 1.0, old = 0.0
   * @param {Date|string} createdAt
   * @returns {number} Recency score [0, 1]
   */
  getRecencyScore(createdAt) {
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    const age = now - created;

    if (age < 0) return 0; // Future date (shouldn't happen)
    if (age > this.maxAge) return 0; // Too old

    // Exponential decay using half-life
    // After half-life: score = 0.5
    // After 2x half-life: score = 0.25, etc.
    return Math.pow(0.5, age / this.halfLife);
  }

  /**
   * Calculate frequency score (0-1)
   * Based on query count
   * @param {number} queryCount
   * @returns {number} Frequency score [0, 1]
   */
  getFrequencyScore(queryCount) {
    // Logarithmic: diminishing returns after 10 accesses
    // 0 queries = 0.0, 1 query = 0.3, 10 queries = 0.7, 100 = 0.95
    if (queryCount === 0) return 0;
    return Math.min(1, Math.log(queryCount + 1) / Math.log(100));
  }

  /**
   * Calculate time-decay bonus
   * Penalizes stale context
   * @param {Date|string} lastQueried
   * @returns {number} Decay factor (0-1)
   */
  getTimeDecayFactor(lastQueried) {
    if (!lastQueried) return 0.5; // Default: new shard
    
    const last = new Date(lastQueried).getTime();
    const now = Date.now();
    const daysSince = (now - last) / (24 * 60 * 60 * 1000);

    // Days since access: 0 days = 1.0, 1 day = 0.9, 7 days = 0.5
    return Math.max(0.1, 1 - (daysSince / 10));
  }

  /**
   * Compute overall temporal importance score
   * @param {object} shard - { created_at, last_queried, query_count, importance_score }
   * @returns {number} Final importance [0, 1]
   */
  computeTemporalScore(shard) {
    const recency = this.getRecencyScore(shard.created_at);
    const frequency = this.getFrequencyScore(shard.query_count || 0);
    const timeDecay = this.getTimeDecayFactor(shard.last_queried);

    // Weighted average
    const temporal = (recency * 0.5) + (frequency * 0.3) + (timeDecay * 0.2);

    // Combine with original importance (if present)
    const original = shard.importance_score || 0.5;
    const combined = (temporal * 0.7) + (original * 0.3);

    return Math.min(1, Math.max(0, combined));
  }

  /**
   * Update shard importance based on temporal factors
   * Call this periodically (e.g., daily) or on access
   * @param {Database} db
   * @param {string} sessionId
   * @returns {object} { updated, avgScore }
   */
  updateTemporalScores(db, sessionId) {
    const getStmt = db.prepare(`
      SELECT id, created_at, last_queried, query_count, importance_score
      FROM shards
      WHERE session_id = ?
    `);

    const shards = getStmt.all(sessionId);
    let totalScore = 0;

    const updateStmt = db.prepare(`
      UPDATE shards
      SET importance_score = ?
      WHERE id = ?
    `);

    shards.forEach(shard => {
      const newScore = this.computeTemporalScore(shard);
      updateStmt.run(newScore, shard.id);
      totalScore += newScore;
    });

    const avgScore = shards.length > 0 ? (totalScore / shards.length).toFixed(3) : 0;

    return {
      updated: shards.length,
      avgScore,
      samples: shards.slice(0, 3).map(s => ({
        id: s.id,
        age: this._daysOld(s.created_at),
        queries: s.query_count,
        oldScore: (s.importance_score || 0).toFixed(3),
        newScore: this.computeTemporalScore(s).toFixed(3)
      }))
    };
  }

  /**
   * Helper: calculate days old
   * @param {Date|string} date
   * @returns {number} Days
   */
  _daysOld(date) {
    const d = new Date(date).getTime();
    return Math.floor((Date.now() - d) / (24 * 60 * 60 * 1000));
  }

  /**
   * Boost recently accessed shards
   * Call after getRelevantShards to prioritize fresh context
   * @param {Array} shards
   * @returns {Array} Re-sorted shards
   */
  boostRecentAccess(shards) {
    return shards.map(shard => {
      const boost = this.getTimeDecayFactor(shard.last_queried);
      return {
        ...shard,
        boostedScore: (shard.importance_score || 0.5) * (1 + boost * 0.3),
        boost
      };
    }).sort((a, b) => b.boostedScore - a.boostedScore);
  }
}

module.exports = GNTemporalScoring;
