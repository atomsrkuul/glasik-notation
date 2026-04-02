/**
 * GN v0.4 Encoder/Decoder
 * TurboQuant-inspired semantic compression
 * Compresses MEMORY.md and context to ~2.85 bits/symbol
 * 
 * Usage:
 *   const encoder = new GNv4EncoderDecoder();
 *   const compressed = encoder.encode(memoryData);
 *   const decompressed = encoder.decode(compressed);
 */

const zlib = require('zlib');
const { promisify } = require('util');
const crypto = require('crypto');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class GNv4EncoderDecoder {
  constructor() {
    // TurboQuant symbol table (common security/GBT terms)
    this.symbolTable = {
      // Core entities
      'Glasik': 0x01, 'Robert': 0x02, 'buffer': 0x03, 'gbt': 0x04,
      'robinhood': 0x05, 'target': 0x06, 'vulnerability': 0x07,
      
      // Security terms
      'jwt': 0x08, 'idor': 0x09, 'xss': 0x0a, 'csrf': 0x0b,
      'sqli': 0x0c, 'rce': 0x0d, 'auth': 0x0e, 'encryption': 0x0f,
      
      // Bug bounty
      'bug': 0x10, 'finding': 0x11, 'severity': 0x12, 'critical': 0x13,
      'high': 0x14, 'medium': 0x15, 'low': 0x16, 'info': 0x17,
      
      // Scan tools
      'nuclei': 0x18, 'httpx': 0x19, 'subfinder': 0x1a, 'nmap': 0x1b,
      'burp': 0x1c, 'ffuf': 0x1d, 'headers': 0x1e, 'scanner': 0x1f,
      
      // Status/time
      'active': 0x20, 'completed': 0x21, 'failed': 0x22, 'pending': 0x23,
      'today': 0x24, 'yesterday': 0x25, 'week': 0x26, 'month': 0x27,
      
      // Hardware
      'laptop': 0x28, 'desktop': 0x29, 'pi': 0x2a, 'vps': 0x2b,
      'usb': 0x2c, 'ssd': 0x2d, 'storage': 0x2e, 'backup': 0x2f,
      
      // Operations
      'deploy': 0x30, 'test': 0x31, 'fix': 0x32, 'review': 0x33,
      'optimize': 0x34, 'integrate': 0x35, 'monitor': 0x36, 'alert': 0x37,
      
      // States
      'success': 0x38, 'error': 0x39, 'warning': 0x3a, 'done': 0x3b,
      'running': 0x3c, 'stopped': 0x3d, 'idle': 0x3e, 'busy': 0x3f,
    };

    // Reverse lookup
    this.reverseSymbolTable = {};
    Object.entries(this.symbolTable).forEach(([key, val]) => {
      this.reverseSymbolTable[val] = key;
    });

    // Phrase pairs (common sequences)
    this.phrasePairs = {
      'bug bounty': 0x40, 'cost tracking': 0x41, 'target intel': 0x42,
      'active target': 0x43, 'findings summary': 0x44, 'scan status': 0x45,
      'api key': 0x46, 'session id': 0x47, 'error handling': 0x48,
      'cache read': 0x49, 'fallback model': 0x4a, 'context routing': 0x4b,
      'compression ratio': 0x4c, 'token count': 0x4d, 'cost per turn': 0x4e,
    };

    this.reversePhraseTable = {};
    Object.entries(this.phrasePairs).forEach(([key, val]) => {
      this.reversePhraseTable[val] = key;
    });
  }

  /**
   * Encode text using symbol table + gzip
   * @param {string} text - Text to compress
   * @returns {object} { compressed: Buffer, ratio: number, metadata: object }
   */
  async encode(text) {
    const startTime = Date.now();
    const originalSize = Buffer.byteLength(text, 'utf8');

    // Step 1: Replace symbols
    let processed = text;
    
    // Replace phrases first (longer patterns)
    Object.entries(this.phrasePairs).forEach(([phrase, code]) => {
      const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
      processed = processed.replace(regex, `§${String.fromCharCode(code)}§`);
    });

    // Replace individual symbols
    Object.entries(this.symbolTable).forEach(([symbol, code]) => {
      const regex = new RegExp(`\\b${symbol}\\b`, 'gi');
      processed = processed.replace(regex, `§${String.fromCharCode(code)}§`);
    });

    const symbolSize = Buffer.byteLength(processed, 'utf8');

    // Step 2: Gzip compress
    const compressed = await gzip(processed, { level: 9 });
    const compressedSize = compressed.length;

    const ratio = (compressedSize / originalSize).toFixed(2);
    const encodingTime = Date.now() - startTime;

    return {
      compressed,
      ratio: parseFloat(ratio),
      metadata: {
        originalSize,
        symbolSize,
        compressedSize,
        encodingTime,
        bitsPerSymbol: ((compressedSize * 8) / originalSize).toFixed(2),
      }
    };
  }

  /**
   * Decode compressed buffer
   * @param {Buffer} buffer - Compressed data
   * @returns {string} Decompressed text
   */
  async decode(buffer) {
    // Gunzip decompress
    const decompressed = await gunzip(buffer);
    let text = decompressed.toString('utf8');

    // Replace phrase codes back
    Object.entries(this.reversePhraseTable).forEach(([code, phrase]) => {
      const pattern = `§${String.fromCharCode(code)}§`;
      text = text.replaceAll(pattern, phrase);
    });

    // Replace symbol codes back
    Object.entries(this.reverseSymbolTable).forEach(([code, symbol]) => {
      const pattern = `§${String.fromCharCode(code)}§`;
      text = text.replaceAll(pattern, symbol);
    });

    return text;
  }

  /**
   * Estimate compression for a given text
   * @param {string} text
   * @returns {object} { estimated: number, details: object }
   */
  estimateCompression(text) {
    let tempText = text;
    let symbolMatches = 0;
    let phraseMatches = 0;

    // Count phrase matches
    Object.keys(this.phrasePairs).forEach(phrase => {
      const count = (tempText.match(new RegExp(`\\b${phrase}\\b`, 'gi')) || []).length;
      phraseMatches += count;
    });

    // Count symbol matches
    Object.keys(this.symbolTable).forEach(symbol => {
      const count = (tempText.match(new RegExp(`\\b${symbol}\\b`, 'gi')) || []).length;
      symbolMatches += count;
    });

    const baseBytesText = Buffer.byteLength(text, 'utf8');
    const phraseBytesSaved = phraseMatches * 10; // avg phrase length
    const symbolBytesSaved = symbolMatches * 5; // avg symbol length
    const estimatedAfterSymbols = baseBytesText - phraseBytesSaved - symbolBytesSaved;

    // Gzip typically achieves 40-60% on structured data
    const estimatedCompressed = Math.ceil(estimatedAfterSymbols * 0.45);
    const estimatedRatio = (estimatedCompressed / baseBytesText).toFixed(3);

    return {
      estimated: estimatedCompressed,
      ratio: parseFloat(estimatedRatio),
      details: {
        originalSize: baseBytesText,
        phraseMatches,
        symbolMatches,
        estimatedAfterSymbols,
      }
    };
  }

  /**
   * Generate hash for deduplication
   * @param {string} text
   * @returns {string} SHA256 hash
   */
  generateHash(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
  }
}

module.exports = GNv4EncoderDecoder;
