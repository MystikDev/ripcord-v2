$env:PATH = "C:\Users\jhest\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin;C:\Users\jhest\.cargo\bin;" + $env:PATH
Write-Host "Cargo version:" (cargo --version)
Set-Location "C:\Users\jhest\Ripcord\apps\desktop"
pnpm run tauri:build
