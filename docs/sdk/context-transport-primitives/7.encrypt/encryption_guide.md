# Encryption Guide

## Overview

HSHM provides an AES-256-CBC encryption implementation built on top of OpenSSL's EVP API. The `ctp::AES` class handles key derivation from passwords, random initialization vector (IV) generation, and symmetric encrypt/decrypt operations.

**Headers:**
```cpp
#include <clio_ctp/encrypt/encrypt.h>   // Includes aes.h
#include <clio_ctp/encrypt/aes.h>       // Direct include
```

**Compile-time flag:** `CTP_ENABLE_ENCRYPT`

**Dependencies:** OpenSSL (`libssl`, `libcrypto`)

## API Reference

### ctp::AES

```cpp
#include <cstddef>
#include <string>

namespace ctp {

class AES {
 public:
    std::string key_;    // 256-bit (32-byte) derived key
    std::string iv_;     // 128-bit (16-byte) initialization vector
    std::string salt_;   // Optional salt for key derivation

    /**
     * Generate a random initialization vector (IV).
     * AES-256-CBC uses a 128-bit (16-byte) IV.
     * The salt is stored and later consumed by GenerateKey().
     * @param salt  Optional salt string for key derivation
     */
    void CreateInitialVector(const std::string& salt = "");

    /**
     * Derive a 256-bit encryption key from a password.
     * Uses EVP_BytesToKey with the SHA-256 digest and the stored salt_.
     * @param password  Password string to derive key from
     */
    void GenerateKey(const std::string& password);

    /**
     * Encrypt input buffer using AES-256-CBC.
     * @param output      Pre-allocated output buffer (at least input_size + AES block size)
     * @param output_size [out] Actual number of encrypted bytes written
     * @param input       Plaintext input data
     * @param input_size  Size of input data in bytes
     * @return true on success, false on failure
     */
    bool Encrypt(char* output, size_t& output_size,
                 char* input, size_t input_size);

    /**
     * Decrypt input buffer using AES-256-CBC.
     * @param output      Pre-allocated output buffer (at least input_size bytes)
     * @param output_size [out] Actual number of decrypted bytes written
     * @param input       Ciphertext input data
     * @param input_size  Size of encrypted data in bytes
     * @return true on success, false on failure
     */
    bool Decrypt(char* output, size_t& output_size,
                 char* input, size_t input_size);
};

}  // namespace ctp
```

## Algorithm Details

| Property | Value |
|----------|-------|
| Cipher | AES-256-CBC |
| Key size | 256 bits (32 bytes) |
| IV size | 128 bits (16 bytes) |
| Block size | 128 bits (16 bytes) |
| Key derivation | `EVP_BytesToKey` with SHA-256 |
| IV generation | `RAND_bytes` (cryptographically secure) |
| Padding | PKCS#7 (handled by OpenSSL EVP) |

## Usage

### Setup Sequence

The AES class must be initialized in this order:

1. **`GenerateKey(password)`** — Derives a 256-bit key from the password using SHA-256
2. **`CreateInitialVector()`** — Generates a cryptographically random 128-bit IV

Both the sender and receiver must use the same key and IV. The key and IV are stored as member variables (`key_`, `iv_`) and can be transmitted or stored separately.

### Basic Encrypt/Decrypt

```cpp
#include <clio_ctp/encrypt/encrypt.h>  // brings in ctp::AES when CTP_ENABLE_ENCRYPT

#include <cassert>
#include <cstddef>
#include <string>
#include <vector>

void encrypt_example() {
#if CTP_ENABLE_ENCRYPT
    ctp::AES crypto;

    // 1. Setup: derive key from a password, then create a random IV.
    crypto.GenerateKey("my_secret_password");
    crypto.CreateInitialVector();

    // 2. Prepare buffers.
    std::string plaintext = "Sensitive data to encrypt";
    size_t input_size = plaintext.size();

    // Output buffer must be larger than input (padding adds up to one block).
    std::vector<char> encrypted(input_size + 256);
    std::vector<char> decrypted(input_size + 256);

    // 3. Encrypt.
    size_t encrypted_size = encrypted.size();
    bool ok = crypto.Encrypt(encrypted.data(), encrypted_size,
                             plaintext.data(), input_size);
    assert(ok);

    // 4. Decrypt.
    size_t decrypted_size = decrypted.size();
    ok = crypto.Decrypt(decrypted.data(), decrypted_size,
                        encrypted.data(), encrypted_size);
    assert(ok);

    // 5. Verify.
    std::string result(decrypted.data(), decrypted_size);
    assert(result == plaintext);
#endif  // CTP_ENABLE_ENCRYPT
}
```

### Large Buffer Encryption

```cpp
#include <clio_ctp/encrypt/encrypt.h>

#include <cassert>
#include <cstddef>
#include <vector>

void large_buffer_example() {
#if CTP_ENABLE_ENCRYPT
    ctp::AES crypto;
    crypto.GenerateKey("passwd");
    crypto.CreateInitialVector();

    // Create 8 KB of data.
    size_t data_size = 8192;
    std::vector<char> data(data_size, 0);
    // ... fill data ...

    // Allocate output with padding room (AES block size = 16 bytes).
    std::vector<char> encrypted(data_size + 256);
    std::vector<char> decrypted(data_size + 256);

    size_t enc_size = encrypted.size();
    crypto.Encrypt(encrypted.data(), enc_size, data.data(), data.size());

    size_t dec_size = decrypted.size();
    crypto.Decrypt(decrypted.data(), dec_size, encrypted.data(), enc_size);

    decrypted.resize(dec_size);
    assert(data == decrypted);
#endif  // CTP_ENABLE_ENCRYPT
}
```

### Sharing Key and IV

For network communication, the key and IV must be shared between sender and receiver:

```cpp
#include <clio_ctp/encrypt/encrypt.h>

#include <cassert>
#include <cstddef>
#include <string>
#include <vector>

void share_key_and_iv_example() {
#if CTP_ENABLE_ENCRYPT
    std::string plaintext = "message for the receiver";
    size_t input_size = plaintext.size();

    // --- Sender ---
    ctp::AES sender_crypto;
    sender_crypto.GenerateKey("shared_password");
    sender_crypto.CreateInitialVector();

    std::vector<char> encrypted(input_size + 256);
    size_t enc_size = encrypted.size();
    sender_crypto.Encrypt(encrypted.data(), enc_size,
                          plaintext.data(), input_size);

    // Send enc_size bytes of ciphertext along with sender_crypto.iv_.
    // The IV can be sent in plaintext — it is not secret. The key is
    // re-derived on the receiver from the shared password.

    // --- Receiver ---
    ctp::AES receiver_crypto;
    receiver_crypto.GenerateKey("shared_password");
    receiver_crypto.iv_ = sender_crypto.iv_;  // use the sender's IV

    std::vector<char> decrypted(enc_size + 256);
    size_t dec_size = decrypted.size();
    receiver_crypto.Decrypt(decrypted.data(), dec_size,
                            encrypted.data(), enc_size);

    std::string result(decrypted.data(), dec_size);
    assert(result == plaintext);
#endif  // CTP_ENABLE_ENCRYPT
}
```

## Buffer Sizing

- **Encrypt output buffer**: Must be at least `input_size + AES_BLOCK_SIZE` (16 bytes). The actual encrypted size may be slightly larger than the input due to PKCS#7 padding.
- **Decrypt output buffer**: Must be at least `input_size` bytes. The actual decrypted size will be less than or equal to the encrypted input size.

The `output_size` parameter:
- **Input**: Not used as capacity (the caller must ensure sufficient buffer space)
- **Output**: Set to the actual number of bytes written

## Security Considerations

1. **Key management**: Store passwords securely. Do not hardcode passwords in source code for production use.
2. **IV uniqueness**: Always call `CreateInitialVector()` before each encryption session. Reusing an IV with the same key compromises security.
3. **Salt usage**: Pass a salt to `CreateInitialVector()` for additional key derivation entropy.
4. **Memory cleanup**: The key, IV, and plaintext remain in memory as `std::string` members. For highly sensitive applications, consider zeroing memory after use.
