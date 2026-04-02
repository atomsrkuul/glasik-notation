/**
 * GN Adaptive Compression Engine (ACE)
 * Catalytic core that learns from each shard
 * Auto-tunes compression parameters based on observed data
 */

const zlib = require('zlib');
const crypto = require('crypto');

class GNAdaptiveCompressionEngine {
  constructor(db = null) {
    this.db = db; // Optional DB for persistence
    
    // Compression state — learns and evolves
    this.state = {
      // Symbol frequency maps (learned)
      symbolFreq: new Map(),
      phraseFreq: new Map(),
      
      // Compression parameters (adaptive)
      zlibLevel: 6, // 1-9, adjust based on effectiveness
      symbolThreshold: 3, // min frequency to add to symbol table
      phraseMinLength: 4, // minimum phrase to extract
      
      // Learning metrics
      totalProcessed: 0,
      avgRatio: 1.0,
      ratioHistory: [],
      
      // Feedback loop
      lastShard: null,
      compressionGain: 0,
      
      // Catalytic modifications
      catalystStrength: 0.5, // how much each shard influences next
      learningRate: 0.1
    };

    this.initSymbolTable();
  }

  /**
   * Initialize with common symbols
   */
  initSymbolTable() {
    const commonSymbols = [
      'the', 'and', 'to', 'of', 'in', 'is', 'a', 'for', 'that', 'with',
      'session', 'shard', 'context', 'relevance', 'compression', 'query',
      'importance', 'transition', 'critical', 'phase', 'drift'
    ];
    
    commonSymbols.forEach((sym, idx) => {
      this.state.symbolFreq.set(sym, 100 + idx);
    });
  }

  /**
   * Core compression with learning
   * Analyzes shard, compresses, learns patterns
   */
  compress(content, metadata = {}) {
    const startTime = Date.now();
    const originalSize = Buffer.byteLength(content, 'utf8');

    // Learn from content before compression
    this.learn(content, metadata);

    // Extract adaptive symbol table
    const symbolTable = this.buildSymbolTable(content);

    // Apply symbol substitution
    let encoded = this.encodeSymbols(content, symbolTable);

    // Extract and substitute phrases
    const phraseTable = this.extractPhrases(encoded);
    encoded = this.encodePhrases(encoded, phraseTable);

    // Apply zlib with adaptive level
    const compressed = zlib.deflateSync(encoded, {
      level: this.state.zlibLevel
    });

    // Calculate metrics
    const compressedSize = compressed.length;
    const ratio = compressedSize / originalSize;
    const gain = 1 - ratio;

    // Update state based on compression success
    this.updateState(ratio, gain, originalSize);

    // Prepare metadata
    const meta = {
      originalSize,
      compressedSize,
      ratio: ratio.toFixed(4),
      gain: (gain * 100).toFixed(1),
      symbolTableSize: symbolTable.size,
      phraseTableSize: phraseTable.size,
      zlibLevel: this.state.zlibLevel,
      catalystStrength: this.state.catalystStrength,
      processingTime: Date.now() - startTime
    };

    return {
      compressed,
      symbolTable,
      phraseTable,
      metadata: meta
    };
  }

  /**
   * Learn patterns from this shard
   * Update frequency maps, detect patterns
   */
  learn(content, metadata) {
    // Extract words
    const words = content.toLowerCase().match(/\b\w+\b/g) || [];
    
    // Update symbol frequency
    words.forEach(word => {
      if (word.length >= 3) {
        const freq = this.state.symbolFreq.get(word) || 0;
        this.state.symbolFreq.set(word, freq + 1);
      }
    });

    // Extract n-grams (phrase candidates)
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = words.slice(i, i + 2).join(' ');
      if (phrase.length >= this.state.phraseMinLength) {
        const freq = this.state.phraseFreq.get(phrase) || 0;
        this.state.phraseFreq.set(phrase, freq + 1);
      }
    }

    // Metadata-driven learning
    if (metadata.importance) {
      // High-importance shards teach more aggressively
      this.state.catalystStrength = Math.min(1, 0.5 + metadata.importance * 0.5);
    }

    this.state.lastShard = {
      size: Buffer.byteLength(content, 'utf8'),
      wordCount: words.length,
      metadata
    };
  }

  /**
   * Build adaptive symbol table
   * Only include symbols that exceed frequency threshold
   */
  buildSymbolTable(content) {
    const table = new Map();
    let symbolId = 0;

    // Sort by frequency (most frequent first)
    const sorted = Array.from(this.state.symbolFreq.entries())
      .filter(([sym, freq]) => freq >= this.state.symbolThreshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 256); // Max 256 symbols

    sorted.forEach(([symbol, freq]) => {
      table.set(symbol, {
        id: symbolId,
        frequency: freq,
        savings: symbol.length * freq // bytes saved by this substitution
      });
      symbolId++;
    });

    return table;
  }

  /**
   * Encode symbols (substitute high-frequency words)
   */
  encodeSymbols(content, symbolTable) {
    let encoded = content;

    // Sort by length desc to avoid partial replacements
    const symbols = Array.from(symbolTable.keys())
      .sort((a, b) => b.length - a.length);

    symbols.forEach(symbol => {
      const id = symbolTable.get(symbol).id;
      const token = `§${id}§`; // Use rare character as delimiter
      const regex = new RegExp(`\\b${symbol}\\b`, 'gi');
      encoded = encoded.replace(regex, token);
    });

    return encoded;
  }

  /**
   * Extract high-value phrases
   */
  extractPhrases(content) {
    const phrases = new Map();
    let phraseId = 0;

    const sorted = Array.from(this.state.phraseFreq.entries())
      .filter(([phrase, freq]) => freq >= 2) // Appear at least 2x
      .sort((a, b) => (b[1] * b[0].length) - (a[1] * a[0].length)) // savings = freq * length
      .slice(0, 128); // Max 128 phrases

    sorted.forEach(([phrase, freq]) => {
      phrases.set(phrase, {
        id: phraseId,
        frequency: freq,
        savings: phrase.length * freq
      });
      phraseId++;
    });

    return phrases;
  }

  /**
   * Encode phrases
   */
  encodePhrases(content, phraseTable) {
    let encoded = content;

    const phrases = Array.from(phraseTable.keys())
      .sort((a, b) => b.length - a.length);

    phrases.forEach(phrase => {
      const id = phraseTable.get(phrase).id;
      const token = `¶${id}¶`;
      encoded = encoded.replaceAll(phrase, token);
    });

    return encoded;
  }

  /**
   * Update compression state based on results
   */
  updateState(ratio, gain, size) {
    // Track compression effectiveness
    this.state.ratioHistory.push(ratio);
    if (this.state.ratioHistory.length > 100) {
      this.state.ratioHistory.shift();
    }

    this.state.avgRatio = this.state.ratioHistory.reduce((a, b) => a + b, 0) / 
                          this.state.ratioHistory.length;

    // Adaptive zlib level tuning
    if (gain > 0.6) {
      // Very effective compression, can be more aggressive
      this.state.zlibLevel = Math.min(9, this.state.zlibLevel + 0.5);
    } else if (gain < 0.3) {
      // Poor compression, reduce zlib overhead
      this.state.zlibLevel = Math.max(1, this.state.zlibLevel - 0.5);
    }

    // Learn from compression effectiveness
    if (gain > this.state.compressionGain) {
      this.state.compressionGain = gain;
      // Increase symbol threshold for next iteration
      this.state.symbolThreshold *= (1 - this.state.learningRate);
    }

    this.state.totalProcessed++;
  }

  /**
   * Get current compression stats
   */
  getStats() {
    return {
      totalProcessed: this.state.totalProcessed,
      avgCompressionRatio: this.state.avgRatio.toFixed(3),
      currentZlibLevel: Math.round(this.state.zlibLevel),
      symbolTableSize: this.state.symbolFreq.size,
      phraseTableSize: this.state.phraseFreq.size,
      catalystStrength: this.state.catalystStrength.toFixed(2),
      recentGain: (this.state.compressionGain * 100).toFixed(1) + '%'
    };
  }

  /**
   * Reset learning (for new context window)
   */
  reset() {
    this.state.symbolFreq.clear();
    this.state.phraseFreq.clear();
    this.state.ratioHistory = [];
    this.state.avgRatio = 1.0;
    this.state.zlibLevel = 6;
    this.initSymbolTable();
  }
}

module.exports = GNAdaptiveCompressionEngine;
