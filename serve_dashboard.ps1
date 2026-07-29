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

function Test-IsClientDisconnect([Exception]$Exception) {
    $current = $Exception
    while ($null -ne $current) {
        $message = [string]$current.Message
        if ($message -match "(?i)(connection was aborted|connection.*forcibly closed|transport connection|broken pipe|connection reset by peer|existing connection was closed)") {
            return $true
        }
        $current = $current.InnerException
    }
    return $false
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

function Get-CacheControl([string]$RequestPath) {
    if ($RequestPath -eq "index.html" -or $RequestPath -eq "data-manifest.json" -or $RequestPath.StartsWith("data-file/", [StringComparison]::OrdinalIgnoreCase)) {
        return "no-cache"
    }
    return "public, max-age=3600"
}

function Get-FileEtag([IO.FileInfo]$File) {
    return 'W/"{0:x}-{1:x}"' -f $File.Length, $File.LastWriteTimeUtc.Ticks
}

function Write-Headers {
    param(
        $Stream,
        [int]$StatusCode,
        [string]$StatusText,
        [string]$ContentType,
        [long]$ContentLength,
        [string]$CacheControl,
        [string]$LastModified = "",
        [string]$Etag = ""
    )

    $optional = ""
    if (-not [string]::IsNullOrWhiteSpace($LastModified)) { $optional += "Last-Modified: $LastModified`r`n" }
    if (-not [string]::IsNullOrWhiteSpace($Etag)) { $optional += "ETag: $Etag`r`n" }
    $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $ContentLength`r`nCache-Control: $CacheControl`r`n$optional" + "Connection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
}

function Send-BytesResponse {
    param(
        $Stream,
        [int]$StatusCode,
        [string]$StatusText,
        [string]$ContentType,
        [byte[]]$Body,
        [string]$CacheControl = "no-cache",
        [string]$LastModified = "",
        [string]$Etag = ""
    )

    Write-Headers $Stream $StatusCode $StatusText $ContentType $Body.LongLength $CacheControl $LastModified $Etag
    if ($Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
    $Stream.Flush()
}

function Send-NotModified {
    param($Stream, [string]$CacheControl, [string]$LastModified, [string]$Etag)
    Write-Headers $Stream 304 "Not Modified" "text/plain; charset=utf-8" 0 $CacheControl $LastModified $Etag
    $Stream.Flush()
}

function Send-FileResponse {
    param($Stream, [IO.FileInfo]$File, [string]$RequestPath, [hashtable]$Headers)

    $etag = Get-FileEtag $File
    $lastModified = $File.LastWriteTimeUtc.ToString("R")
    $cacheControl = Get-CacheControl $RequestPath
    if ($Headers.ContainsKey("if-none-match") -and $Headers["if-none-match"] -eq $etag) {
        Send-NotModified $Stream $cacheControl $lastModified $etag
        return
    }

    Write-Headers $Stream 200 "OK" (Get-ContentType $File.FullName) $File.Length $cacheControl $lastModified $etag
    $fileStream = [IO.File]::Open($File.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
        $fileStream.CopyTo($Stream, 65536)
        $Stream.Flush()
    }
    finally {
        $fileStream.Dispose()
    }
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
                path = "data-file/$($_.Name).bin"
                size = $_.Length
                lastModified = $_.LastWriteTimeUtc.ToString("o")
                extension = $_.Extension.ToLowerInvariant()
            }
        })
    }
    return ConvertTo-Json -InputObject @($Items) -Compress
}

function Get-RequestHeaders($Reader) {
    $headers = @{}
    while (($line = $Reader.ReadLine()) -ne $null -and $line -ne "") {
        $separator = $line.IndexOf(":")
        if ($separator -lt 1) { continue }
        $name = $line.Substring(0, $separator).Trim().ToLowerInvariant()
        $value = $line.Substring($separator + 1).Trim()
        $headers[$name] = $value
    }
    return $headers
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
            $Headers = Get-RequestHeaders $Reader

            if ([string]::IsNullOrWhiteSpace($RequestLine)) {
                Send-BytesResponse $Stream 400 "Bad Request" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Bad request"))
                continue
            }

            $Parts = $RequestLine.Split(' ')
            $RawPath = if ($Parts.Length -ge 2) { $Parts[1] } else { "/" }
            $PathOnly = $RawPath.Split('?')[0]
            $RequestPath = [Uri]::UnescapeDataString($PathOnly.TrimStart('/'))
            if ([string]::IsNullOrWhiteSpace($RequestPath)) { $RequestPath = "index.html" }

            if ($RequestPath -eq "shutdown") {
                Send-BytesResponse $Stream 200 "OK" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Dashboard server stopping."))
                Write-Log "Shutdown requested."
                $Running = $false
                continue
            }

            if ($RequestPath -eq "data-manifest.json") {
                $Manifest = Get-DataManifestJson
                $Body = [Text.Encoding]::UTF8.GetBytes($Manifest)
                $Etag = 'W/"manifest-{0:x}"' -f ([Math]::Abs($Manifest.GetHashCode()))
                if ($Headers.ContainsKey("if-none-match") -and $Headers["if-none-match"] -eq $Etag) {
                    Send-NotModified $Stream "no-cache" "" $Etag
                }
                else {
                    Send-BytesResponse $Stream 200 "OK" "application/json; charset=utf-8" $Body "no-cache" "" $Etag
                }
                continue
            }

            if ($RequestPath.StartsWith("data-file/", [StringComparison]::OrdinalIgnoreCase) -and $RequestPath.EndsWith(".bin", [StringComparison]::OrdinalIgnoreCase)) {
                $StoredName = $RequestPath.Substring(10, $RequestPath.Length - 14)
                $DataRoot = [IO.Path]::GetFullPath((Join-Path $Root "data") + [IO.Path]::DirectorySeparatorChar)
                $Candidate = [IO.Path]::GetFullPath((Join-Path $DataRoot $StoredName))
                $AllowedExtension = [IO.Path]::GetExtension($Candidate).ToLowerInvariant() -in @(".xlsx", ".pdf")
                if ([IO.Path]::GetFileName($StoredName) -ne $StoredName -or -not $Candidate.StartsWith($DataRoot, [StringComparison]::OrdinalIgnoreCase) -or -not $AllowedExtension -or -not (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
                    Send-BytesResponse $Stream 404 "Not Found" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Data file not found"))
                    continue
                }
                Send-FileResponse $Stream (Get-Item -LiteralPath $Candidate) $RequestPath $Headers
                continue
            }

            $Candidate = [IO.Path]::GetFullPath((Join-Path $Root $RequestPath))
            $RootFull = [IO.Path]::GetFullPath($Root + [IO.Path]::DirectorySeparatorChar)
            if (-not $Candidate.StartsWith($RootFull, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $Candidate -PathType Leaf)) {
                Send-BytesResponse $Stream 404 "Not Found" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Not found"))
                continue
            }

            Send-FileResponse $Stream (Get-Item -LiteralPath $Candidate) $RequestPath $Headers
        }
        catch {
            if (-not (Test-IsClientDisconnect $_.Exception)) {
                Write-Log ("Request failed: " + $_.Exception.Message)
            }
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
