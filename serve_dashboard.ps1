param(
    [int]$Port = 8765
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogPath = Join-Path $Root "Dashboard_Server_Log.txt"
$Address = [Net.IPAddress]::Loopback
$Listener = [Net.Sockets.TcpListener]::new($Address, $Port)

function Write-Log([string]$Message) {
    $line = "{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $Message
    Add-Content -LiteralPath $LogPath -Value $line
    Write-Host $line
}

function Get-ContentType([string]$Path) {
    switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".html" { "text/html; charset=utf-8" }
        ".js"   { "application/javascript; charset=utf-8" }
        ".mjs"  { "application/javascript; charset=utf-8" }
        ".css"  { "text/css; charset=utf-8" }
        ".png"  { "image/png" }
        ".jpg"  { "image/jpeg" }
        ".jpeg" { "image/jpeg" }
        ".svg"  { "image/svg+xml" }
        ".json" { "application/json; charset=utf-8" }
        ".txt"  { "text/plain; charset=utf-8" }
        ".pdf"  { "application/pdf" }
        ".xlsx" { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
        default  { "application/octet-stream" }
    }
}

function Send-Response {
    param($Stream, [int]$StatusCode, [string]$StatusText, [string]$ContentType, [byte[]]$Body, [string]$LastModified = "")
    $lastModifiedHeader = if ([string]::IsNullOrWhiteSpace($LastModified)) { "" } else { "Last-Modified: $LastModified`r`n" }
    $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`n$lastModifiedHeader" + "Connection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
    $Stream.Flush()
}

function Get-DataManifestJson {
    $DataRoot = Join-Path $Root "data"
    $Items = @()
    if (Test-Path -LiteralPath $DataRoot -PathType Container) {
        $Items = @(Get-ChildItem -LiteralPath $DataRoot -File | Where-Object {
            $_.Extension.ToLowerInvariant() -in @(".xlsx", ".pdf")
        } | Sort-Object Name | ForEach-Object {
            [PSCustomObject]@{
                name = $_.Name
                path = "data/$($_.Name)"
                size = $_.Length
                lastModified = $_.LastWriteTimeUtc.ToString("o")
                extension = $_.Extension.ToLowerInvariant()
            }
        })
    }
    return ConvertTo-Json -InputObject @($Items) -Compress
}

function Get-ServedFileBytes([string]$Candidate) {
    if ([IO.Path]::GetFileName($Candidate) -ieq "index.html") {
        $Html = [IO.File]::ReadAllText($Candidate)
        $ScriptTags = @()
        if ($Html -notmatch 'smart_data_loader\.js') {
            $ScriptTags += '<script src="smart_data_loader.js"></script>'
        }
        if ($Html -notmatch 'missing_bol\.js') {
            $ScriptTags += '<script src="missing_bol.js"></script>'
        }
        $ScriptTags += '<script src="app.js"></script>'
        $Replacement = $ScriptTags -join ("`r`n  ")
        $Html = $Html.Replace('<script src="app.js"></script>', $Replacement)
        return [Text.Encoding]::UTF8.GetBytes($Html)
    }
    return [IO.File]::ReadAllBytes($Candidate)
}

try {
    $Listener.Start()
    Write-Log "Vixen Fuel Dashboard server started at http://127.0.0.1:$Port/"
    $Running = $true

    while ($Running) {
        $Client = $Listener.AcceptTcpClient()
        $Stream = $null
        $Reader = $null
        try {
            $Stream = $Client.GetStream()
            $Reader = [IO.StreamReader]::new($Stream, [Text.Encoding]::ASCII, $false, 4096, $true)
            $RequestLine = $Reader.ReadLine()
            while (($Line = $Reader.ReadLine()) -ne $null -and $Line -ne "") {}

            if ([string]::IsNullOrWhiteSpace($RequestLine)) {
                Send-Response $Stream 400 "Bad Request" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Bad request"))
                continue
            }

            $Parts = $RequestLine.Split(' ')
            $RawPath = if ($Parts.Length -ge 2) { $Parts[1] } else { "/" }
            $PathOnly = $RawPath.Split('?')[0]
            $RequestPath = [Uri]::UnescapeDataString($PathOnly.TrimStart('/'))
            if ([string]::IsNullOrWhiteSpace($RequestPath)) { $RequestPath = "index.html" }

            if ($RequestPath -eq "shutdown") {
                Send-Response $Stream 200 "OK" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Dashboard server stopping."))
                Write-Log "Shutdown requested."
                $Running = $false
                continue
            }

            if ($RequestPath -eq "data-manifest.json") {
                $Manifest = Get-DataManifestJson
                Send-Response $Stream 200 "OK" "application/json; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes($Manifest))
                continue
            }

            $Candidate = [IO.Path]::GetFullPath((Join-Path $Root $RequestPath))
            $RootFull = [IO.Path]::GetFullPath($Root + [IO.Path]::DirectorySeparatorChar)
            if (-not $Candidate.StartsWith($RootFull, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
                Send-Response $Stream 404 "Not Found" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Not found"))
                continue
            }

            $Body = Get-ServedFileBytes $Candidate
            $LastModified = (Get-Item -LiteralPath $Candidate).LastWriteTimeUtc.ToString("R")
            Send-Response $Stream 200 "OK" (Get-ContentType $Candidate) $Body $LastModified
        }
        catch {
            Write-Log ("Request failed: " + $_.Exception.Message)
        }
        finally {
            if ($null -ne $Reader) { $Reader.Dispose() }
            if ($null -ne $Stream) { $Stream.Dispose() }
            $Client.Close()
        }
    }
}
catch {
    Write-Log ("Server failed: " + $_.Exception.Message)
    exit 1
}
finally {
    $Listener.Stop()
    Write-Log "Dashboard server stopped."
}
