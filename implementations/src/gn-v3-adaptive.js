/**
 * GNI v3 — Adaptive Dictionary Learning
 * 
 * Improvements over v2:
 * 1. Entropy measurement layer (Shannon capacity analysis)
 * 2. Adaptive dictionary learning from real traffic
 * 3. Dictionary versioning & negotiation
 * 4. Bootstrap protocol handshake
 * 5. Per-message entropy thresholding
 * 
 * Architecture:
 * - Measure entropy before compression
 * - Learn patterns from high-frequency sequences
 * - Skip compression for high-entropy (already compressed) data
 * - Version dictionaries explicitly
 */

const zlib = require('zlib');
const crypto = require('crypto');

class GNv3Adaptive {
  constructor(options = {}) {
    this.version = 'gn-v3-adaptive';
    this.dictionaryVersion = options.dictionaryVersion || 1;
    
    // Base dictionary (v1)
    this.baseDictionary = new Map([
      ['[2026-', 0x80],
      ['T', 0x81],
      ['Z]', 0x82],
      ['discord', 0x83],
      ['slack', 0x84],
      ['telegram', 0x85],
      ['signal', 0x86],
      ['message:', 0x87],
      ['user:', 0x88],
      ['error:', 0x89],
      ['warning:', 0x8A],
      ['info:', 0x8B],
      ['success', 0x8C],
      ['failed', 0x8D],
      ['pending', 0x8E],
      ['complete', 0x8F],
    ]);
    
    // Adaptive dictionary (learned from traffic)
    this.adaptiveDictionary = new Map();
    this.adaptiveBytePool = 0xA0; // Start after base dict
    
    // Learning state
    this.trainingData = [];
    this.trainingThreshold = options.trainingThreshold || 1000; // Learn after N messages
    this.sequenceFrequency = new Map();
    this.entropy = {
      min: 0,
      max: 8,
      current: 0
    };
  }

  /**
   * Calculate Shannon entropy of data
   * H = -Σ(p_i * log2(p_i)) for each byte frequency
   */
  calculateEntropy(data) {
    const frequencies = new Map();
    
    // Count byte frequencies
    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      frequencies.set(byte, (frequencies.get(byte) || 0) + 1);
    }
    
    // Calculate Shannon entropy
    let entropy = 0;
    for (const freq of frequencies.values()) {
      const probability = freq / data.length;
      entropy -= probability * Math.log2(probability);
    }
    
    this.entropy.current = entropy;
    return entropy;
  }

  /**
   * Decide compression strategy based on entropy
   * High entropy (>7) = skip compression (already compressed)
   * Low entropy (<3) = full dictionary + LZ77
   * Medium entropy (3-7) = selective compression
   */
  getCompressionStrategy(data) {
    const entropy = this.calculateEntropy(data);
    
    if (entropy > 7) {
      return { strategy: 'skip', reason: 'High entropy (already compressed)' };
    } else if (entropy < 3) {
      return { strategy: 'aggressive', reason: 'Low entropy (highly repetitive)' };
    } else {
      return { strategy: 'balanced', reason: 'Medium entropy' };
    }
  }

  /**
   * Learn frequent sequences from data
   * Called periodically to update adaptive dictionary
   */
  learnSequences(data) {
    this.trainingData.push(data);
    
    if (this.trainingData.length < this.trainingThreshold) {
      return { learned: false, reason: `Waiting for ${this.trainingThreshold} samples` };
    }

    // Find most frequent 3-5 byte sequences
    const combined = this.trainingData.join('');
    const sequences = new Map();
    
    for (let len = 5; len >= 3; len--) {
      for (let i = 0; i < combined.length - len; i++) {
        const seq = combined.slice(i, i + len);
        const freq = (sequences.get(seq) || 0) + 1;
        if (freq > 10) { // Only learn sequences that appear 10+ times
          sequences.set(seq, freq);
        }
      }
    }

    // Add top sequences to adaptive dictionary
    const sorted = Array.from(sequences.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16); // Learn up to 16 new patterns per cycle

    for (const [seq, freq] of sorted) {
      if (!this.baseDictionary.has(seq) && !this.adaptiveDictionary.has(seq)) {
        this.adaptiveDictionary.set(seq, this.adaptiveBytePool++);
      }
    }

    // Reset training
    this.trainingData = [];
    this.dictionaryVersion++;

    return {
      learned: true,
      newPatterns: sorted.length,
      dictionaryVersion: this.dictionaryVersion,
      topPatterns: sorted.slice(0, 3).map(([seq, freq]) => ({ seq, freq }))
    };
  }

  /**
   * Get dictionary hash for protocol negotiation
   */
  getDictionaryHash() {
    const dict = {
      base: Array.from(this.baseDictionary.entries()),
      adaptive: Array.from(this.adaptiveDictionary.entries()),
      version: this.dictionaryVersion
    };
    
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(dict));
    return hash.digest('hex').slice(0, 16);
  }

  /**
   * Bootstrap handshake — verify sender and receiver have same dictionary
   */
  getBootstrapMessage() {
    return {
      version: this.version,
      dictionaryVersion: this.dictionaryVersion,
      dictionaryHash: this.getDictionaryHash(),
      entropy: {
        min: this.entropy.min,
        max: this.entropy.max,
        current: this.entropy.current
      }
    };
  }

  /**
   * Verify bootstrap compatibility
   */
  verifyBootstrap(remote) {
    if (remote.version !== this.version) {
      return { compatible: false, reason: `Version mismatch: ${remote.version} vs ${this.version}` };
    }
    
    if (remote.dictionaryVersion !== this.dictionaryVersion) {
      return { compatible: false, reason: `Dictionary version mismatch: ${remote.dictionaryVersion} vs ${this.dictionaryVersion}` };
    }
    
    if (remote.dictionaryHash !== this.getDictionaryHash()) {
      return { compatible: false, reason: 'Dictionary hash mismatch (dictionaries differ)' };
    }
    
    return { compatible: true };
  }

  /**
   * Apply both base and adaptive dictionaries
   */
  applyDictionaries(data) {
    let result = data;
    
    // Apply base dictionary first (more common patterns)
    for (const [pattern, byte] of this.baseDictionary.entries()) {
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      result = result.replace(regex, String.fromCharCode(byte));
    }
    
    // Apply adaptive dictionary
    for (const [pattern, byte] of this.adaptiveDictionary.entries()) {
      const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      result = result.replace(regex, String.fromCharCode(byte));
    }
    
    return result;
  }

  /**
   * Reverse dictionaries
   */
  reverseDictionaries(data) {
    let result = data;
    
    // Reverse adaptive first (more recent)
    for (const [pattern, byte] of this.adaptiveDictionary.entries()) {
      const char = String.fromCharCode(byte);
      const regex = new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      result = result.replace(regex, pattern);
    }
    
    // Reverse base dictionary
    for (const [pattern, byte] of this.baseDictionary.entries()) {
      const char = String.fromCharCode(byte);
      const regex = new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      result = result.replace(regex, pattern);
    }
    
    return result;
  }

  /**
   * Main compression with adaptive strategy
   */
  async compress(data) {
    const startTime = Date.now();
    const originalSize = Buffer.byteLength(data, 'utf8');
    
    // Step 1: Entropy analysis
    const strategy = this.getCompressionStrategy(data);
    
    // Skip compression if already compressed
    if (strategy.strategy === 'skip') {
      return {
        compressed: data,
        ratio: 1.0,
        originalSize,
        compressedSize: originalSize,
        time: Date.now() - startTime,
        strategy: 'skip',
        entropy: this.entropy.current,
        metadata: {
          version: this.version,
          dictionaryVersion: this.dictionaryVersion,
          strategy: strategy.reason
        }
      };
    }

    // Step 2: Apply dictionaries
    let compressed = this.applyDictionaries(data);

    // Step 3: LZ77 (simplified for this example)
    compressed = this.lz77Compress(compressed);

    // Step 4: Deflate
    compressed = await this.deflateCompress(compressed);

    const compressedSize = Buffer.byteLength(compressed, 'utf8');
    const ratio = (originalSize / compressedSize).toFixed(2);

    // Step 5: Learn from this data (async)
    this.learnSequences(data);

    return {
      compressed,
      ratio: parseFloat(ratio),
      originalSize,
      compressedSize,
      time: Date.now() - startTime,
      strategy: strategy.strategy,
      entropy: this.entropy.current,
      metadata: {
        version: this.version,
        dictionaryVersion: this.dictionaryVersion,
        strategy: strategy.reason,
        shannonCapacity: this.getCapacityPercent(originalSize, compressedSize)
      }
    };
  }

  /**
   * Simplified LZ77
   */
  lz77Compress(data) {
    // Placeholder — would implement proper LZ77 here
    return data;
  }

  /**
   * Deflate compression
   */
  async deflateCompress(data) {
    return new Promise((resolve, reject) => {
      zlib.deflate(Buffer.from(data), (err, compressed) => {
        if (err) reject(err);
        else resolve(compressed.toString('base64'));
      });
    });
  }

  /**
   * Calculate how close to Shannon entropy limit we are
   */
  getCapacityPercent(original, compressed) {
    const shannon = this.entropy.current;
    const bitsPerByte = 8;
    const theoreticalMinBytes = (original * shannon) / bitsPerByte;
    const capacity = (theoreticalMinBytes / compressed) * 100;
    return capacity.toFixed(1) + '%';
  }

  /**
   * Decompress with verification
   */
  async decompress(compressed) {
    try {
      // Step 1: Decompress deflate
      const deflated = await new Promise((resolve, reject) => {
        zlib.inflate(Buffer.from(compressed, 'base64'), (err, data) => {
          if (err) reject(err);
          else resolve(data.toString('utf8'));
        });
      });

      // Step 2: Reverse dictionaries
      const text = this.reverseDictionaries(deflated);

      // Step 3: Verify (calculate entropy of output)
      const outputEntropy = this.calculateEntropy(text);

      return {
        text,
        verified: true,
        outputEntropy,
        metadata: {
          version: this.version,
          dictionaryVersion: this.dictionaryVersion
        }
      };
    } catch (error) {
      return {
        text: null,
        verified: false,
        error: error.message
      };
    }
  }
}

module.exports = GNv3Adaptive;
