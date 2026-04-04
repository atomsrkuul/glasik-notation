# Contributing to Glasik Notation

**GN is an open standard for LLM context compression, not a proprietary library.**

We welcome contributions, independent implementations, and community feedback.

---

## How to Contribute

### Report Issues
- Found a bug? [Open an issue on GitHub](https://github.com/atomsrkuul/glasik-notation/issues)
- Include: reproduction steps, expected vs actual behavior, environment
- All issues are considered

### Improve Code
- Phase 1 is frozen (backward compatible forever)
- Phase 2 work starts after NLNet approval
- For Phase 1 fixes: file an issue first, discuss approach

### Benchmark Your Own Data
- Clone the repo
- Run: `npm test`
- Test on your corpus: `node src/gn-lz4-v2-complete.js`
- Share results: open an issue with your findings

### Build Integrations
- Ollama plugin: compress session context before storage
- llama.cpp plugin: integrate with message store
- Other frameworks: read the spec, implement compatible version

### Write Documentation
- Architecture guides
- Integration tutorials
- Performance tuning guides
- Real-world case studies

---

## Development Setup

```bash
# Clone repo
git clone https://github.com/atomsrkuul/glasik-notation.git
cd glasik-notation

# Install dependencies (none — pure JavaScript)
# Run tests
npm test

# Verify code quality
npm start
```

**No dependencies.** Just Node.js 14+.

---

## Code Style

- Clean, readable JavaScript
- Comments on complex logic
- No external packages
- 482 lines total (Phase 1 constraint)

Example:
```javascript
// Good: clear purpose
const compress = (messages) => {
  const serialized = messages.map(msg => serialize(msg));
  const compressed = zlib.deflateSync(serialized);
  return addFrame(compressed);
};

// Bad: unclear
const x = msgs.map(serialize);
const y = zlib.deflateSync(x);
return addFrame(y);
```

---

## Testing

**Phase 1:** All tests must pass
```bash
npm test  # Must be 37/37 passing
```

**Add tests for:**
- New message types
- Edge cases (empty, very large, special chars)
- Real corpus validation (if you have data to share)

---

## Licensing

All contributions must be compatible with MIT License.

By contributing, you agree that your work can be used, modified, and distributed under MIT.

---

## Roadmap & Priorities

### Phase 1 (Complete)
- ✅ Lossless serialization
- ✅ Compression layer
- ✅ Framing + integrity

### Phase 2 (NLNet Funded, If Approved)
- Rust port with SIMD
- Real embeddings integration
- Independent benchmarks
- Production documentation

### Phase 3+ (Community-Driven)
- Hardware-specific optimizations
- New codec implementations
- Ecosystem integrations

---

## Community Standards

### Be Respectful
- Assume good intent
- Focus on ideas, not people
- Welcome diverse perspectives

### Be Transparent
- Show your work
- Explain your reasoning
- Link to relevant discussions

### Be Honest
- Report real limitations
- Don't oversell improvements
- Acknowledge trade-offs

---

## Getting Help

- **Technical questions:** [GitHub issues](https://github.com/atomsrkuul/glasik-notation/issues)
- **Architecture discussion:** Comments in ARCHITECTURE.md
- **Benchmarking:** See BENCHMARKS.md methodology

---

## Recognition

We recognize contributors in:
- GitHub commit history
- Release notes
- Contributors file (planned)

---

## Questions?

Open an issue. We're here to help.

---

**This is open source. You help make it better.** 🚀

**License:** MIT  
**Maintainer:** Robert Rider (@atomsrkuul)  
**Status:** Phase 1 complete, Phase 2 pending
