/**
 * GN v0.5 Semantic Shards Database
 * Quantum-Shards architecture for infinite context @ zero cost
 * 
 * Stores compressed context shards with semantic embeddings
 * Retrieves relevant shards using cosine similarity
 * Reduces 100k tokens to 500 shards (~50 tokens per shard)
 */

const Database = require('better-sqlite3');
const path = require('path');
const GNv4EncoderDecoder = require('./gn-v4-encoder');

class GNSemanticShards {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'gn-shards.db');
    this.encoder = new GNv4EncoderDecoder();
    this.db = new Database(this.dbPath);
    this.initializeDb();
  }

  initializeDb() {
    // Create tables if not exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        shard_index INTEGER,
        content TEXT NOT NULL,
        compressed BLOB NOT NULL,
        compression_ratio REAL,
        embedding TEXT NOT NULL,
        importance_score REAL DEFAULT 0.5,
        relevance_history TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_queried DATETIME,
        query_count INTEGER DEFAULT 0,
        UNIQUE(session_id, shard_index)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_shards INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        compressed_tokens INTEGER DEFAULT 0,
        cost_saved REAL DEFAULT 0.0
      );

      CREATE TABLE IF NOT EXISTS shard_index (
        session_id TEXT,
        shard_id INTEGER,
        keyword TEXT,
        weight REAL,
        PRIMARY KEY (session_id, shard_id, keyword),
        FOREIGN KEY(shard_id) REFERENCES shards(id)
      );

      CREATE INDEX IF NOT EXISTS idx_session_id ON shards(session_id);
      CREATE INDEX IF NOT EXISTS idx_shard_index ON shards(session_id, shard_index);
      CREATE INDEX IF NOT EXISTS idx_created_at ON shards(created_at);
    `);
  }

  /**
   * Create semantic embedding via Ollama (v0.7)
   * Falls back to hash-based if Ollama unavailable
   * @param {string} text
   * @returns {string} JSON embedding vector
   */
  async createEmbedding(text) {
    try {
      // Try Ollama embedding first (real semantic embeddings)
      const http = require('http');
      const payload = JSON.stringify({
        model: 'mistral:latest',
        input: text.slice(0, 1000) // Truncate for speed
      });

      const options = {
        hostname: '192.168.0.3',
        port: 11434,
        path: '/api/embed',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 5000
      };

      return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const result = JSON.parse(data);
              if (result.embeddings && result.embeddings[0]) {
                // Ollama returns embedding as array
                resolve(JSON.stringify(result.embeddings[0]));
              } else {
                reject(new Error('Invalid embedding response'));
              }
            } catch (e) {
              reject(e);
            }
          });
        });

        req.on('error', (err) => {
          // Fallback to hash-based
          console.warn('[GN-SHARDS] Ollama unavailable, using hash embeddings:', err.message);
          resolve(this._hashEmbedding(text));
        });

        req.on('timeout', () => {
          req.destroy();
          resolve(this._hashEmbedding(text));
        });

        req.write(payload);
        req.end();
      });
    } catch (e) {
      console.warn('[GN-SHARDS] Embedding error:', e.message);
      return this._hashEmbedding(text);
    }
  }

  /**
   * Fallback: hash-based pseudo-embedding (deterministic)
   * @param {string} text
   * @returns {string} JSON embedding vector
   */
  _hashEmbedding(text) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    
    // Convert hash to float vector (32-dim for consistency)
    const vector = [];
    for (let i = 0; i < 32; i++) {
      const byte = parseInt(hash.substring(i * 2, i * 2 + 2), 16);
      vector.push((byte - 128) / 128); // Normalize to [-1, 1]
    }
    return JSON.stringify(vector);
  }

  /**
   * Compute cosine similarity between two embeddings
   * @param {string} emb1 - JSON embedding
   * @param {string} emb2 - JSON embedding
   * @returns {number} Similarity score [0, 1]
   */
  cosineSimilarity(emb1, emb2) {
    try {
      const v1 = JSON.parse(emb1);
      const v2 = JSON.parse(emb2);
      
      let dotProduct = 0;
      let norm1 = 0;
      let norm2 = 0;

      for (let i = 0; i < v1.length; i++) {
        dotProduct += v1[i] * v2[i];
        norm1 += v1[i] * v1[i];
        norm2 += v2[i] * v2[i];
      }

      norm1 = Math.sqrt(norm1);
      norm2 = Math.sqrt(norm2);

      if (norm1 === 0 || norm2 === 0) return 0;
      return (dotProduct / (norm1 * norm2) + 1) / 2; // Scale to [0, 1]
    } catch (e) {
      return 0;
    }
  }

  /**
   * Detect optimal shard size based on compression ratio (adaptive sizing v0.7)
   * @param {string} content
   * @returns {number} Optimal shard size in bytes
   */
  _adaptiveShardSize(content) {
    // Quick gzip ratio check
    const zlib = require('zlib');
    const compressed = zlib.deflateSync(content);
    const ratio = compressed.length / Buffer.byteLength(content, 'utf8');

    // Adaptive sizing: high-density content → smaller shards
    if (ratio < 0.3) return 256;  // Highly compressible (code, configs)
    if (ratio < 0.5) return 512;  // Medium compressible (logs, structured)
    if (ratio < 0.8) return 1024; // Standard (normal text)
    return 2048; // Incompressible (binary, already compressed)
  }

  /**
   * Add context shards to session (v0.7: adaptive sizing)
   * @param {string} sessionId
   * @param {string} content - Full context text
   * @param {number} maxShardSize - Max bytes per shard (auto-detected if optimal)
   * @returns {Promise<object>}
   */
  async addShards(sessionId, content, maxShardSize = null) {
    // Auto-detect optimal shard size if not specified
    if (!maxShardSize) {
      maxShardSize = this._adaptiveShardSize(content);
      console.log(`[GN-SHARDS] Auto-detected shard size: ${maxShardSize}B`);
    }
    const startTime = Date.now();
    const shards = [];
    let index = 0;

    // Ensure session exists
    const stmt = this.db.prepare('INSERT OR IGNORE INTO sessions (session_id) VALUES (?)');
    stmt.run(sessionId);

    // Split content into shards
    const lines = content.split('\n');
    let currentShard = '';

    for (const line of lines) {
      if (Buffer.byteLength(currentShard + line, 'utf8') > maxShardSize && currentShard) {
        // Encode shard
        const encoded = await this.encoder.encode(currentShard);
        const embedding = await this.createEmbedding(currentShard);

        // Insert shard (or replace if exists)
        const insertStmt = this.db.prepare(`
          INSERT OR REPLACE INTO shards 
          (session_id, shard_index, content, compressed, compression_ratio, embedding, importance_score)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const shardId = insertStmt.run(
          sessionId,
          index,
          currentShard,
          encoded.compressed,
          encoded.metadata.compressedSize / encoded.metadata.originalSize,
          embedding,
          Math.random() // Start with random, will be refined
        ).lastInsertRowid;

        shards.push({
          id: shardId,
          index,
          originalSize: encoded.metadata.originalSize,
          compressedSize: encoded.metadata.compressedSize,
          ratio: encoded.ratio,
        });

        currentShard = '';
        index++;
      }
      currentShard += (currentShard ? '\n' : '') + line;
    }

    // Add final shard
    if (currentShard) {
      const encoded = await this.encoder.encode(currentShard);
      const embedding = await this.createEmbedding(currentShard);

      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO shards 
        (session_id, shard_index, content, compressed, compression_ratio, embedding, importance_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const shardId = insertStmt.run(
        sessionId,
        index,
        currentShard,
        encoded.compressed,
        encoded.metadata.compressedSize / encoded.metadata.originalSize,
        embedding,
        Math.random()
      ).lastInsertRowid;

      shards.push({
        id: shardId,
        index,
        originalSize: encoded.metadata.originalSize,
        compressedSize: encoded.metadata.compressedSize,
        ratio: encoded.ratio,
      });
    }

    // Update session stats
    const totalOriginal = shards.reduce((sum, s) => sum + s.originalSize, 0);
    const totalCompressed = shards.reduce((sum, s) => sum + s.compressedSize, 0);

    const updateStmt = this.db.prepare(`
      UPDATE sessions 
      SET total_shards = ?, total_tokens = ?, compressed_tokens = ?, cost_saved = ?
      WHERE session_id = ?
    `);

    const costPerToken = 3 / 1_000_000; // $3 per 1M input tokens (approximate)
    const costSaved = (totalOriginal - totalCompressed) * costPerToken;

    updateStmt.run(
      shards.length,
      Math.ceil(totalOriginal / 4), // Rough token estimate
      Math.ceil(totalCompressed / 4),
      costSaved,
      sessionId
    );

    return {
      sessionId,
      shardCount: shards.length,
      shards,
      originalSize: totalOriginal,
      compressedSize: totalCompressed,
      ratio: (totalCompressed / totalOriginal).toFixed(3),
      costSaved: costSaved.toFixed(6),
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Retrieve relevant shards by semantic similarity
   * @param {string} sessionId
   * @param {string} query - Query text
   * @param {number} topK - Number of shards to retrieve
   * @returns {Promise<Array>}
   */
  async getRelevantShards(sessionId, query, topK = 5) {
    try {
      const queryEmbedding = await this.createEmbedding(query);
      
      const stmt = this.db.prepare(`
        SELECT id, shard_index, content, importance_score, query_count
        FROM shards
        WHERE session_id = ?
        ORDER BY shard_index
      `);

      const allShards = stmt.all(sessionId);
      if (allShards.length === 0) return [];

      // Score each shard
      const scored = allShards.map(shard => {
        const similarity = this.cosineSimilarity(queryEmbedding, shard.embedding || '[]');
        const recencyBoost = 1 - (Date.now() - new Date(shard.last_queried).getTime()) / (30 * 24 * 60 * 60 * 1000); // 30 days
        const frequencyBoost = Math.min(shard.query_count / 10, 1);
        
        const score = (similarity * 0.6) + (shard.importance_score * 0.2) + (recencyBoost * 0.1) + (frequencyBoost * 0.1);
        
        return { ...shard, score };
      });

      // Sort by score and take top-k
      const results = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      // Update query counters
      results.forEach(r => {
        const update = this.db.prepare('UPDATE shards SET query_count = query_count + 1, last_queried = CURRENT_TIMESTAMP WHERE id = ?');
        update.run(r.id);
      });

      return results;
    } catch (e) {
      console.error('[GN-SHARDS] error retrieving:', e.message);
      return [];
    }
  }

  /**
   * Get session statistics
   * @param {string} sessionId
   * @returns {object}
   */
  getSessionStats(sessionId) {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE session_id = ?');
    return stmt.get(sessionId) || null;
  }

  /**
   * Clear old sessions (older than days)
   * @param {number} days
   */
  clearOldSessions(days = 7) {
    const stmt = this.db.prepare(`
      DELETE FROM shards 
      WHERE session_id IN (
        SELECT session_id FROM sessions 
        WHERE created_at < datetime('now', '-${days} days')
      )
    `);
    stmt.run();

    const delStmt = this.db.prepare(`
      DELETE FROM sessions 
      WHERE created_at < datetime('now', '-${days} days')
    `);
    return delStmt.run();
  }

  close() {
    this.db.close();
  }
}

module.exports = GNSemanticShards;
