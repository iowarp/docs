# Dynamic Libraries Guide

## Overview

The Dynamic Libraries API in Hermes Shared Memory (HSHM) provides cross-platform functionality for loading shared libraries at runtime, enabling plugin architectures and modular application design. This guide covers the `SharedLibrary` class and related patterns for dynamic library management.

## SharedLibrary Class

### Basic Library Loading

```cpp
#include "clio_ctp/introspect/system_info.h"
#include <cstdio>
#include <string>

void example() {
  // Construct + Load in one step. SharedLibrary selects dlopen() on POSIX or
  // LoadLibraryA() on Windows, so pass a platform-appropriate library name.
  // GetMathLibraryName() returns one that always exists on this OS
  // (libm.so.6 on Linux, ucrtbase.dll on Windows).
  ctp::SharedLibrary math_lib(ctp::SystemInfo::GetMathLibraryName());

  // Check whether the handle was opened.
  if (!math_lib.IsNull()) {
    printf("Library loaded successfully\n");
  } else {
    printf("Failed to load library: %s\n", math_lib.GetError().c_str());
  }

  // Deferred loading: default-construct now, Load() later. SharedLibrary is
  // move-only and closes its handle (dlclose/FreeLibrary) in the destructor.
  ctp::SharedLibrary delayed_lib;
  delayed_lib.Load(ctp::SystemInfo::GetMathLibraryName());
}
```

### Getting Symbols

```cpp
#include "clio_ctp/introspect/system_info.h"
#include <cstdio>

void example() {
  ctp::SharedLibrary math_lib(ctp::SystemInfo::GetMathLibraryName());

  // GetSymbol() returns a raw void* (dlsym/GetProcAddress). Cast it to the
  // real signature before calling. The C math library exports "sin".
  typedef double (*sin_fn)(double);
  sin_fn sine = reinterpret_cast<sin_fn>(math_lib.GetSymbol("sin"));

  if (sine != nullptr) {
    printf("sin(0.0) = %f\n", sine(0.0));
  } else {
    printf("Symbol 'sin' not found: %s\n", math_lib.GetError().c_str());
  }

  // A symbol that does not exist resolves to nullptr -- always check.
  void *missing = math_lib.GetSymbol("definitely_not_a_symbol");
  if (missing == nullptr) {
    printf("symbol not present in library\n");
  }
}
```

### Error Handling

```cpp
#include "clio_ctp/introspect/system_info.h"
#include <cstdio>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

// Helper that tries a list of candidate paths and throws on a missing symbol.
class SafeLibraryLoader {
 public:
  static bool LoadLibraryWithFallback(ctp::SharedLibrary &lib,
                                      const std::vector<std::string> &paths) {
    for (const auto &path : paths) {
      lib.Load(path);
      if (!lib.IsNull()) {
        printf("Loaded library from: %s\n", path.c_str());
        return true;
      }
      printf("Failed to load %s: %s\n", path.c_str(), lib.GetError().c_str());
    }
    return false;
  }

  static void *GetRequiredSymbol(ctp::SharedLibrary &lib,
                                 const std::string &symbol_name) {
    void *symbol = lib.GetSymbol(symbol_name);
    if (symbol == nullptr) {
      throw std::runtime_error("Required symbol '" + symbol_name +
                               "' not found: " + lib.GetError());
    }
    return symbol;
  }
};

void example() {
  ctp::SharedLibrary my_lib;
  std::vector<std::string> search_paths = {
      "./" + ctp::SystemInfo::GetMathLibraryName(),
      ctp::SystemInfo::GetMathLibraryName(),
  };

  if (SafeLibraryLoader::LoadLibraryWithFallback(my_lib, search_paths)) {
    try {
      typedef double (*sin_fn)(double);
      auto sine = reinterpret_cast<sin_fn>(
          SafeLibraryLoader::GetRequiredSymbol(my_lib, "sin"));
      printf("sin(0.0) = %f\n", sine(0.0));
    } catch (const std::exception &e) {
      std::cerr << "Error: " << e.what() << std::endl;
    }
  }
}
```

## Plugin Architecture

### Plugin Interface Definition

```cpp
// A plugin ABI you define yourself and share between the host application and
// each plugin. ctp::SharedLibrary only opens libraries and resolves symbols;
// the interface and the factory entry points below are your own contract.
class IPlugin {
 public:
  virtual ~IPlugin() = default;

  // Identification.
  virtual const char *GetName() const = 0;
  virtual const char *GetVersion() const = 0;
  virtual const char *GetDescription() const = 0;

  // Lifecycle.
  virtual bool Initialize(void *context) = 0;
  virtual void Execute() = 0;
  virtual void Shutdown() = 0;
};

// Factory entry-point signatures the host resolves with GetSymbol().
typedef IPlugin *(*CreatePluginFunc)();
typedef void (*DestroyPluginFunc)(IPlugin *);
typedef const char *(*GetPluginAPIVersionFunc)();

// Current plugin ABI version.
inline constexpr const char *kPluginApiVersion = "1.0.0";
```

### Plugin Manager Implementation

```cpp
#include "clio_ctp/introspect/system_info.h"
#include <cstdio>
#include <map>
#include <memory>
#include <string>
#include <vector>

// Minimal plugin ABI (normally in a shared header).
class IPlugin {
 public:
  virtual ~IPlugin() = default;
  virtual const char *GetName() const = 0;
  virtual const char *GetVersion() const = 0;
  virtual const char *GetDescription() const = 0;
  virtual bool Initialize(void *context) = 0;
  virtual void Execute() = 0;
  virtual void Shutdown() = 0;
};
typedef IPlugin *(*CreatePluginFunc)();
typedef void (*DestroyPluginFunc)(IPlugin *);

// Loads plugin shared libraries and owns their lifetime. Each plugin's
// SharedLibrary stays open as long as its instance is alive; the SharedLibrary
// destructor unloads it (dlclose/FreeLibrary).
class PluginManager {
 public:
  struct PluginInfo {
    std::string path;
    std::string name;
    std::string version;
    std::string description;
    bool enabled = false;
  };

 private:
  struct LoadedPlugin {
    ctp::SharedLibrary library;
    IPlugin *instance;
    DestroyPluginFunc destroy_func;
    PluginInfo info;

    LoadedPlugin(ctp::SharedLibrary &&lib, IPlugin *inst,
                 DestroyPluginFunc destroy, const PluginInfo &i)
        : library(std::move(lib)),
          instance(inst),
          destroy_func(destroy),
          info(i) {}
  };

  std::vector<std::unique_ptr<LoadedPlugin>> plugins_;
  std::map<std::string, size_t> plugin_index_;
  void *app_context_;

 public:
  explicit PluginManager(void *context = nullptr) : app_context_(context) {}

  ~PluginManager() {
    for (auto &loaded : plugins_) {
      loaded->instance->Shutdown();
      loaded->destroy_func(loaded->instance);
    }
  }

  bool LoadPlugin(const std::string &plugin_path) {
    if (IsPluginLoaded(plugin_path)) {
      return true;
    }

    ctp::SharedLibrary lib(plugin_path);
    if (lib.IsNull()) {
      fprintf(stderr, "Failed to load plugin: %s\n", lib.GetError().c_str());
      return false;
    }

    // Resolve the C factory entry points exported by the plugin.
    auto create =
        reinterpret_cast<CreatePluginFunc>(lib.GetSymbol("CreatePlugin"));
    auto destroy =
        reinterpret_cast<DestroyPluginFunc>(lib.GetSymbol("DestroyPlugin"));
    if (create == nullptr || destroy == nullptr) {
      fprintf(stderr, "Plugin missing CreatePlugin/DestroyPlugin\n");
      return false;
    }

    IPlugin *plugin = create();
    if (plugin == nullptr) {
      return false;
    }

    PluginInfo info;
    info.path = plugin_path;
    info.name = plugin->GetName();
    info.version = plugin->GetVersion();
    info.description = plugin->GetDescription();

    if (!plugin->Initialize(app_context_)) {
      destroy(plugin);
      return false;
    }
    info.enabled = true;

    size_t index = plugins_.size();
    plugin_index_[info.name] = index;
    plugins_.push_back(std::make_unique<LoadedPlugin>(std::move(lib), plugin,
                                                      destroy, info));
    return true;
  }

  // Scan a directory for shared libraries and load each one. Uses the real
  // cross-platform directory + extension helpers from ctp::SystemInfo.
  void LoadAllPlugins(const std::string &plugin_dir) {
    const std::string ext = ctp::SystemInfo::GetSharedLibExtension();
    for (const std::string &name :
         ctp::SystemInfo::ListDirectory(plugin_dir)) {
      if (name.size() >= ext.size() &&
          name.compare(name.size() - ext.size(), ext.size(), ext) == 0) {
        LoadPlugin(plugin_dir + "/" + name);
      }
    }
  }

  void ExecuteAllPlugins() {
    for (auto &loaded : plugins_) {
      if (loaded->info.enabled) {
        loaded->instance->Execute();
      }
    }
  }

  IPlugin *GetPlugin(const std::string &plugin_name) {
    auto it = plugin_index_.find(plugin_name);
    return it != plugin_index_.end() ? plugins_[it->second]->instance : nullptr;
  }

  std::vector<PluginInfo> GetPluginList() const {
    std::vector<PluginInfo> list;
    for (const auto &loaded : plugins_) {
      list.push_back(loaded->info);
    }
    return list;
  }

 private:
  bool IsPluginLoaded(const std::string &path) const {
    for (const auto &loaded : plugins_) {
      if (loaded->info.path == path) {
        return true;
      }
    }
    return false;
  }
};
```

### Example Plugin Implementation

```cpp
#include <cstdio>
#include <cstring>
#include <string>

// Minimal plugin ABI (shared header in a real project).
class IPlugin {
 public:
  virtual ~IPlugin() = default;
  virtual const char *GetName() const = 0;
  virtual const char *GetVersion() const = 0;
  virtual const char *GetDescription() const = 0;
  virtual bool Initialize(void *context) = 0;
  virtual void Execute() = 0;
  virtual void Shutdown() = 0;
};

// A concrete plugin, compiled into its own shared library.
class MyPlugin : public IPlugin {
  std::string name_ = "MyPlugin";
  std::string version_ = "1.0.0";
  std::string description_ = "Example plugin implementation";
  void *app_context_ = nullptr;

 public:
  const char *GetName() const override { return name_.c_str(); }
  const char *GetVersion() const override { return version_.c_str(); }
  const char *GetDescription() const override { return description_.c_str(); }

  bool Initialize(void *context) override {
    app_context_ = context;
    return true;
  }

  void Execute() override { printf("MyPlugin: executing\n"); }

  void Shutdown() override { printf("MyPlugin: shutting down\n"); }
};

// Factory entry points. extern "C" prevents C++ name mangling so the host can
// resolve them by plain name with SharedLibrary::GetSymbol().
extern "C" {
IPlugin *CreatePlugin() { return new MyPlugin(); }
void DestroyPlugin(IPlugin *plugin) { delete plugin; }
const char *GetPluginAPIVersion() { return "1.0.0"; }
}
```

## Cross-Platform Library Loading

### Platform-Agnostic Loader

```cpp
#include "clio_ctp/introspect/system_info.h"
#include <cstdio>
#include <sstream>
#include <string>
#include <vector>

// Builds candidate paths for a base library name using the real
// cross-platform helpers (extension, search-path env var, list separator)
// instead of hand-rolled #ifdefs.
class CrossPlatformLoader {
 public:
  static std::string MakeLibraryName(const std::string &base_name) {
    // POSIX convention adds a "lib" prefix; Windows does not.
    const std::string ext = ctp::SystemInfo::GetSharedLibExtension();
    const std::string prefix = (ext == ".dll") ? "" : "lib";
    return prefix + base_name + ext;
  }

  static bool LoadLibrary(const std::string &base_name,
                          ctp::SharedLibrary &lib) {
    for (const std::string &path : BuildSearchPaths(base_name)) {
      lib.Load(path);
      if (!lib.IsNull()) {
        printf("Loaded library from: %s\n", path.c_str());
        return true;
      }
    }
    fprintf(stderr, "Failed to find library: %s\n", base_name.c_str());
    return false;
  }

 private:
  static std::vector<std::string> BuildSearchPaths(
      const std::string &base_name) {
    std::vector<std::string> paths;
    const std::string lib_name = MakeLibraryName(base_name);

    // Current directory first.
    paths.push_back("./" + lib_name);

    // Bare name -- let the OS loader resolve it.
    paths.push_back(lib_name);

    // Every directory on the platform's library search path
    // (LD_LIBRARY_PATH on Linux, PATH on Windows).
    const std::string var = ctp::SystemInfo::GetLibrarySearchPathVar();
    const char sep = ctp::SystemInfo::GetPathListSeparator();
    std::stringstream ss(ctp::SystemInfo::Getenv(var));
    std::string dir;
    while (std::getline(ss, dir, sep)) {
      if (!dir.empty()) {
        paths.push_back(dir + "/" + lib_name);
      }
    }
    return paths;
  }
};
```

### Version-Aware Loading

```cpp
#include "clio_ctp/introspect/system_info.h"
#include <string>

// Loads a library whose ABI version is queried through an exported
// "GetLibraryVersion(int*, int*, int*)" entry point.
class VersionedLibraryLoader {
 public:
  struct Version {
    int major = 0;
    int minor = 0;
    int patch = 0;
    std::string ToString() const {
      return std::to_string(major) + "." + std::to_string(minor) + "." +
             std::to_string(patch);
    }
  };

  static bool LoadVersionedLibrary(const std::string &base_name,
                                   const Version &min_version,
                                   ctp::SharedLibrary &lib) {
    const std::string ext = ctp::SystemInfo::GetSharedLibExtension();

    // Try a version-suffixed name first, then the bare name.
    lib.Load(base_name + "-" + min_version.ToString() + ext);
    if (lib.IsNull()) {
      lib.Load(base_name + ext);
    }
    if (lib.IsNull()) {
      return false;
    }
    return CheckVersion(lib, min_version);
  }

 private:
  static bool CheckVersion(ctp::SharedLibrary &lib,
                           const Version &min_version) {
    typedef void (*GetVersionFunc)(int *, int *, int *);
    auto get_version =
        reinterpret_cast<GetVersionFunc>(lib.GetSymbol("GetLibraryVersion"));
    if (get_version == nullptr) {
      return true;  // No version export: assume compatible.
    }
    Version v;
    get_version(&v.major, &v.minor, &v.patch);
    if (v.major != min_version.major) return v.major > min_version.major;
    if (v.minor != min_version.minor) return v.minor > min_version.minor;
    return v.patch >= min_version.patch;
  }
};
```

## Advanced Plugin Features

### Hot-Reloading Plugins

```cpp
#include "clio_ctp/introspect/system_info.h"
#include <chrono>
#include <cstdio>
#include <filesystem>
#include <string>
#include <thread>

// Watches a shared-library file and reloads it when its modification time
// changes. std::filesystem::last_write_time is portable (C++17/20), so no
// platform-specific stat() is needed.
class HotReloadableLibrary {
  std::string path_;
  ctp::SharedLibrary lib_;
  std::filesystem::file_time_type stamp_{};

 public:
  explicit HotReloadableLibrary(const std::string &path) : path_(path) {
    Reload();
  }

  // Returns true if the file changed and was reloaded.
  bool CheckForUpdate() {
    std::error_code ec;
    auto mtime = std::filesystem::last_write_time(path_, ec);
    if (ec) {
      return false;
    }
    if (mtime != stamp_) {
      Reload();
      return true;
    }
    return false;
  }

  ctp::SharedLibrary &library() { return lib_; }

 private:
  void Reload() {
    std::error_code ec;
    stamp_ = std::filesystem::last_write_time(path_, ec);
    lib_.Load(path_);
    if (lib_.IsNull()) {
      fprintf(stderr, "Reload failed: %s\n", lib_.GetError().c_str());
    }
  }
};

void example() {
  HotReloadableLibrary watcher(ctp::SystemInfo::GetMathLibraryName());
  for (int i = 0; i < 3; ++i) {
    if (watcher.CheckForUpdate()) {
      printf("library reloaded\n");
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
}
```

## Complete Example: Extensible Application

```cpp
#include "clio_ctp/introspect/system_info.h"
#include <cstdio>
#include <string>
#include <vector>

// A minimal extensible host: it discovers shared libraries in a directory and
// keeps the ones that export a required set of entry points. This mirrors how
// clio's ModuleManager validates a ChiMod's symbols before using it.
class ExtensibleApplication {
  std::string plugin_dir_;
  std::vector<ctp::SharedLibrary> loaded_;

 public:
  ExtensibleApplication() {
    // Prefer an explicit env override, else the directory of this module.
    plugin_dir_ = ctp::SystemInfo::Getenv("APP_PLUGIN_DIR");
    if (plugin_dir_.empty()) {
      plugin_dir_ = ctp::SystemInfo::GetModuleDirectory();
    }
  }

  int Run() {
    const std::string ext = ctp::SystemInfo::GetSharedLibExtension();
    for (const std::string &name :
         ctp::SystemInfo::ListDirectory(plugin_dir_)) {
      if (name.size() < ext.size() ||
          name.compare(name.size() - ext.size(), ext.size(), ext) != 0) {
        continue;  // Not a shared library.
      }
      const std::string path = plugin_dir_ + "/" + name;
      ctp::SharedLibrary lib(path);
      if (lib.IsNull()) {
        fprintf(stderr, "skip %s: %s\n", path.c_str(), lib.GetError().c_str());
        continue;
      }
      if (!HasRequiredSymbols(lib)) {
        fprintf(stderr, "skip %s: missing required symbols\n", path.c_str());
        continue;
      }
      printf("loaded plugin: %s\n", name.c_str());
      loaded_.push_back(std::move(lib));
    }
    printf("loaded %zu plugins\n", loaded_.size());
    return 0;
  }

 private:
  // Keep only libraries that export the host's required entry points.
  static bool HasRequiredSymbols(ctp::SharedLibrary &lib) {
    return lib.GetSymbol("CreatePlugin") != nullptr &&
           lib.GetSymbol("DestroyPlugin") != nullptr;
  }
};

void example() {
  ExtensibleApplication app;
  app.Run();
}
```

## Best Practices

1. **Error Handling**: Always check `IsNull()` and use `GetError()` for diagnostics
2. **Symbol Verification**: Verify function pointers are not null before calling
3. **Name Mangling**: Use `extern "C"` for plugin factory functions to prevent C++ name mangling
4. **RAII Pattern**: Use move semantics and automatic cleanup via destructors
5. **Version Checking**: Implement API version checking for plugin compatibility
6. **Search Paths**: Implement flexible library search paths for deployment flexibility
7. **Platform Abstraction**: Use the `ctp::SystemInfo` helpers (`GetSharedLibExtension`, `GetLibrarySearchPathVar`, `GetPathListSeparator`) to handle platform differences
8. **Resource Management**: Ensure plugins properly clean up resources in shutdown
9. **Thread Safety**: Consider thread safety when loading/unloading plugins
10. **Documentation**: Document plugin interfaces thoroughly for third-party developers
