# Knowledge Graph Compression Analysis

## Original Data

| File | Size |
|------|------|
| nodes.jsonl | 242 MB |
| relationships.jsonl | 403 MB |
| **Total** | **~645 MB** |

---

## Compression Results

### Full JSONL Files

| Method | Size | % of Original |
|--------|------|---------------|
| gzip -6 | 49.3 MB | 7.6% |
| **zstd -3** | **44.6 MB** | **6.9%** |
| zstd -6 | 41.2 MB | 6.4% |
| zstd -9 | 38.3 MB | 5.9% |
| zstd -19 | 15.5 MB | 2.4% |
| xz | 32.5 MB | 5.0% |

**Recommendation for JSONL**: Use **zstd -6 to -9** for best balance of size and speed.

---

### Zstd Levels (nodes.jsonl)

| Level | Size | Time |
|-------|------|------|
| -3 | 22.8 MB | Fastest |
| -6 | 20.8 MB | Balanced |
| -9 | 19.3 MB | Good |
| -12 | 18.9 MB | Slower |
| -15 | 18.5 MB | Slower |
| -19 | 15.5 MB | Slowest, smallest |

---

## Filtered Data (Standards + LearningComponents Only)

Filtered to essential nodes:

| Format | Size |
|--------|------|
| Raw JSONL | 226 MB |
| zstd -3 | 22.0 MB |
| zstd -6 | 20.1 MB |
| zstd -9 | 18.6 MB |

**This is 97% of the useful data at 35% of the size.**

---

## SQLite Database

Built from filtered data (Standards + LearningComponents + key relationships):

| Format | Size |
|--------|------|
| Raw SQLite | 152 MB |
| gzip | 50.7 MB |
| **zstd -3** | **44.8 MB** |
| zstd -9 | 40.1 MB |
| xz | 30.3 MB |

Includes indexes for fast queries:
- `idx_standards_code`
- `idx_standards_jurisdiction`
- `idx_standards_subject`
- `idx_rel_source/target/label`

---

## Recommendations for Buddy

### Option 1: Minimal (MVP)
**Ship only CCSS Math + ELA standards**

- Filter: `jurisdiction = "Multi-State"`
- Estimated size: ~5-10 MB compressed
- Covers 80% of use cases
- Fast download, fast queries

### Option 2: Core (Recommended)
**Ship all Standards + LearningComponents as SQLite**

- Format: zstd-compressed SQLite
- Size: ~40 MB download
- Decompresses to ~152 MB locally
- Includes indexes for fast queries
- Best balance for production

### Option 3: Full Dataset
**Ship complete graph with all curriculum metadata**

- Format: zstd -9 compressed JSONL
- Size: ~38 MB download
- Decompresses to 645 MB
- Includes Lessons, Activities, Assessments metadata
- Only if curriculum alignment is critical

### Option 4: Modular
**Base pack + downloadable extensions**

- Base: CCSS Math (5-10 MB)
- Optional packs by subject/jurisdiction
- On-demand download
- Best UX, more complexity

---

## Format Comparison

| Format | Pros | Cons |
|--------|------|------|
| **zstd** | Best ratio + speed, tunable levels | Less universal than gzip |
| gzip | Universal compatibility | Larger than zstd |
| xz | Smallest size | Slow compression, slower decompression |
| SQLite | Fast queries, indexes | Larger than raw compressed JSONL |

**For Buddy**: Use **zstd -6 or -9** for shipping, **SQLite** for local runtime.

---

## Example Commands

```bash
# Compress with zstd (recommended)
zstd -9 nodes.jsonl -o nodes.jsonl.zst

# Decompress
zstd -d nodes.jsonl.zst

# Create minimal SQLite for Buddy
python3 import_to_sqlite.py  # See kg_minimal.db creation
zstd -9 kg_minimal.db -o kg_minimal.db.zst
```

---

## Bottom Line

- **Raw data**: 645 MB (too large to ship)
- **Compressed full data**: 38-44 MB (reasonable)
- **Filtered essentials**: 18-22 MB (optimal for most uses)
- **SQLite with indexes**: 40 MB compressed, fast queries

**Ship 30-40 MB, get fast local standards lookups with full prerequisite chains.**
