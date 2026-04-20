`$filesToFix = @(
    'c:\AK\HOCKI6\OJT\Project\fpt-event-management-system\frontend\src\pages\EventRequestEdit.tsx',
    'c:\AK\HOCKI6\OJT\Project\fpt-event-management-system\frontend\src\pages\EventRequests.tsx',
    'c:\AK\HOCKI6\OJT\Project\fpt-event-management-system\frontend\src\pages\GuestLanding.tsx',
    'c:\AK\HOCKI6\OJT\Project\fpt-event-management-system\frontend\src\pages\MyBills.tsx',
    'c:\AK\HOCKI6\OJT\Project\fpt-event-management-system\frontend\src\pages\MyBills_New.tsx',
    'c:\AK\HOCKI6\OJT\Project\fpt-event-management-system\frontend\src\pages\MyTickets_New.tsx',
    'c:\AK\HOCKI6\OJT\Project\fpt-event-management-system\frontend\src\pages\OrganizerEventRequests.tsx',
    'c:\AK\HOCKI6\OJT\Project\fpt-event-management-system\frontend\src\pages\ReportRequests.tsx',
    'c:\AK\HOCKI6\OJT\Project\fpt-event-management-system\frontend\src\pages\StaffEventRequests.tsx',
    'c:\AK\HOCKI6\OJT\Project\fpt-event-management-system\frontend\src\pages\Reports.tsx',
    'c:\AK\HOCKI6\OJT\Project\fpt-event-management-system\frontend\src\pages\SystemConfig.tsx',
    'c:\AK\HOCKI6\OJT\Project\fpt-event-management-system\frontend\src\pages\CheckIn.tsx'
)

Write-Host "Starting comprehensive fix..." -ForegroundColor Green
`$totalRemoved = 0
`$totalReplaced = 0

foreach (`$file in `$filesToFix) {
    `$fileName = Split-Path `$file -Leaf
    Write-Host "Processing: `$fileName" -ForegroundColor Cyan
    
    if (-not (Test-Path `$file)) {
        Write-Host "  Not found" -ForegroundColor Red
        continue
    }
    
    `$content = Get-Content `$file -Raw
    `$changes = 0
    
    # Remove const token lines
    `$pat1 = "^\s*const\s+token\s*=\s*['\"]cookie-auth['\"].*$"
    `$m1 = [regex]::Matches(`$content, `$pat1, 'Multiline')
    if (`$m1.Count -gt 0) {
        Write-Host "    - Removed `$(`$m1.Count) token const(s)"
        `$content = [regex]::Replace(`$content, `$pat1, "", 'Multiline')
        `$changes += `$m1.Count
        `$totalRemoved += `$m1.Count
    }
    
    # Replace Authorization Bearer token
    `$pat2 = "Authorization:\s*\`Bearer\s*\$\{token\}\`,"
    `$m2 = [regex]::Matches(`$content, `$pat2)
    if (`$m2.Count -gt 0) {
        Write-Host "    - Replaced `$(`$m2.Count) Bearer token(s)"
        `$content = [regex]::Replace(`$content, `$pat2, "credentials: 'include',")
        `$changes += `$m2.Count
        `$totalReplaced += `$m2.Count
    }
    
    # Replace Authorization Bearer || cookie-auth
    `$pat3 = "Authorization:\s*\`Bearer\s*\$\{token\s*\|\|\s*['\"]cookie-auth['\"]\}\`,"
    `$m3 = [regex]::Matches(`$content, `$pat3)
    if (`$m3.Count -gt 0) {
        Write-Host "    - Replaced `$(`$m3.Count) fallback(s)"
        `$content = [regex]::Replace(`$content, `$pat3, "credentials: 'include',")
        `$changes += `$m3.Count
        `$totalReplaced += `$m3.Count
    }
    
    # Replace Authorization Bearer ?? cookie-auth
    `$pat4 = "Authorization:\s*\`Bearer\s*\$\{token\s*\?\?\s*['\"]cookie-auth['\"]\}\`,"
    `$m4 = [regex]::Matches(`$content, `$pat4)
    if (`$m4.Count -gt 0) {
        Write-Host "    - Replaced `$(`$m4.Count) nullish(es)"
        `$content = [regex]::Replace(`$content, `$pat4, "credentials: 'include',")
        `$changes += `$m4.Count
        `$totalReplaced += `$m4.Count
    }
    
    if (`$changes -gt 0) {
        Set-Content `$file -Value `$content -NoNewline
        Write-Host "    ? Saved `$changes change(s)" -ForegroundColor Green
    } else {
        Write-Host "    - No changes"
    }
}

Write-Host ""
Write-Host "===== FINAL REPORT =====" -ForegroundColor Green
Write-Host "Lines removed: `$totalRemoved"
Write-Host "Replacements: `$totalReplaced"
Write-Host "Total: `$(`$totalRemoved + `$totalReplaced)"
Write-Host "========================" -ForegroundColor Green