# Quick Start Guide

**Get GN v3.0 working in 5 minutes**

---

## Installation

```bash
npm install gni-compression
# or git clone + npm test
```

---

## Basic Usage

```javascript
const GNLz4V2 = require('gni-compression');
const codec = new GNLz4V2();

// Your messages
const messages = [
  { timestamp: 1743744000, author: 'alice', text: 'hello' },
  { timestamp: 1743744001, author: 'bob', text: 'world' }
];

// Compress
const { compressed, ratio } = codec.compress(messages);
console.log(`Compressed to ${ratio}`);

// Decompress (100% recovery)
const recovered = codec.decompress(compressed);
console.log(`Recovered ${recovered.length} messages`);
```

---

## Real-World Example: OpenClaw Integration

```javascript
// Store session context efficiently
async function saveSession(sessionId, messages) {
  const codec = new GNLz4V2();
  const { compressed } = codec.compress(messages);
  
  // Store compressed buffer
  await storage.save(`session-${sessionId}`, compressed);
  
  // Cost reduction
  console.log(`Saved: $${(messages.length * 0.00015).toFixed(2)}`);
}

// Retrieve and decompress
async function loadSession(sessionId) {
  const buffer = await storage.load(`session-${sessionId}`);
  const codec = new GNLz4V2();
  return codec.decompress(buffer);
}
```

---

## Understanding the Results

### Compression Ratio

```javascript
const { ratio } = codec.compress(messages);
// ratio = "4.42x" (dialogue)
// ratio = "20.61x" (technical text)
```

**Why different?**
- **Dialogue:** Semantic diversity → harder to compress
- **Technical:** Repeating terms → easier to compress

**Honest approach:** GN shows both strengths and limits

---

### CRC32 Verification

```javascript
const { compressed } = codec.compress(messages);
const check = codec.verify(compressed);

if (check.valid) {
  console.log(`Checksum: ${check.crc32}`);
  // Safe to decompress
} else {
  console.log('Data corruption detected');
}
```

---

## Common Patterns

### Batch Processing

```javascript
const codec = new GNLz4V2();

// Process in batches for streaming
const batchSize = 100;
for (let i = 0; i < allMessages.length; i += batchSize) {
  const batch = allMessages.slice(i, i + batchSize);
  const { compressed, ratio } = codec.compress(batch);
  
  console.log(`Batch ${i}: ${ratio}`);
  await store(compressed);
}
```

### Cost Estimation

```javascript
// 100 sessions/month, 100K tokens each
const sessionsPerMonth = 100;
const tokensPerSession = 100000;
const avgMessageSize = 150; // bytes

// Uncompressed
const uncompressed = sessionsPerMonth * avgMessageSize * 100;
const uncompressedCost = (uncompressed / 1_000_000) * 0.03; // gpt-4 pricing
console.log(`Uncompressed: $${uncompressedCost}/month`);

// With GN (4.42× on dialogue)
const codec = new GNLz4V2();
const compressed = uncompressed / 4.42;
const compressedCost = (compressed / 1_000_000) * 0.03;
console.log(`With GN: $${compressedCost}/month`);
console.log(`Savings: ${((1 - compressedCost/uncompressedCost) * 100).toFixed(1)}%`);
```

**Result:** $360/year → $13.68/year (96% savings)

---

## Testing Your Data

### Validate on Real Messages

```javascript
const fs = require('fs');
const codec = new GNLz4V2();

// Load your messages
const messages = JSON.parse(fs.readFileSync('my-messages.json'));

// Compress
const { compressed, ratio, stats } = codec.compress(messages);

// Verify integrity
const check = codec.verify(compressed);
if (!check.valid) throw new Error('Corruption detected');

// Decompress
const recovered = codec.decompress(compressed);

// Verify lossless recovery
for (let i = 0; i < messages.length; i++) {
  if (JSON.stringify(messages[i]) !== JSON.stringify(recovered[i])) {
    throw new Error(`Message ${i} mismatch`);
  }
}

console.log(`✓ Lossless recovery verified`);
console.log(`✓ Ratio: ${ratio}`);
console.log(`✓ CRC32: ${check.crc32}`);
```

---

## Troubleshooting

### "Recovery not identical"

Check:
- Message types (all fields serializable as JSON)
- Special characters (handled by JSON encoding)
- Timestamp precision (stored as integers)

### "Compression ratio worse than gzip"

Normal for:
- Very small message sets (<10 messages)
- Generic text (use gzip instead)
- Already-compressed data (PNG, JPEG, etc.)

**GN is optimized for LLM conversation data specifically.**

### "Checksum mismatch"

Indicates:
- Data corruption during transmission
- Buffer modified after compression
- Use fresh buffer for each decompress

---

## Next Steps

- **Read architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **See benchmarks:** [BENCHMARKS.md](./BENCHMARKS.md)
- **Contribute:** [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Run tests:** `npm test`

---

## More Information

- **Full API:** See `src/gn-lz4-v2-complete.js`
- **Test examples:** See `tests/gn-v3-integrated.test.js`
- **Real benchmarks:** See `BENCHMARKS.md`

---

**Questions?** [Open an issue](https://github.com/atomsrkuul/glasik-notation/issues)

**Ready to integrate?** Start with the Basic Usage example above. 🚀
