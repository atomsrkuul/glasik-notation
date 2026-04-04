# Glasik Notation — Architecture & Version Tree

GN (Glasik Notation)
│
├── EXPERIMENTAL (v0.1-v0.4)
│   Iterative semantic compression during initial development.
│   LZ77 + custom dictionary + gzip pipeline.
│   Peak verified result: 26.3x on LLM notation data (v0.4).
│   Proved domain-specific compression is viable.
│   Corpus: MEMORY.md (OpenClaw agent notation, high regularity).
│   Status: research complete, not production.
│
│   v0.1-v0.3  Early iterations, major architecture changes
│   v0.4       Peak compression result. GN + gzip baseline established.
│
├── GNI v1.0 — Transmission Codec (SHIPPED)
│   Lossless serialization for message systems.
│   Versioned framing, CRC32 integrity, varint field encoding.
│   Tokenizer intentionally stubbed (Phase 1 scope).
│   Independently verified: 100% lossless, 2000+ messages.
│   Benchmarked: 3.4-4.1x on ShareGPT, Ubuntu IRC, MEMORY.md.
│   Published: npm gni-compression@1.0.0
│
│   Honest baseline: at or near gzip. Tokenizer is Phase 2 path forward.
│
├── GNI v1.1 — Codon-Table Tokenizer (ACTIVE)
│   Replaces pass-through stub with real symbol substitution.
│   Codon-table model: fixed-width symbols to variable-length semantic units.
│   Target: exceed gzip baseline across all corpora.
│   Rust port begins here (glasik-core).
│
│   Shard model informs tokenizer design from this point forward.
│
├── glasik-core — Rust Implementation (NEXT)
│   Standalone crate. JS GNI becomes reference/correctness impl.
│   PyO3 bindings for Python agent layer connectivity.
│   Frame codec → codon tokenizer → shard primitives.
│
│   codec/      Frame format, varint, CRC32
│   tokenizer/  Codon table, dictionary selection
│   shards/     Crystalline state primitives (built alongside GN)
│   bindings/   PyO3 Python interface
│
└── GN Shards — Crystalline Compressed State (INTRINSIC)
    Not a separate project. Emerges alongside GN as compression deepens.
    Volatility is a natural result of maximized internal order,
    not a design constraint.
    Probe-only interaction boundary — direct access risks state collapse.
    A true Shard is what a GN structure becomes when fully realized.
    Real embedding integration replaces mock cosine similarity.
    Shannon floor acknowledged and exploited through lossy abstraction.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NET NAVI (NN) — Separate Project, consumes GN as substrate
    GN Shards as memory primitive.
    Dreaming: offline consolidation, generative recall.
    Imagination vector: extrapolation from compressed memory.
    Memory continuity as core design goal.
    Not a GN version. GN does not evolve into NN — NN is built on GN.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
