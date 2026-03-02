$env:PATH = "C:\Users\jhest\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin;C:\Users\jhest\.cargo\bin;" + $env:PATH
$keyContent = (Get-Content "C:\Users\jhest\Ripcord\apps\desktop\~\.tauri\ripcord.key" -Raw) -replace '\r\n',"`n" -replace '\r',"`n"
$env:TAURI_SIGNING_PRIVATE_KEY = $keyContent.TrimEnd()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
Write-Host "Key length:" $env:TAURI_SIGNING_PRIVATE_KEY.Length
Write-Host "Cargo version:" (cargo --version)
Set-Location "C:\Users\jhest\Ripcord\apps\desktop"
pnpm run tauri:build
