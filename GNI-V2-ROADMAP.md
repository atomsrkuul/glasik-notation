# GNI v2.0 Roadmap

**Current State:** v1.0.0 (Production)
- Compression: 3.1×, 22-36% bandwidth savings
- Shannon capacity: 68% (real-world)
- Dictionaries: ~20 patterns per category (trained on 500K Ubuntu IRC)
- Status: Live, validated on real data

**Next Milestone:** v2.0 (Planned)
- Target compression: 3.5-3.8×
- Target Shannon capacity: 72-80%
- Deployment: 2026 Q2-Q3

---

## Two Critical Improvements

### 1. Extended Ubuntu Dialogue Corpus Training (200+ Patterns)

**Current Bottleneck:**
- Dictionary limited to 20-25 patterns per category
- Plateau at 3-4% compression gains
- Many high-frequency byte sequences unused

**Solution: Deep Corpus Analysis**

```
Current approach:
  Input: 500K random Ubuntu IRC messages
  Output: Top 20 patterns by frequency
  Result: 3-4% compression

v2.0 approach:
  Input: Full Ubuntu corpus (2.8GB, 27M+ messages)
  Categorize: By message type (JSON, metadata, error, text)
  Extract: Top 200+ patterns per category
  Train: Separate dictionaries (JSON-deep, meta-deep, error-deep, text-deep)
  Result: 5-10% compression target
```

**Implementation Steps:**

1. **Full Corpus Processing**
   - Parse all 2.8GB Ubuntu IRC data
   - Categorize by detected type
   - Build frequency tables per category

2. **Pattern Extraction**
   - Find all 2-8 byte sequences (not just 2-6)
   - Score by: frequency × length × entropy_savings
   - Select top 200 per category (vs current 20)

3. **Dictionary Training**
   - Build specialized dictionary per category
   - Test on holdout validation set
   - Measure compression improvement

4. **Deployment**
   - Load 4 × 200-pattern dictionaries
   - Route messages to specialized dictionary
   - Expected gain: +2-6% compression

**Expected Results:**
```
JSON patterns:        20 → 200 patterns
Metadata patterns:    22 → 200 patterns
Error patterns:       18 → 150 patterns
Text patterns:        25 → 200 patterns

Overall compression:  3.1× → 3.4-3.6×
Shannon capacity:     68% → 72-74%
```

**Work Estimate:** 2-3 days (pattern extraction + training)

---

### 2. ANS Entropy Coder (Huffman → ANS)

**Current Bottleneck:**
- Huffman coding rounds to bit boundaries
- Average waste: 2-3% per message
- Can't achieve true entropy coding

**Solution: Asymmetric Numeral Systems**

```
Current (Huffman):
  Problem: Symbol with p=0.4 → needs 2 bits (40% waste)
  Limit: ~70% of Shannon capacity
  Speed: Fast

v2.0 (ANS):
  Solution: Symbol with p=0.4 → exact 2.32 bits (0% waste)
  Potential: ~95% of Shannon capacity
  Speed: Still fast (state machine, not division)
```

**Implementation Steps:**

1. **ANS State Machine**
   - Already partially implemented (gn-ans-codec.js)
   - Complete state transition table
   - Build encoding/decoding lookup tables

2. **Frequency Table Adaptation**
   - Measure symbol frequencies from real messages
   - Build ANS table proportional to frequencies
   - Separate tables per category

3. **Integration with Dictionaries**
   - Apply dictionary first (symbol replacement)
   - Then apply ANS coding to result
   - Test compression improvement

4. **Testing**
   - Measure on 100K validation set
   - Compare: Huffman vs ANS gains
   - Expected: +4-6% compression

**Expected Results:**
```
Shannon capacity:  68% → 72-76%
Compression ratio: 3.1× → 3.3-3.5×
Speed: 5.5ms → 6-7ms (acceptable)
```

**Work Estimate:** 3-5 days (implementation + validation)

---

## Combined Impact: v2.0

### Performance Improvements

| Metric | v1.0 | v2.0 Target | Gain |
|--------|------|-------------|------|
| Compression Ratio | 3.1× | 3.5-3.8× | +12-22% |
| Shannon Capacity | 68% | 72-80% | +4-12% |
| Bandwidth Savings | 22-36% | 28-45% | +6-9% |
| Latency | 5.5ms | 6-8ms | -8-45% (acceptable) |

### Real-World Impact

**For 1M messages/month:**
```
v1.0: ~1,450 MB storage
v2.0: ~1,050 MB storage (28% reduction)
Savings: ~$0.12/month at S3 rates
Annual: ~$1.40/year per million messages
```

**For 100M messages/month:**
```
v1.0: Bandwidth cost = $156/month
v2.0: Bandwidth cost = $120/month
Savings: $36/month = $432/year
```

---

## Execution Plan

### Phase 1: Extended Dictionary Training (Week 1-2)

**Deliverables:**
- [ ] Parse full 2.8GB Ubuntu corpus
- [ ] Extract 200+ patterns per category
- [ ] Train 4 specialized dictionaries
- [ ] Measure compression on validation set
- [ ] Document pattern learning results

**Success Criteria:**
- Compression improves from 3.1× → 3.3-3.4×
- Shannon capacity improves to 70-72%

### Phase 2: ANS Codec Integration (Week 2-4)

**Deliverables:**
- [ ] Complete ANS state machine implementation
- [ ] Build frequency-based lookup tables
- [ ] Integrate with dictionary system
- [ ] Test encode/decode round-trips
- [ ] Measure final compression

**Success Criteria:**
- ANS adds +4-6% compression gain
- Final ratio reaches 3.5-3.8×
- Shannon capacity reaches 74-80%

### Phase 3: Validation & Deployment (Week 4-5)

**Deliverables:**
- [ ] A/B test v1.0 vs v2.0 on real traffic
- [ ] Measure actual bandwidth savings
- [ ] Validate zero data loss
- [ ] Update documentation
- [ ] Deploy to production

**Success Criteria:**
- Real-world compression matches benchmarks (±5%)
- Zero compression failures
- v2.0 released as npm package

---

## Why These Two Improvements?

### Extended Corpus (200+ Patterns)

**Why it matters:**
- Dictionary size is the primary lever for compression
- Current 20-pattern limit is conservative
- Ubuntu corpus has 27M+ messages to learn from
- Real-world patterns are richer than sampled patterns

**Why it works:**
- Larger dictionary = more patterns to match
- Patterns compound: fewer bytes → fewer patterns needed
- Real data validated: 500K messages prove what matters

**Why now:**
- Corpus already available (2.8GB downloaded)
- Training infrastructure in place (gn-dictionary-trainer.js)
- No algorithmic risk (proven approach)

### ANS Codec (Huffman → ANS)

**Why it matters:**
- Huffman has inherent rounding waste
- ANS is state-of-the-art entropy coding
- Zstandard and recent codecs use ANS variants
- Gap between current (68%) and possible (80%) is knowable

**Why it works:**
- ANS proven mathematically (Duda 2009)
- Already partially implemented (gn-ans-codec.js)
- No dictionary needed (orthogonal improvement)
- Speed acceptable for real-time use

**Why now:**
- Foundation is ready
- Diminishing returns on other optimizations
- Clear path to 80%+ Shannon capacity

---

## Risk Assessment

### Low Risk
✅ Extended corpus training - proven approach, lots of data  
✅ Dictionary expansion - linear improvement, no surprises  
✅ ANS implementation - well-documented algorithm  

### Medium Risk
⚠️ Integration complexity - mixing two subsystems  
⚠️ Real-world validation - might not match benchmarks  
⚠️ Performance regression - latency might exceed 8ms  

### Mitigation
- Test on real OpenClaw traffic before rollout
- Keep v1.0 as fallback (zero breaking changes)
- Benchmark every integration step
- Monitor latency in production

---

## Long-Term Vision (v3.0+)

After v2.0 stabilizes:

1. **Context-Aware Routing (v2.5)**
   - Use message category for dictionary selection
   - Automatic switching: JSON-deep vs meta-deep vs text-deep
   - Expected: +2-3% additional gain

2. **Continuous Dictionary Learning (v3.0)**
   - Monthly retraining on real OpenClaw traffic
   - Adapt to user patterns
   - Expected: +3-5% improvement over 12 months

3. **Semantic Sharding for LLM (v3.0)**
   - Integrate context compression with transmission
   - Two-stage pipeline
   - Expected: 90%+ LLM context cost reduction

4. **Distributed Compression (v3.5)**
   - Edge-node dictionaries
   - Synchronization protocol
   - Expected: Cost reduction through scale

---

## Success Metrics for v2.0

```
Compression:
  ✓ Ratio improves from 3.1× to 3.5-3.8×
  ✓ Shannon capacity reaches 72-80%
  ✓ Real-world gains ±5% of benchmarks

Reliability:
  ✓ Zero data loss guarantee maintained
  ✓ 99.8%+ bootstrap success
  ✓ Latency <8ms (acceptable degradation)

Deployment:
  ✓ Live on OpenClaw by 2026-Q3
  ✓ npm updated with v2.0
  ✓ Public research published
```

---

## Conclusion

v2.0 represents the natural next step: **deep corpus training** + **optimal entropy coding**. Both improvements are:
- ✅ Well-understood (no fundamental research needed)
- ✅ Implementable (code structure ready)
- ✅ Measurable (clear success criteria)
- ✅ Production-safe (v1.0 remains fallback)

**Timeline:** 4-5 weeks to v2.0 release  
**Effort:** 2-3 person-weeks of engineering  
**Impact:** 12-22% compression improvement on real traffic

This is the roadmap to production-grade v2.0.
