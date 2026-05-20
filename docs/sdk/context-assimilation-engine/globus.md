---
sidebar_position: 3
---

# Globus Connector

## Overview

The Globus connector enables the Context Assimilation Engine (CAE) to transfer data from [Globus](https://www.globus.org/) endpoints into IOWarp. It supports two transfer modes:

- **Globus-to-local**: Downloads files via the endpoint's HTTPS server
- **Globus-to-Globus**: Transfers between two Globus endpoints using the Transfer API

The connector is implemented by `GlobusFileAssimilator` and is conditionally compiled with the `CAE_ENABLE_GLOBUS` CMake flag.

## Prerequisites

### Build Dependencies

| Dependency | Purpose |
|-----------|---------|
| [POCO](https://pocoproject.org/) (Net, NetSSL, Crypto, JSON) | HTTPS requests to Globus APIs |
| [nlohmann_json](https://github.com/nlohmann/json) | JSON parsing |

### Build with Globus Support

```bash
cmake -DCAE_ENABLE_GLOBUS=ON ..
cmake --build build
```

Verify that the build output includes:

```
CAE Globus support: ENABLED
```

If you see `CAE Globus support: DISABLED`, check that POCO and nlohmann_json are installed and discoverable by CMake.

### Globus Account

You need a free Globus account. Sign up or sign in at [app.globus.org](https://app.globus.org/).

## Authentication

The Globus connector uses OAuth2 for authentication. This section walks through the full process from registering an application to obtaining and setting tokens.

### Step 1: Register a Globus Application (One-Time Setup)

You need a **Client ID** to generate tokens. This only needs to be done once.

1. Go to [app.globus.org/settings/developers](https://app.globus.org/settings/developers)
2. Click **"Register a thick client or script that will be installed and run by users on their devices"** (Native App)
3. Fill in the registration form:
   - **App Name**: Choose any name (e.g., "IOWarp CAE")
   - **Redirects**: Leave the default (`https://auth.globus.org/v2/web/auth-code`)
4. Click **Register App**
5. Copy your **Client ID** (a UUID like `a1b2c3d4-...`). You will need this for every token generation.

### Step 2: Generate Tokens

Globus uses two tokens:

| Token | Environment Variable | Purpose |
|-------|---------------------|---------|
| Transfer API token | `GLOBUS_ACCESS_TOKEN` | Resolve endpoint metadata, submit transfers |
| Collection HTTPS token | `GLOBUS_HTTPS_ACCESS_TOKEN` | Download files via HTTPS from a specific collection |

Tokens expire after **48 hours**. When you see `Token is not active`, repeat this step to generate new ones.

#### Option A: Python Helper Script (Recommended)

The integration test includes a script that handles the OAuth2 flow:

```bash
# Install the Globus SDK (one-time)
pip install globus-sdk

cd context-assimilation-engine/test/integration/globus_matsci

# Generate tokens for a specific collection
# Replace YOUR_CLIENT_ID with the Client ID from Step 1
# Replace COLLECTION_ID with the Globus endpoint/collection UUID
python3 get_oauth_token.py \
  --client-id YOUR_CLIENT_ID \
  COLLECTION_ID
```

The script will:

1. Print an authorization URL — **open it in your browser**
2. Sign in to Globus and click **Allow** to authorize the scopes
3. Globus displays an **authorization code** — copy it
4. Paste the code back into the terminal when prompted

On success, the script saves tokens to three files:

| File | Format | Usage |
|------|--------|-------|
| `/tmp/globus_tokens.sh` | Shell exports | `source /tmp/globus_tokens.sh` |
| `/tmp/globus_tokens.txt` | `KEY=VALUE` | Manual reference |
| `/tmp/globus_tokens.json` | Full JSON | Programmatic access |

**Load the tokens into your current shell:**

```bash
source /tmp/globus_tokens.sh
```

This exports `GLOBUS_ACCESS_TOKEN`, `GLOBUS_HTTPS_ACCESS_TOKEN`, and `GLOBUS_COLLECTION_ID`.

If `COLLECTION_ID` is omitted, the script defaults to the Globus Tutorial Collection (`6c54cade-bde5-45c1-bdea-f4bd71dba2cc`).

**For the Materials Science test endpoint:**

```bash
python3 get_oauth_token.py \
  --client-id YOUR_CLIENT_ID \
  e8cf0e9a-f96a-11ed-9a83-83ef71fbf0ae
```

##### Mapped Collections and `data_access` Scope

Some collections (non-High-Assurance GCSv5 mapped collections) require an additional `data_access` scope. The script auto-detects this from endpoint metadata, but if you get a `ConsentRequired` error, force it:

```bash
python3 get_oauth_token.py --client-id YOUR_CLIENT_ID --with-data-access COLLECTION_ID
```

#### Option B: Manual REST API

If you cannot use the Python script, you can generate tokens using `curl`.

**Get an authorization code** — open this URL in your browser (replace `YOUR_CLIENT_ID` and `COLLECTION_ID`):

```
https://auth.globus.org/v2/oauth2/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=https://auth.globus.org/v2/web/auth-code&scope=urn:globus:auth:scope:transfer.api.globus.org:all%20https://auth.globus.org/scopes/COLLECTION_ID/https&response_type=code
```

Sign in, authorize, and copy the authorization code displayed on the page.

**Exchange the code for tokens:**

```bash
curl -X POST https://auth.globus.org/v2/oauth2/token \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "grant_type=authorization_code" \
  -d "code=PASTE_AUTH_CODE_HERE" \
  -d "redirect_uri=https://auth.globus.org/v2/web/auth-code"
```

The JSON response contains token entries for each resource server. Look for the `access_token` fields.

**Export the tokens:**

```bash
# The token for resource_server "transfer.api.globus.org"
export GLOBUS_ACCESS_TOKEN="AgVxxx..."

# The token for the collection resource_server (the COLLECTION_ID)
export GLOBUS_HTTPS_ACCESS_TOKEN="AgXxxx..."
```

### Step 3: Verify Tokens (Optional)

Confirm the transfer token works by querying an endpoint:

```bash
curl -s -H "Authorization: Bearer $GLOBUS_ACCESS_TOKEN" \
  https://transfer.api.globus.org/v0.10/endpoint/e8cf0e9a-f96a-11ed-9a83-83ef71fbf0ae \
  | jq '.display_name, .https_server'
```

If you see the endpoint name and HTTPS server URL, your token is valid. If you see `Token is not active`, the token has expired — regenerate it.

## OMNI File Format for Globus

Globus transfers are specified in [OMNI files](omni.md) using either URI format:

### `globus://` URI

```yaml
transfers:
  - src: "globus://ENDPOINT_ID/path/to/file.dat"
    dst: "file::/tmp/local_copy.dat"
    format: "binary"
    src_token: "${GLOBUS_ACCESS_TOKEN}"
```

### Globus Web URL

```yaml
transfers:
  - src: "https://app.globus.org/file-manager?origin_id=ENDPOINT_ID&origin_path=%2Fpath%2Fto%2F"
    dst: "file::/tmp/local_copy/"
    format: "binary"
    src_token: "${GLOBUS_ACCESS_TOKEN}"
```

The `src_token` field supports `${VAR_NAME}` environment variable expansion. If omitted, the system falls back to the `GLOBUS_ACCESS_TOKEN` environment variable.

## Quick Start

This section walks through running the Globus integration test from scratch.

### 1. Build with Globus Support

```bash
cmake -DCAE_ENABLE_GLOBUS=ON -S . -B build
cmake --build build -j$(nproc)
sudo cmake --install build
```

### 2. Register a Globus App (First Time Only)

1. Go to [app.globus.org/settings/developers](https://app.globus.org/settings/developers)
2. Register a **Native App** (thick client / script)
3. Copy your **Client ID**

### 3. Generate Tokens

```bash
pip install globus-sdk   # one-time

cd context-assimilation-engine/test/integration/globus_matsci

python3 get_oauth_token.py \
  --client-id YOUR_CLIENT_ID \
  e8cf0e9a-f96a-11ed-9a83-83ef71fbf0ae
```

Open the printed URL in your browser, authorize, paste the code back. Then:

```bash
source /tmp/globus_tokens.sh
```

### 4. Run the Test

```bash
./run_test.sh
```

Output files appear in `/tmp/globus_matsci/`.

## Running the Integration Test

The integration test transfers data from the Materials Science SEM\_103 dataset on Globus to the local filesystem.

| Property | Value |
|----------|-------|
| Endpoint ID | `e8cf0e9a-f96a-11ed-9a83-83ef71fbf0ae` |
| Dataset path | `/SEM_103/` |
| Web UI | [Browse on Globus](https://app.globus.org/file-manager?origin_id=e8cf0e9a-f96a-11ed-9a83-83ef71fbf0ae&origin_path=%2FSEM_103%2F) |

### Full Test (with Chimaera Runtime)

This runs the end-to-end pipeline: Chimaera runtime (with CTE + CAE pools auto-created via compose), then `clio_cae_omni`.

The `run_test.sh` script performs the following steps:

1. Validates that `GLOBUS_ACCESS_TOKEN` is set (also requires `GLOBUS_HTTPS_ACCESS_TOKEN` for HTTPS downloads)
2. Starts the Chimaera runtime with `wrp_runtime_conf.yaml` (compose section creates CTE pool 512.0 and CAE pool 400.0 automatically)
3. Processes the OMNI file (`matsci_globus_omni.yaml`) with `clio_cae_omni`
4. Prints transferred files and shuts down the runtime

Transferred files are written to `/tmp/globus_matsci/`.

### HTTPS Download Test (Standalone)

This lighter test downloads a file directly from a Globus endpoint's HTTPS server, without the Chimaera runtime. It is useful for verifying that your tokens work before running the full test.

```bash
cd context-assimilation-engine/test/integration/globus_matsci

# Make sure tokens are loaded
source /tmp/globus_tokens.sh

# List a directory (path ends with /)
./download_test.sh /

# Download a specific file
./download_test.sh /SEM_103/PRISTINE/SEM_103_pristine_MASTER_650_MPa_loads.inp /tmp/test_file.inp

# Use a different collection
./download_test.sh --collection-id 6c54cade-bde5-45c1-bdea-f4bd71dba2cc /
```

This script requires both `GLOBUS_ACCESS_TOKEN` and `GLOBUS_HTTPS_ACCESS_TOKEN`.

## Error Codes

The `GlobusFileAssimilator::Schedule` method returns the following error codes:

| Code | Description |
|------|-------------|
| 0 | Success |
| -1 | Missing access token |
| -2 | Invalid source protocol (not Globus) |
| -3 | Invalid destination protocol (not `file` or `globus`) |
| -4 | Failed to parse source URI |
| -5 | Failed to parse destination URI |
| -6 | Failed to get submission ID (Globus-to-Globus) |
| -7 | Failed to submit transfer (Globus-to-Globus) |
| -8 | Transfer failed or timed out (Globus-to-Globus) |
| -11 | Failed to get endpoint details (Globus-to-local) |
| -12 | Endpoint does not have HTTPS access enabled |
| -13 | HTTP download request failed |
| -14 | Failed to open local output file |
| -15 | Exception during download |
| -20 | Globus support not compiled in |

## Troubleshooting

### `GLOBUS_ACCESS_TOKEN environment variable not set`

Export the token before running the test:

```bash
export GLOBUS_ACCESS_TOKEN="your_token"
```

Or source the generated script: `source /tmp/globus_tokens.sh`

### `Token is not active` / `Bearer token is not valid`

Tokens expire after 48 hours by default. Regenerate tokens using `get_oauth_token.py` or the manual REST flow.

### `ConsentRequired`

The collection requires additional consent scopes. Re-run `get_oauth_token.py` with `--with-data-access`, or add the `data_access` scope manually:

```
https://auth.globus.org/scopes/COLLECTION_ID/data_access
```

### `Endpoint does not have HTTPS access enabled`

Globus-to-local transfers require the endpoint to expose an HTTPS server. Not all endpoints support this. Check the endpoint details:

```bash
curl -H "Authorization: Bearer $GLOBUS_ACCESS_TOKEN" \
  https://transfer.api.globus.org/v0.10/endpoint/ENDPOINT_ID | jq '.https_server'
```

If `https_server` is `null`, the endpoint does not support HTTPS downloads. Use Globus-to-Globus transfers instead.

### Transfer Timeout

The default timeout is 5 minutes (30 polls at 10-second intervals). For large files, adjust the polling parameters in `globus_file_assimilator.cc`.

### `Failed to launch CTE/CAE`

Verify that the executables are installed and in your `PATH`:

```bash
which chimaera clio_cae_omni
```

Check that `WRP_CTE_CONF` points to a valid configuration file.

## Test Files Reference

All test files are located in `context-assimilation-engine/test/integration/globus_matsci/`:

| File | Description |
|------|-------------|
| `run_test.sh` | End-to-end integration test orchestrator |
| `download_test.sh` | Standalone HTTPS download test |
| `get_oauth_token.py` | OAuth2 token generation (requires `globus-sdk`) |
| `setup_collection_consent.py` | Helper to set up collection consent scopes |
| `matsci_globus_omni.yaml` | OMNI config for Materials Science dataset |
| `wrp_runtime_conf.yaml` | Chimaera runtime config with CTE + CAE compose |
| `wrp_conf.yaml` | CTE-only config (legacy, not used by `run_test.sh`) |
| `REST_AUTH_GUIDE.md` | Detailed OAuth2 REST API reference |

## Related Documentation

- [OMNI File Format](omni.md) - Full OMNI YAML specification
- [CAE Overview](overview.md) - CAE architecture and API reference
- [CTE Documentation](../context-transfer-engine/cte.md) - CTE storage documentation
