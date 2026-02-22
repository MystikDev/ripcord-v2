$env:PATH = "C:\Users\jhest\.cargo\bin;C:\Users\jhest\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin;" + $env:PATH
Set-Location C:\Users\jhest\Ripcord\apps\desktop
npx tauri build
