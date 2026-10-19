param(
    [string]$Mode = 'watch',
    [string]$Action = ''
)

# Reads and controls "what's playing" through the Windows System Media Transport Controls (SMTC),
# the same source the Windows volume flyout uses. Works for Spotify, browsers, Media Player, VLC...
#   -Mode watch    : prints one JSON line whenever the track or play state changes (and every ~5 s)
#   -Mode control  : -Action playpause | next | previous

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($operation, [Type]$resultType) {
    $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($operation))
    $task.Wait(-1) | Out-Null
    $task.Result
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$streamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType]

$manager = Await ($managerType::RequestAsync()) $managerType

function Emit($payload) {
    [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
}

if ($Mode -eq 'control') {
    $session = $manager.GetCurrentSession()
    if ($session) {
        switch ($Action) {
            'playpause' { [void](Await ($session.TryTogglePlayPauseAsync()) ([bool])) }
            'next'      { [void](Await ($session.TrySkipNextAsync()) ([bool])) }
            'previous'  { [void](Await ($session.TrySkipPreviousAsync()) ([bool])) }
        }
    }
    exit 0
}

$asStreamMethod = ([System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsStream' -and $_.GetParameters().Count -eq 1
})[0]

function Get-Art($props) {
    try {
        $ref = $props.Thumbnail
        if (-not $ref) { return $null }
        $stream = Await ($ref.OpenReadAsync()) $streamType
        if (-not $stream) { return $null }
        $net = $asStreamMethod.Invoke($null, @($stream))
        if (-not $net) { return $null }
        $memory = New-Object System.IO.MemoryStream
        $net.CopyTo($memory)
        $bytes = $memory.ToArray()
        if ($bytes.Length -eq 0 -or $bytes.Length -gt 3000000) { return $null }
        
        $ct = '' + $stream.ContentType
        if (-not $ct) {
            if ($bytes.Length -gt 4 -and $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50 -and $bytes[2] -eq 0x4E -and $bytes[3] -eq 0x47) {
                $ct = 'image/png'
            } else {
                $ct = 'image/jpeg'
            }
        }
        return 'data:' + $ct + ';base64,' + [Convert]::ToBase64String($bytes)
    } catch {
        return $null
    }
}

$lastKey = ''
$lastStatus = ''
$lastError = ''
$lastEmit = [DateTime]::MinValue
$artFor = ''
$artTries = 0
$lastArt = $null

while ($true) {
    try {
        $session = $manager.GetCurrentSession()
        if (-not $session) {
            if ($lastKey -ne 'none') {
                Emit @{ ok = $false }
                $lastKey = 'none'
                $lastStatus = ''
                $lastArt = $null
            }
        } else {
            $props = Await ($session.TryGetMediaPropertiesAsync()) $propsType
            $playback = $session.GetPlaybackInfo()
            $timeline = $session.GetTimelineProperties()
            $status = $playback.PlaybackStatus.ToString()
            $key = '' + $session.SourceAppUserModelId + '|' + $props.Title + '|' + $props.Artist

            if ($key -ne $lastKey) {
                $artTries = 0
                $artFor = ''
                $lastArt = $null
            }

            $payload = @{
                ok     = $true
                key    = $key
                app    = '' + $session.SourceAppUserModelId
                title  = '' + $props.Title
                artist = '' + $props.Artist
                album  = '' + $props.AlbumTitle
                status = $status
                pos    = $timeline.Position.TotalSeconds
                dur    = ($timeline.EndTime - $timeline.StartTime).TotalSeconds
                art    = $lastArt
            }

            $changed = ($key -ne $lastKey) -or ($status -ne $lastStatus)

            # Some players publish the cover a moment after the title, so retry a few times.
            if ($artFor -ne $key -and $artTries -lt 10) {
                $artTries++
                $art = Get-Art $props
                if ($art) {
                    $lastArt = $art
                    $payload.art = $art
                    $artFor = $key
                    $changed = $true
                }
            }

            $now = [DateTime]::UtcNow
            if ($changed -or (($now - $lastEmit).TotalSeconds -ge 5)) {
                Emit $payload
                $lastEmit = $now
            }
            $lastKey = $key
            $lastStatus = $status
            $lastError = ''
        }
    } catch {
        $message = $_.Exception.Message
        if ($message -ne $lastError) {
            Emit @{ ok = $false; err = $message }
            $lastError = $message
        }
        $lastKey = ''
    }
    Start-Sleep -Milliseconds 1000
}
