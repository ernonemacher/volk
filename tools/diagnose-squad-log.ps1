<#
.SYNOPSIS
    Diagnostic for the Squad client log.

.DESCRIPTION
    Finds out what Squad records in its local log, to decide whether match state
    (objective captures, tickets, layer changes) can be read from it without
    server admin access.

    Read only. Changes nothing, moves nothing, deletes nothing.

    Output is raw: lines exactly as they appear in the log.

.PARAMETER Watch
    Instead of analysing the existing log, follows it live and prints only the
    interesting lines as the game writes them. Use during a match. Ctrl+C stops.

.PARAMETER LogPath
    Path to the log, if auto-detection fails.

.PARAMETER Export
    Writes a filtered extract to disk for later analysis.

.EXAMPLE
    .\diagnose-squad-log.ps1
    Analyses the current log and prints the summary.

.EXAMPLE
    .\diagnose-squad-log.ps1 -Watch
    Follows the log live during a match.

.EXAMPLE
    .\diagnose-squad-log.ps1 -Export
    Analyses and writes the extract to squad-log-extract.txt
#>

[CmdletBinding()]
param(
    [switch]$Watch,
    [string]$LogPath,
    [switch]$Export
)

$ErrorActionPreference = 'Stop'

# --- terms of interest -----------------------------------------------------
# Grouped by goal. The central question is whether an objective capture event
# exists at all; the rest is useful context.

$Terms = [ordered]@{
    'OBJECTIVE'   = 'CaptureZone|CapturePoint|Objective|FlagState|CaptureProgress|RAAS|\bAAS\b|Invasion'
    'TICKETS'     = 'Ticket|RoundScore|TeamScore'
    'ROUND'       = 'RoundEnded|RoundStart|NewGame|MatchState|GameState|StagingPhase'
    'MAP/LAYER'   = 'LoadMap|SeamlessTravel|LogWorld|LayerName|CurrentLayer'
    'MARKER/PING' = 'MapMarker|Marker|\bPing\b|SquadMarker'
    'TEAM/SQUAD'  = 'LogSquad:|TeamID|SquadID|CreateSquad'
}

# --- util ------------------------------------------------------------------

function Write-Heading($text) {
    Write-Host ''
    Write-Host ('=' * 72) -ForegroundColor DarkGray
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host ('=' * 72) -ForegroundColor DarkGray
}

function Find-SquadLog {
    param([string]$Given)

    if ($Given) {
        if (Test-Path -LiteralPath $Given) { return (Resolve-Path $Given).Path }
        throw "Given path does not exist: $Given"
    }

    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'SquadGame\Saved\Logs\SquadGame.log'),
        (Join-Path $env:LOCALAPPDATA 'SquadGame\Saved\Logs\Squad.log')
    )

    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { return $c }
    }

    # wider sweep, in case Squad is installed somewhere non-standard
    $folders = @(
        (Join-Path $env:LOCALAPPDATA 'SquadGame\Saved\Logs'),
        (Join-Path $env:USERPROFILE  'Documents\My Games\SquadGame\Saved\Logs')
    ) | Where-Object { Test-Path -LiteralPath $_ }

    foreach ($p in $folders) {
        $newest = Get-ChildItem -LiteralPath $p -Filter '*.log' -ErrorAction SilentlyContinue |
                       Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($newest) { return $newest.FullName }
    }

    return $null
}

function Read-LockedFile {
    <#
        Squad keeps the log open for writing while it runs.
        Opening with FileShare ReadWrite avoids the file-in-use error.
    #>
    param([string]$Path)

    $fs = [System.IO.File]::Open(
        $Path,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::ReadWrite
    )
    try {
        $sr = New-Object System.IO.StreamReader($fs)
        try { return $sr.ReadToEnd() -split "`r?`n" }
        finally { $sr.Dispose() }
    }
    finally { $fs.Dispose() }
}

# --- localizacao -----------------------------------------------------------

Write-Heading 'SQUAD CLIENT LOG DIAGNOSTIC'

$log = Find-SquadLog -Given $LogPath

if (-not $log) {
    Write-Host 'Log not found.' -ForegroundColor Red
    Write-Host ''
    Write-Host 'Looked in:'
    Write-Host "  $env:LOCALAPPDATA\SquadGame\Saved\Logs\"
    Write-Host "  $env:USERPROFILE\Documents\My Games\SquadGame\Saved\Logs\"
    Write-Host ''
    Write-Host 'If you know the path, run it like this:'
    Write-Host '  .\diagnose-squad-log.ps1 -LogPath "C:\path\SquadGame.log"' -ForegroundColor Yellow
    exit 1
}

$info = Get-Item -LiteralPath $log
Write-Host "File     : $log"
Write-Host ("Size     : {0:N1} MB" -f ($info.Length / 1MB))
Write-Host "Modified : $($info.LastWriteTime)"

$ageMin = [int]((Get-Date) - $info.LastWriteTime).TotalMinutes
if ($ageMin -gt 10) {
    Write-Host ''
    Write-Host "WARNING: nothing has been written to the log for $ageMin minutes." -ForegroundColor Yellow
    Write-Host 'For this to mean anything, run it with Squad open, ideally during' -ForegroundColor Yellow
    Write-Host 'a match with objectives being captured.' -ForegroundColor Yellow
}

# --- modo watch ------------------------------------------------------------

if ($Watch) {
    Write-Heading 'LIVE MODE'
    Write-Host 'Following. Join a match and capture an objective.'
    Write-Host 'Only relevant lines show up here. Ctrl+C stops.'
    Write-Host ''

    $everything = ($Terms.Values -join '|')

    # Hand-rolled tail instead of Get-Content -Wait: Squad keeps the log open
    # for writing, and FileShare ReadWrite is needed to avoid a sharing
    # violation while the game runs.
    $fs = [System.IO.File]::Open(
        $log,
        [System.IO.FileMode]::Open,
        [System.IO.FileAccess]::Read,
        [System.IO.FileShare]::ReadWrite
    )
    try {
        $fs.Seek(0, [System.IO.SeekOrigin]::End) | Out-Null
        $sr = New-Object System.IO.StreamReader($fs)
        while ($true) {
            $line = $sr.ReadLine()
            if ($null -eq $line) { Start-Sleep -Milliseconds 250; continue }
            if ($line -notmatch $everything) { continue }

            $category = '?'
            foreach ($k in $Terms.Keys) {
                if ($line -match $Terms[$k]) { $category = $k; break }
            }
            $colour = switch -Wildcard ($category) {
                'OBJECTIVE*' { 'Green' }
                'TICKETS*'   { 'Cyan' }
                'MARKER*'    { 'Magenta' }
                default      { 'Gray' }
            }
            Write-Host "[$category] " -ForegroundColor $colour -NoNewline
            Write-Host $line
        }
    }
    finally { $fs.Dispose() }
    exit 0
}

# --- analise ---------------------------------------------------------------

Write-Host ''
Write-Host 'Reading the file...' -ForegroundColor DarkGray
$lines = Read-LockedFile -Path $log
Write-Host "$($lines.Count) lines."

# Unreal log categories present, ordered by volume. This is what reveals
# categories worth searching that nobody thought to look for.
Write-Heading 'CATEGORIES PRESENT IN THE LOG (top 25)'

$categories = @{}
foreach ($l in $lines) {
    if ($l -match '(Log\w+):') {
        $c = $Matches[1]
        if ($categories.ContainsKey($c)) { $categories[$c]++ } else { $categories[$c] = 1 }
    }
}

if ($categories.Count -eq 0) {
    Write-Host 'No categories in the expected format. The log may use another layout.' -ForegroundColor Yellow
} else {
    $categories.GetEnumerator() |
        Sort-Object Value -Descending |
        Select-Object -First 25 |
        ForEach-Object { '{0,-34} {1,7}' -f $_.Key, $_.Value } |
        Write-Host
}

# --- search by term --------------------------------------------------------

Write-Heading 'RESULTS BY CATEGORY OF INTEREST'

$found = [ordered]@{}
$total = 0

foreach ($name in $Terms.Keys) {
    $hits = $lines | Where-Object { $_ -match $Terms[$name] }
    $found[$name] = $hits
    $total += $hits.Count

    $n = $hits.Count
    $colour = if ($n -gt 0) { 'Green' } else { 'DarkGray' }
    $mark = if ($n -gt 0) { 'OK  ' } else { '--  ' }
    Write-Host ('{0}{1,-20} {2,6} lines' -f $mark, $name, $n) -ForegroundColor $colour
}

# --- samples ---------------------------------------------------------------

Write-Heading 'SAMPLES (up to 8 lines per category)'

foreach ($name in $found.Keys) {
    $hits = $found[$name]
    if ($hits.Count -eq 0) { continue }

    Write-Host ''
    Write-Host "--- $name ---" -ForegroundColor Yellow

    # distinct lines, most recent first
    $hits |
        Select-Object -Last 400 |
        Select-Object -Unique |
        Select-Object -Last 8 |
        ForEach-Object { Write-Host "  $_" }
}

# --- verdict ---------------------------------------------------------------

Write-Heading 'VERDICT'

$objectiveHits = $found['OBJECTIVE'].Count

if ($objectiveHits -gt 0) {
    Write-Host 'The log carries objective-related entries.' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Next step: confirm whether those lines say WHO captured and WHEN,'
    Write-Host 'or whether they are only game-mode asset loading.'
    Write-Host 'Run with -Watch during a capture to see whether anything new appears'
    Write-Host 'at the exact moment an objective flips.'
} else {
    Write-Host 'No objective entries found.' -ForegroundColor Red
    Write-Host ''
    Write-Host 'If this log covers a full match, the log route is ruled out and only'
    Write-Host 'pixel probing is left.'
    Write-Host 'Before concluding, run with -Watch during a match: some events appear'
    Write-Host 'only in real time and may have been rotated out of this file.'
}

# --- export ----------------------------------------------------------------

if ($Export) {
    $out = Join-Path (Get-Location) 'squad-log-extract.txt'
    $buffer = New-Object System.Collections.Generic.List[string]

    $buffer.Add("Source : $log")
    $buffer.Add("Date   : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
    $buffer.Add("Lines  : $($lines.Count)")
    $buffer.Add('')

    foreach ($name in $found.Keys) {
        $hits = $found[$name]
        $buffer.Add("### $name ($($hits.Count) lines)")
        $hits |
            Select-Object -Last 150 |
            ForEach-Object { $buffer.Add('  ' + $_) }
        $buffer.Add('')
    }

    $buffer | Set-Content -LiteralPath $out -Encoding UTF8
    Write-Host ''
    Write-Host "Extract saved to: $out" -ForegroundColor Green
}

Write-Host ''
