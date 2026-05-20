# Encryption Guide

## Overview

HSHM provides an AES-256-CBC encryption implementation built on top of OpenSSL's EVP API. The `ctp::AES` class handles key derivation from passwords, random initialization vector (IV) generation, and symmetric encrypt/decrypt operations.

**Headers:**
```cpp
#include <hermes_shm/encrypt/encrypt.h>   // Includes aes.h
#include <hermes_shm/encrypt/aes.h>       // Direct include
```

**Compile-time flag:** `CTP_ENABLE_ENCRYPT`

**Dependencies:** OpenSSL (`libssl`, `libcrypto`)

## API Reference

### ctp::AES

```cpp
namespace hshm {

class AES {
 public:
    std::string key_;    // 256-bit (32-byte) derived key
    std::string iv_;     // 128-bit (16-byte) initialization vector
    std::string salt_;   // Optional salt for key derivation

    /**
     * Generate a random initialization vector (IV).
     * AES-256-CBC uses a 128-bit (16-byte) IV.
     * @param salt  Optional salt string for key derivation
     */
    void CreateInitialVector(const std::string& salt = "");

    /**
     * Derive a 256-bit encryption key from a password.
     * Uses EVP_BytesToKey with SHA-256 digest.
     * Must be called after CreateInitialVector().
     * @param password  Password string to derive key from
     */
    void GenerateKey(const std::string& password);

    /**
     * Encrypt input buffer using AES-256-CBC.
     * @param output      Pre-allocated output buffer (must be at least input_size + AES block size)
     * @param output_size [out] Actual number of encrypted bytes written
     * @param input       Plaintext input data
     * @param input_size  Size of input data in bytes
     * @return true on success, false on failure
     */
    bool Encrypt(char* output, size_t& output_size,
                 char* input, size_t input_size);

    /**
     * Decrypt input buffer using AES-256-CBC.
     * @param output      Pre-allocated output buffer (must be at least input_size bytes)
     * @param output_size [out] Actual number of decrypted bytes written
     * @param input       Ciphertext input data
     * @param input_size  Size of encrypted data in bytes
     * @return true on success, false on failure
     */
    bool Decrypt(char* output, size_t& output_size,
                 char* input, size_t input_size);
};

}  // namespace hshm
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
#include <hermes_shm/encrypt/encrypt.h>

void encrypt_example() {
    ctp::AES crypto;

    // 1. Setup: derive key and create IV
    crypto.GenerateKey("my_secret_password");
    crypto.CreateInitialVector();

    // 2. Prepare buffers
    std::string plaintext = "Sensitive data to encrypt";
    size_t input_size = plaintext.size();

    // Output buffer must be larger than input (padding adds up to 1 block)
    std::vector<char> encrypted(input_size + 256);
    std::vector<char> decrypted(input_size + 256);

    // 3. Encrypt
    size_t encrypted_size = encrypted.size();
    bool ok = crypto.Encrypt(encrypted.data(), encrypted_size,
                             plaintext.data(), input_size);
    assert(ok);

    // 4. Decrypt
    size_t decrypted_size = decrypted.size();
    ok = crypto.Decrypt(decrypted.data(), decrypted_size,
                        encrypted.data(), encrypted_size);
    assert(ok);

    // 5. Verify
    std::string result(decrypted.data(), decrypted_size);
    assert(result == plaintext);
}
```

### Large Buffer Encryption

```cpp
void large_buffer_example() {
    ctp::AES crypto;
    crypto.GenerateKey("passwd");
    crypto.CreateInitialVector();

    // Create 8 KB of data
    size_t data_size = 8192;
    std::vector<char> data(data_size, 0);
    // ... fill data ...

    // Allocate output with padding room (AES block size = 16 bytes)
    std::vector<char> encrypted(data_size + 256);
    std::vector<char> decrypted(data_size + 256);

    size_t enc_size = encrypted.size();
    crypto.Encrypt(encrypted.data(), enc_size, data.data(), data.size());

    size_t dec_size = decrypted.size();
    crypto.Decrypt(decrypted.data(), dec_size, encrypted.data(), enc_size);

    decrypted.resize(dec_size);
    assert(data == decrypted);
}
```

### Sharing Key and IV

For network communication, the key and IV must be shared between sender and receiver:

```cpp
// Sender
ctp::AES sender_crypto;
sender_crypto.GenerateKey("shared_password");
sender_crypto.CreateInitialVector();

// Encrypt data...
size_t enc_size = ...;
sender_crypto.Encrypt(output, enc_size, input, input_size);

// Send iv_ along with encrypted data (key is derived from shared password)
// The IV can be sent in plaintext — it's not secret

// Receiver
ctp::AES receiver_crypto;
receiver_crypto.GenerateKey("shared_password");
receiver_crypto.iv_ = sender_crypto.iv_;  // Use sender's IV

// Decrypt data...
size_t dec_size = ...;
receiver_crypto.Decrypt(output, dec_size, encrypted, enc_size);
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
