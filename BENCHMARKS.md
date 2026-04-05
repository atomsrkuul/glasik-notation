# GN / GNI Benchmark Results

## Validated Results (April 2026)

### GNI v1.0 — JavaScript Reference Implementation

Codec: gn-lz4-v2-complete.js
Corpora: ShareGPT 1k, Ubuntu IRC 1k, MEMORY.md
Batch size: 100 messages

| Corpus | Raw | GNI v1.0 | gzip | vs gzip | Lossless |
|--------|-----|----------|------|---------|----------|
| MEMORY.md | 13.6 KB | 2.224x | 2.221x | +0.1% | 100% |
| ShareGPT-1k | 818 KB | 4.056x | 4.192x | -3.2% | 100% |
| Ubuntu-IRC-1k | 126 KB | 3.436x | 3.838x | -10.5% | 100% |

v2 codec disqualified (6-56% message loss). All others 100% lossless.

---

### glasik-core v0.1.0 -- Rust Implementation

Codec: glasik-core (Rust + PyO3)
Features: rolling hash dictionary, two-pass tokenizer, sliding window,
adaptive batch sizing, tokenizer bypass on high-entropy input

| Corpus | Raw | glasik-core | gzip | vs gzip | Lossless |
|--------|-----|------------|------|---------|----------|
| MEMORY.md | 12.1 KB | 1.857x | 2.078x | -10.6% | 100% |
| ShareGPT-1k | 740 KB | 3.752x | 3.945x | -4.9% | 100% |
| Ubuntu-IRC-1k | 56.5 KB | 2.109x | 2.357x | -10.5% | 100% |

Adaptive batch: ShareGPT=100 msgs, Ubuntu IRC=500 msgs.

---

### Retired Claims

26.3x (GN v0.4): RETIRED.
GN v0.4 used a hardcoded domain-specific symbol table built for
MEMORY.md security notation vocabulary. Not a general compression
result. Not appropriate for publication or grant materials.

23x (synthetic): RETIRED.
Measured on constructed repetitive byte sequences, not real corpus
data. Not representative of production performance.

---

### Architectural Position

GNI matches gzip on general natural language (single-session batches).
GNI sliding window accumulates domain vocabulary beyond gzip 32KB limit.
Architectural advantage on domain-specific streams is real but not yet
quantified on production data. gzip resets per stream. GNI accumulates.

---

### Honest Limitations

- General NL: 5-11% below gzip on single-session batches
- Sliding window advantage requires stream continuity across batches
- Phase C (semantic deduplication) and Phase D (entropy normalization) pending
- Domain-specific stream advantage not yet benchmarked on production data

### Test Infrastructure

- 52 Rust tests, 37 JS tests, all passing
- Losslessness: exact payload match verified on all messages
- Corpora: ShareGPT 94K subset, Ubuntu Dialogue Corpus, MEMORY.md

Last updated: April 2026
Repos: github.com/atomsrkuul/glasik-notation
       github.com/atomsrkuul/glasik-core
