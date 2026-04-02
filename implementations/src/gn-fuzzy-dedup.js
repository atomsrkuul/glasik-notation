/**
 * GN v0.8 Locality-Sensitive Hashing (LSH) Deduplication
 * Removes near-duplicate shards (saves 5-10% storage)
 * Detects similar findings without exact match requirement
 * 
 * Example:
 * "JWT found in response header" vs "JWT in auth header"
 * Should be merged, not stored separately
 */

class GNFuzzyDedup {
  constructor() {
    // MinHash parameters for LSH
    this.numHashFunctions = 128;
    this.shingleSize = 3; // 3-gram shingles
    this.similarityThreshold = 0.75; // 75% similarity = duplicate
  }

  /**
   * Generate k-gram shingles from text (for LSH)
   * @param {string} text
   * @param {number} k - Shingle size (default: 3)
   * @returns {Set<string>}
   */
  _generateShingles(text, k = 3) {
    const cleaned = text.toLowerCase().replace(/\s+/g, ' ');
    const shingles = new Set();
    
    for (let i = 0; i <= cleaned.length - k; i++) {
      shingles.add(cleaned.substring(i, i + k));
    }
    
    return shingles;
  }

  /**
   * Compute Jaccard similarity between two texts
   * (intersection / union of shingles)
   * @param {string} text1
   * @param {string} text2
   * @returns {number} Similarity [0, 1]
   */
  jaccardSimilarity(text1, text2) {
    const shingles1 = this._generateShingles(text1, this.shingleSize);
    const shingles2 = this._generateShingles(text2, this.shingleSize);

    if (shingles1.size === 0 || shingles2.size === 0) return 0;

    // Intersection
    const intersection = new Set(
      [...shingles1].filter(x => shingles2.has(x))
    );

    // Union
    const union = new Set([...shingles1, ...shingles2]);

    return intersection.size / union.size;
  }

  /**
   * Min-Hash signature for text (for LSH bucketing)
   * @param {string} text
   * @returns {Array<number>} Hash signature
   */
  _minHashSignature(text) {
    const crypto = require('crypto');
    const shingles = this._generateShingles(text, this.shingleSize);
    const signature = [];

    for (let i = 0; i < this.numHashFunctions; i++) {
      let minHash = Infinity;
      
      for (const shingle of shingles) {
        const hash = crypto
          .createHash('md5')
          .update(`${i}:${shingle}`)
          .digest('hex');
        const hashInt = parseInt(hash.substring(0, 8), 16);
        minHash = Math.min(minHash, hashInt);
      }

      signature.push(minHash === Infinity ? 0 : minHash);
    }

    return signature;
  }

  /**
   * Find LSH bucket for signature (group similar items)
   * @param {Array<number>} signature
   * @param {number} bandSize - Rows per band (default: 16)
   * @returns {string} Bucket ID
   */
  _getLSHBucket(signature, bandSize = 16) {
    const numBands = Math.ceil(signature.length / bandSize);
    const buckets = [];

    for (let band = 0; band < numBands; band++) {
      const start = band * bandSize;
      const end = Math.min(start + bandSize, signature.length);
      const bandSignature = signature.slice(start, end).join(',');
      const crypto = require('crypto');
      const hash = crypto.createHash('md5').update(bandSignature).digest('hex');
      buckets.push(`b${band}:${hash.substring(0, 8)}`);
    }

    return buckets.join('|');
  }

  /**
   * Deduplicate shards in database
   * Finds and removes near-duplicates
   * @param {Database} db - SQLite database instance
   * @param {string} sessionId
   * @returns {object} { removed, kept, savings }
   */
  deduplicateShards(db, sessionId) {
    const getStmt = db.prepare(
      'SELECT id, content FROM shards WHERE session_id = ? ORDER BY shard_index'
    );
    const shards = getStmt.all(sessionId);

    if (shards.length < 2) {
      return { removed: 0, kept: shards.length, savings: 0 };
    }

    // Group by LSH bucket
    const buckets = {};
    shards.forEach(shard => {
      const signature = this._minHashSignature(shard.content);
      const bucket = this._getLSHBucket(signature);
      
      if (!buckets[bucket]) buckets[bucket] = [];
      buckets[bucket].push(shard);
    });

    // Find duplicates within buckets
    const toRemove = [];
    let totalSavings = 0;

    Object.values(buckets).forEach(bucket => {
      // Compare each pair in bucket
      for (let i = 0; i < bucket.length - 1; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const sim = this.jaccardSimilarity(
            bucket[i].content,
            bucket[j].content
          );

          // If similar enough, mark for removal
          if (sim >= this.similarityThreshold) {
            // Keep first, remove second
            toRemove.push(bucket[j].id);
            totalSavings += bucket[j].content.length;
          }
        }
      }
    });

    // Remove duplicates from database
    if (toRemove.length > 0) {
      const deleteStmt = db.prepare('DELETE FROM shards WHERE id = ?');
      toRemove.forEach(id => deleteStmt.run(id));
    }

    return {
      removed: toRemove.length,
      kept: shards.length - toRemove.length,
      savings: totalSavings,
      savedPercent: ((totalSavings / shards.reduce((s, sh) => s + sh.content.length, 0)) * 100).toFixed(1)
    };
  }

  /**
   * Check if new shard is duplicate of existing
   * @param {Database} db
   * @param {string} sessionId
   * @param {string} content
   * @returns {object} { isDuplicate, similarShardId, similarity }
   */
  checkDuplicate(db, sessionId, content) {
    const getStmt = db.prepare(
      'SELECT id, content FROM shards WHERE session_id = ? LIMIT 10'
    );
    const existingShards = getStmt.all(sessionId);

    let maxSimilarity = 0;
    let similarShardId = null;

    for (const shard of existingShards) {
      const sim = this.jaccardSimilarity(content, shard.content);
      if (sim > maxSimilarity) {
        maxSimilarity = sim;
        similarShardId = shard.id;
      }
    }

    return {
      isDuplicate: maxSimilarity >= this.similarityThreshold,
      similarShardId,
      similarity: maxSimilarity.toFixed(3)
    };
  }
}

module.exports = GNFuzzyDedup;
