# Windows 內建 OCR（繁體中文）— 由 build.py 呼叫
# 用法：powershell -ExecutionPolicy Bypass -File ocr.ps1 <清單檔>
# 清單檔每行：影像路徑|輸出JSON路徑
param([string]$ListFile)

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]

function Await($op, [Type]$resultType) {
    $t = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
    $t.Wait(-1) | Out-Null
    $t.Result
}

$lang = New-Object Windows.Globalization.Language 'zh-Hant-TW'
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if ($null -eq $engine) { Write-Error 'zh-Hant-TW OCR 無法使用'; exit 1 }

foreach ($row in [System.IO.File]::ReadAllLines($ListFile, [System.Text.Encoding]::UTF8)) {
    if (-not $row.Trim()) { continue }
    $parts = $row.Split('|')
    $imgPath = $parts[0]; $outPath = $parts[1]
    try {
        $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($imgPath)) ([Windows.Storage.StorageFile])
        $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bmp = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
        $imgW = $bmp.PixelWidth; $imgH = $bmp.PixelHeight
        $lines = New-Object System.Collections.ArrayList
        foreach ($ln in $res.Lines) {
            $x0 = 1e9; $y0 = 1e9; $x1 = 0; $y1 = 0
            $txt = New-Object System.Text.StringBuilder
            foreach ($wd in $ln.Words) {
                $r = $wd.BoundingRect
                if ($r.X -lt $x0) { $x0 = $r.X }; if ($r.Y -lt $y0) { $y0 = $r.Y }
                if ($r.X + $r.Width -gt $x1) { $x1 = $r.X + $r.Width }
                if ($r.Y + $r.Height -gt $y1) { $y1 = $r.Y + $r.Height }
                [void]$txt.Append($wd.Text).Append(' ')
            }
            [void]$lines.Add([ordered]@{ t = $txt.ToString().Trim(); b = @([int]$x0, [int]$y0, [int]$x1, [int]$y1) })
        }
        $obj = [ordered]@{ w = $imgW; h = $imgH; lines = $lines }
        $json = ConvertTo-Json $obj -Depth 5 -Compress
        [System.IO.File]::WriteAllText($outPath, $json, (New-Object System.Text.UTF8Encoding $false))
        $stream.Dispose()
        Write-Output "OK $outPath"
    }
    catch {
        Write-Output "FAIL $imgPath $($_.Exception.Message)"
    }
}
