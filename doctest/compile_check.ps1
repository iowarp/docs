# Compile-only doctest check. Compiles each extracted example TU against the
# real clio_ctp headers with the same include dirs / defines / std level the
# build uses, via a response file under a VS dev environment (vcvars64).
# Reports pass/fail per TU with the first error. A pass means the example uses
# only real, current APIs (that is what makes a doc example "directly tested").
#
#   powershell -File docs/doctest/compile_check.ps1 -OutDir <dir of .cc>
param(
  [Parameter(Mandatory = $true)][string]$OutDir,
  [switch]$Runtime,  # add context-runtime (clio_run) include dirs + defines
  [string]$Repo = "C:\Users\llogan\Documents\Projects\core",
  [string]$Build = "build-stackless",
  [string]$Vcvars = "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat"
)
$ErrorActionPreference = 'Stop'

# Include dirs (real source + build-generated config + vcpkg deps).
$incDirs = @(
  "context-transport-primitives\include",
  "context-runtime\test",
  "$Build\context-transport-primitives\include",
  "$Build\context-transport-primitives\src\include",
  "$Build\vcpkg_installed\x64-windows\include"
)
if ($Runtime) {
  $incDirs += @(
    "context-runtime\include",
    "context-runtime\modules\admin\include",
    "context-runtime\modules\bdev\include",
    "context-runtime\modules\MOD_NAME\include"
  )
}
$inc = $incDirs | ForEach-Object { '/I"' + (Join-Path $Repo $_) + '"' }

# Compile defines mirroring the clio_ctp_host build (consumer side: no *_EXPORTS).
$def = @(
  'WIN32', '_WINDOWS', '_MBCS', 'NOMINMAX', '_CRT_SECURE_NO_DEPRECATE',
  'CTP_COMPILER_MSVC=1', 'CTP_COMPILER_GNU=0',
  'CTP_ENABLE_WINDOWS_SYSINFO=1', 'CTP_ENABLE_PROCFS_SYSINFO=0',
  'CTP_ENABLE_DOXYGEN=0', 'CTP_DEBUG_LOCK=0',
  'CTP_DEFAULT_ALLOC_T=ctp::ipc::ThreadLocalAllocator',
  'CTP_ENABLE_DLL_EXPORT=1', 'CTP_LOG_LEVEL=1',
  'CTP_ENABLE_OPENMP=0', 'CTP_ENABLE_PTHREADS=0', 'CTP_ENABLE_WINDOWS_THREADS=1',
  'CTP_ENABLE_ZMQ=1',
  'CTP_DEFAULT_THREAD_MODEL=ctp::thread::StdThread',
  'CTP_DEFAULT_THREAD_MODEL_GPU=ctp::thread::StdThread'
)
if ($Runtime) {
  # Match the clio_run_cxx build (consumer side: no *_EXPORTS / BUILDING_DLL).
  $def += @('CTP_ENABLE_CEREAL=1', 'CTP_ENABLE_LIGHTBEAM=1')
}
$def = $def | ForEach-Object { '/D' + $_ }

$common = @('/nologo', '/c', '/std:c++20', '/EHsc', '/Zc:__cplusplus',
            '/permissive-', '/wd4244', '/wd4267') + $inc + $def

$scratch = Join-Path $env:TEMP 'doctest_obj'
New-Item -ItemType Directory -Force $scratch | Out-Null

$pass = 0; $fail = 0; $fails = @()
foreach ($cc in (Get-ChildItem $OutDir -Filter *.cc | Sort-Object Name)) {
  $rsp = Join-Path $scratch ($cc.BaseName + '.rsp')
  $obj = Join-Path $scratch ($cc.BaseName + '.obj')
  Set-Content -Path $rsp -Encoding ascii -Value (
    $common + @('/Fo"' + $obj + '"', '"' + $cc.FullName + '"'))
  $log = Join-Path $scratch ($cc.BaseName + '.log')
  & cmd.exe /c "`"$Vcvars`" >nul 2>&1 && cl.exe @`"$rsp`"" > $log 2>&1
  if ($LASTEXITCODE -eq 0) {
    $pass++; "PASS  $($cc.Name)"
  } else {
    $fail++; $fails += $cc.Name
    $err = (Get-Content $log | Where-Object { $_ -match ': error ' } | Select-Object -First 2) -join '  ||  '
    "FAIL  $($cc.Name)`n        $err"
  }
}
""
"=== $pass passed, $fail failed ==="
if ($fail) { "failures: " + ($fails -join ', ') }
