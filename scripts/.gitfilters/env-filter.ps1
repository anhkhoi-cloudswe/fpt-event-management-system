#!/usr/bin/env pwsh
param([string]$mode)

# Read stdin fully
$stdin = [Console]::In.ReadToEnd()

if ($mode -eq 'clean') {
    $lines = $stdin -split "\r?\n"
    foreach ($line in $lines) {
        if ($line -match '^\s*(#|$)') {
            Write-Output $line
            continue
        }

        if ($line -match '^\s*(export\s+)?([^=]+)=(.*)$') {
            $prefix = $matches[1]
            if ($null -eq $prefix) { $prefix = '' }
            $key = $matches[2].Trim()
            Write-Output ("${prefix}${key}=<REDACTED>")
        } else {
            Write-Output $line
        }
    }
} else {
    # smudge / default: passthrough (returns stored blob as-is)
    Write-Output $stdin
}
