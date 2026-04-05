# GN / GNI Benchmark Results

## Validated Results (April 2026)

### GNI v1.0 — JavaScript Reference Implementation

Codec: `gn-lz4-v2-complete.js`
Corpora: ShareGPT 1k, Ubuntu IRC 1k, MEMORY.md
Batch size: 100 messages

| Corpus | Raw | GNI v1.0 | gzip | vs gzip | Lossless |
|--------|-----|----------|------|---------|----------|
| MEMORY.md | 13.6 KB | 2.224x | 2.221x | +0.1% | 100% |
| ShareGPT-1k | 818 KB | 4.056x | 4.192x | -3.2% | 100% |
| Ubuntu-IRC-1k | 126 KB | 3.436x | 3.838x | -10.5% | 100% |

All measurements independently verified. v2 codec disqualified (6-56% message loss).

---

### glasik-core — Rust Implementation

Codec: `glasik-core v0.1.0` (Rust + PyO3)
Features: rolling hash dictionary, two-pass tokenizer, sliding window,
          adaptive batch sizing, tokenizer bypass on high-entropy input

| Corpus | Raw | glasik-core | gzip | vs gzip | Lossless |
|--------|-----|------------|------|---------|----------|
| MEMORY.md | 12.1 KB | 1.857x | 2.078x | -10.6% | 100% |
| ShareGPT-1k | 740 KB | 3.752x | 3.945x | -4.9% | 100% |
| Ubuntu-IRC-1k | 56.5 KB | 2.109x | 2.357x | -10.5% | 100% |

Adaptive batch sizes: ShareGPT=100, Ubuntu IRC=500.

---

### GN v0.4 — Semantic Compression (Historical)

The 26.3x figure cited in earlier documentation has not been
independently re-verified in the current codebase. Re-verification
is in progress. This figure will be updated when confirmed.

---

### Architectural Analysis

**Why GNI matches gzip on natural language:**
Deflate's LZ77 uses a 32KB sliding window and catches common n-gram
patterns natively. On single-session diverse natural language, GNI's
codon table adds overhead without proportional savings. GNI detects
this and bypasses tokenization, passing raw bytes directly to deflate.

**Why GNI targets domain-specific streams:**
GNI's sliding window tokenizer accumulates domain vocabulary across
batches beyond deflate's 32KB window limit. On agent context streams
and repeated LLM patterns, the codon table compresses before deflate,
giving deflate lower-entropy input. gzip resets per stream. GNI
accumulates.

---

### Honest Limitations

- General natural language: 5-11% below gzip on single-session batches
- Tokenizer bypass activates on high-entropy batches
- Sliding window advantage requires stream continuity
- 26.3x historical claim pending re-verification
- Phase C (semantic deduplication) and Phase D (entropy normalization) pending

### Test Infrastructure

- 52 Rust tests passing, 37 JS tests passing
- Losslessness verified: exact payload match on all recovered messages
- Corpora: ShareGPT 94K subset, Ubuntu Dialogue Corpus, MEMORY.md

*Last updated: April 2026*
*Repo: github.com/atomsrkuul/glasik-notation*
*Rust core: github.com/atomsrkuul/glasik-core*
