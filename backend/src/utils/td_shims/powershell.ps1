# TD shim for PowerShell
# Usage: scheduler dot-sources this file before running user script.
# Provides global variable $global:TD as a hashtable-like object with methods.

function ConvertFrom-TaskDogGlobals {
  param([string]$Json)
  try { return $Json | ConvertFrom-Json } catch { return @{} }
}

$tdMap = ConvertFrom-TaskDogGlobals -Json $env:TASKDOG_GLOBALS_JSON
if (-not $tdMap) { $tdMap = @{} }

# Create a PSCustomObject with dynamic property access and a Set method
$TD = [pscustomobject]@{}
$TD | Add-Member -MemberType ScriptMethod -Name set -Value {
  param([string]$key, [string]$value, [bool]$secret=$false)
  try {
    $api = $env:TASKDOG_API_URL
    if (-not $api) { $api = 'http://127.0.0.1:3001' }
    $payload = @{ key=$key; value=$value; secret=$secret } | ConvertTo-Json -Compress
    $resp = Invoke-RestMethod -Method Post -Uri "$api/api/config/globals/set" -Body $payload -ContentType 'application/json' -TimeoutSec 8
    if ($resp -and $resp.success) {
      $script:tdMap[$key] = $value
      return $true
    }
  } catch {
    Write-Error ("TD.set failed: " + $_.Exception.Message) | Out-Null
  }
  return $false
}

# Implement property getter via PSDefaultParameterValues-like behavior using dynamic member
$TD | Add-Member -MemberType ScriptMethod -Name GetKeys -Value { return $script:tdMap.Keys }
$TD | Add-Member -MemberType ScriptMethod -Name Get -Value { param($k) return $script:tdMap[$k] }

# Expose $TD to global scope and also as function for dot notation with non-ASCII keys
$global:TD = $TD

# Enable property-like access using ETS: when accessing $TD.<name>, PS tries NoteProperty first;
# we'll add known keys as NoteProperty for convenience (works for ASCII-safe names)
foreach ($k in $tdMap.Keys) {
  try { $TD | Add-Member -NotePropertyName $k -NotePropertyValue $tdMap[$k] -Force } catch {}
}
