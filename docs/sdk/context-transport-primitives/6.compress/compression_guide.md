# Compression Guide

## Overview

HSHM provides a unified compression framework that wraps multiple lossless and lossy compression libraries behind a common `Compressor` interface. A factory system with preset levels (FAST, BALANCED, BEST) makes it easy to select and configure compressors at runtime.

**Headers:**
```cpp
#include <clio_ctp/compress/compress.h>          // Base interface
#include <clio_ctp/compress/compress_factory.h>   // Factory + presets
```

**Compile-time flag:** `CTP_ENABLE_COMPRESS`

## Supported Libraries

### Lossless Compressors (with compression levels)

| Library | Class | FAST Level | BALANCED Level | BEST Level |
|---------|-------|-----------|---------------|------------|
| bzip2 | `Bzip2WithModes` | 1 | 6 | 9 |
| zstd | `ZstdWithModes` | 1 | 3 | 19 |
| lz4 | `Lz4WithModes` | LZ4 default | LZ4 HC level 6 | LZ4 HC level 12 |
| zlib | `ZlibWithModes` | 1 | 6 | 9 |
| lzma | `LzmaWithModes` | 0 | 6 | 9 |
| brotli | `BrotliWithModes` | 1 | 6 | 11 |

### Lossless Compressors (single mode)

| Library | Class | Notes |
|---------|-------|-------|
| snappy | `Snappy` | No compression levels; always uses default |
| blosc2 | `Blosc` | No compression levels; always uses default |

### Lossy Compressors (via LibPressio)

Requires `CTP_ENABLE_LIBPRESSIO` in addition to `CTP_ENABLE_COMPRESS`.

| Library | Compressor ID |
|---------|--------------|
| zfp | `"zfp"` |
| sz3 | `"sz3"` |
| fpzip | `"fpzip"` |

### Direct-use Compressors

These classes can be used directly without the factory:

| Library | Class | Header |
|---------|-------|--------|
| bzip2 | `ctp::Bzip2` | `<clio_ctp/compress/bzip2.h>` |
| zstd | `ctp::Zstd` | `<clio_ctp/compress/zstd.h>` |
| lz4 | `ctp::Lz4` | `<clio_ctp/compress/lz4.h>` |
| zlib | `ctp::Zlib` | `<clio_ctp/compress/zlib.h>` |
| lzma | `ctp::Lzma` | `<clio_ctp/compress/lzma.h>` |
| brotli | `ctp::Brotli` | `<clio_ctp/compress/brotli.h>` |
| snappy | `ctp::Snappy` | `<clio_ctp/compress/snappy.h>` |
| blosc2 | `ctp::Blosc` | `<clio_ctp/compress/blosc.h>` |
| lzo | `ctp::Lzo` | `<clio_ctp/compress/lzo.h>` |

## API Reference

### ctp::Compressor (Base Interface)

```cpp
namespace hshm {

class Compressor {
 public:
    virtual ~Compressor() = default;

    /**
     * Compress input buffer into output buffer.
     * @param output     Pre-allocated output buffer
     * @param output_size  [in] capacity of output buffer; [out] actual compressed size
     * @param input      Input data to compress
     * @param input_size Size of input data in bytes
     * @return true on success, false on failure
     */
    virtual bool Compress(void* output, size_t& output_size,
                          void* input, size_t input_size) = 0;

    /**
     * Decompress input buffer into output buffer.
     * @param output      Pre-allocated output buffer
     * @param output_size [in] capacity of output buffer; [out] actual decompressed size
     * @param input       Compressed input data
     * @param input_size  Size of compressed data in bytes
     * @return true on success, false on failure
     */
    virtual bool Decompress(void* output, size_t& output_size,
                            void* input, size_t input_size) = 0;
};

}  // namespace hshm
```

### ctp::CompressionPreset

```cpp
enum class CompressionPreset {
    FAST,       // Fast compression, lower ratio
    BALANCED,   // Balanced speed and ratio (default)
    BEST,       // Best ratio, slower
    DEFAULT     // Same as BALANCED
};
```

### ctp::CompressionFactory

```cpp
class CompressionFactory {
 public:
    /**
     * Create a compressor with the specified preset.
     * @param library_name  Library name (case-insensitive): "bzip2", "zstd",
     *                      "lz4", "zlib", "lzma", "brotli", "snappy", "blosc2",
     *                      "zfp", "sz3", "fpzip"
     * @param preset        Compression preset (default: BALANCED)
     * @return Unique pointer to compressor, or nullptr if library not found
     */
    static std::unique_ptr<Compressor> GetPreset(
        const std::string& library_name,
        CompressionPreset preset = CompressionPreset::BALANCED);

    /**
     * Encode library name + preset into a unique integer ID.
     * Useful for model training and runtime compression selection.
     *
     * ID format: base_id * 10 + preset_id
     *   Lossless base IDs: bzip2=1, zstd=2, lz4=3, zlib=4, lzma=5, brotli=6, snappy=7, blosc2=8
     *   Lossy base IDs: zfp=10, sz3=11, fpzip=12
     *   Preset IDs: FAST=1, BALANCED=2, BEST=3
     *
     * @return Integer ID, or 0 if unknown library
     */
    static int GetLibraryId(const std::string& library_name,
                            CompressionPreset preset);

    /**
     * Decode a library ID back to (library_name, preset).
     * Reverse of GetLibraryId().
     */
    static std::pair<std::string, CompressionPreset> GetLibraryInfo(int library_id);

    /**
     * Convert a preset enum to a string ("fast", "balanced", "best", "default").
     */
    static std::string GetPresetName(CompressionPreset preset);
};
```

## Examples

### Direct Usage (No Factory)

```cpp
#include <clio_ctp/compress/zstd.h>

void direct_compress_example() {
    ctp::Zstd zstd;

    std::string raw = "Hello, World!";
    std::vector<char> compressed(1024);
    std::vector<char> decompressed(1024);

    // Compress
    size_t compressed_size = compressed.size();
    bool ok = zstd.Compress(compressed.data(), compressed_size,
                            raw.data(), raw.size());
    assert(ok);

    // Decompress
    size_t decompressed_size = decompressed.size();
    ok = zstd.Decompress(decompressed.data(), decompressed_size,
                         compressed.data(), compressed_size);
    assert(ok);

    std::string result(decompressed.data(), decompressed_size);
    assert(result == raw);
}
```

### Factory with Presets

```cpp
#include <clio_ctp/compress/compress_factory.h>

void factory_compress_example() {
    // Create a fast zstd compressor
    auto compressor = ctp::CompressionFactory::GetPreset(
        "zstd", ctp::CompressionPreset::FAST);
    assert(compressor != nullptr);

    std::string raw = "Hello, World!";
    std::vector<char> compressed(1024);
    std::vector<char> decompressed(1024);

    size_t compressed_size = compressed.size();
    compressor->Compress(compressed.data(), compressed_size,
                         raw.data(), raw.size());

    size_t decompressed_size = decompressed.size();
    compressor->Decompress(decompressed.data(), decompressed_size,
                           compressed.data(), compressed_size);

    assert(std::string(decompressed.data(), decompressed_size) == raw);
}
```

### Library ID Encoding

```cpp
#include <clio_ctp/compress/compress_factory.h>

void library_id_example() {
    // Encode: zstd + FAST -> integer ID
    int id = ctp::CompressionFactory::GetLibraryId("zstd",
                 ctp::CompressionPreset::FAST);
    // id == 21 (base_id=2 * 10 + preset=1)

    // Decode: integer ID -> (name, preset)
    auto [name, preset] = ctp::CompressionFactory::GetLibraryInfo(id);
    assert(name == "zstd");
    assert(preset == ctp::CompressionPreset::FAST);

    // Get preset name
    std::string preset_name = ctp::CompressionFactory::GetPresetName(preset);
    assert(preset_name == "fast");
}
```

### Iterating All Libraries

```cpp
void try_all_compressors() {
    std::vector<std::string> libraries = {
        "bzip2", "zstd", "lz4", "zlib", "lzma", "brotli", "snappy", "blosc2"
    };

    std::string raw = "Test data for compression";
    std::vector<char> compressed(1024);
    std::vector<char> decompressed(1024);

    for (const auto& lib : libraries) {
        auto compressor = ctp::CompressionFactory::GetPreset(
            lib, ctp::CompressionPreset::BALANCED);
        if (!compressor) continue;

        size_t csz = compressed.size();
        size_t dsz = decompressed.size();

        bool ok = compressor->Compress(compressed.data(), csz,
                                       raw.data(), raw.size());
        assert(ok);

        ok = compressor->Decompress(decompressed.data(), dsz,
                                    compressed.data(), csz);
        assert(ok);

        assert(std::string(decompressed.data(), dsz) == raw);
    }
}
```

## Buffer Sizing

The caller is responsible for allocating output buffers with sufficient capacity:

- **Compress**: The output buffer should be at least as large as the input. Some algorithms (e.g., LZ4) provide a `compressBound()` function. When in doubt, allocate 2x the input size.
- **Decompress**: The output buffer must be large enough to hold the original uncompressed data. You must track the original size separately (e.g., in metadata).

The `output_size` parameter serves dual purpose:
- **Input**: Maximum capacity of the output buffer
- **Output**: Actual number of bytes written

## Choosing a Compressor

| Use Case | Recommended Library | Preset |
|----------|-------------------|--------|
| Low-latency streaming | lz4 | FAST |
| General-purpose | zstd | BALANCED |
| Maximum compression ratio | lzma | BEST |
| Legacy compatibility | zlib | BALANCED |
| Maximum decompression speed | snappy | DEFAULT |
| Scientific floating-point data | zfp / sz3 | BALANCED |
