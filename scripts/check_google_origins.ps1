<#
Probe Google to see which page origins the OAuth Web client currently accepts.

Usage (backend must be running):  .\scripts\check_google_origins.ps1
No secrets are used: it only sends the public client id and an origin to Google's
authorization endpoint and reports whether Google answers origin_mismatch.
#>
param([string]$Api = "http://127.0.0.1:8000")

$cfg = Invoke-RestMethod "$Api/api/auth/google/config"
if (-not $cfg.enabled) { Write-Host "Google Sign-In is NOT enabled on the backend." -ForegroundColor Red; exit 1 }
Write-Host "client_id: $($cfg.client_id)  (looks_valid=$($cfg.client_id_looks_valid))"

foreach ($origin in $cfg.required_origins) {
    $enc = [uri]::EscapeDataString($origin)
    $url = "https://accounts.google.com/o/oauth2/auth?client_id=$($cfg.client_id)&redirect_uri=postmessage&response_type=code&scope=openid%20email%20profile&origin=$enc&gsiwebsdk=3&flowName=GeneralOAuthFlow&ux_mode=popup"
    $final = curl.exe -s -L --max-time 20 -o NUL -w "%{url_effective}" $url
    if ($final -match "signin/oauth/error") {
        Write-Host ("[MISSING] {0}  -> add to Authorized JavaScript origins" -f $origin) -ForegroundColor Red
    } else {
        Write-Host ("[ok]      {0}" -f $origin) -ForegroundColor Green
    }
}
