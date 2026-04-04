# GN v3.0 Benchmarks

**Phase 1: Serialization Baseline**

## Important Note

Phase 1 delivers lossless serialization + versioned framing. The semantic
tokenizer is currently a stub (returns data unchanged). Compression ratios
in earlier versions of this document were not verified against the actual
codec and have been corrected here.

Compression ratios are a Phase 2 deliverable.

## What Phase 1 Delivers

- Serializes messages to canonical binary format (varint encoding)
- Applies zlib compression to serialized bytes
- Wraps with versioned frame header + CRC32 checksum
- Guarantees 100% lossless round-trip recovery

## Phase 1 Baseline (Measured 2026-04-04)

ShareGPT V3 (1,000 messages, dialogue):
- Phase 1 compression: ~1.0x (frame overhead, tokenizer stub)
- gzip baseline on same data: ~2.8x
- Lossless recovery: 100% verified

Ubuntu IRC (1,000 messages, technical text):
- Phase 1 compression: ~1.0x (tokenizer stub, no dictionary)
- gzip baseline on same data: ~1.9x
- Lossless recovery: 100% verified

## Phase 2 Targets (NLNet application 2026-06-023)

Dialogue (ShareGPT): target 4-6x
Technical (Ubuntu IRC): target 10-20x
LLM context (OpenClaw): target 20-26x

Phase 2 targets are based on GN-RESEARCH analysis, not current codec output.

## What Is Verified

- Lossless round-trip on 1,000+ real messages per corpus
- CRC32 integrity verification working
- Versioned frame format working
- Serialization schema stable and frozen
- CRC32 bug caught and fixed during validation

## Reproducing Results

git clone https://github.com/atomsrkuul/glasik-notation.git
cd glasik-notation
npm test

37/37 tests passing. Results are deterministic.

Last updated: 2026-04-04
Status: Phase 1 honest baseline. Phase 2 compression pending NLNet funding.
