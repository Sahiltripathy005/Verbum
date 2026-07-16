Add-Type -AssemblyName System.Drawing
function CreateIcon($size, $path) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    
    # Enable antialiasing
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    
    # Draw background (gradient)
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(79, 70, 229)), ([System.Drawing.Color]::FromArgb(124, 58, 237)), 45.0
    $g.FillEllipse($brush, 0, 0, $size-1, $size-1)
    
    # Draw a white letter 'V' in the center
    $fontSize = $size * 0.5
    if ($fontSize -lt 8) { $fontSize = 8 }
    $fontStyle = [System.Drawing.FontStyle]::Bold
    $font = New-Object System.Drawing.Font "Arial", ([single]$fontSize), $fontStyle
    $fontBrush = [System.Drawing.Brushes]::White
    
    # Measure string to center it
    $stringSize = $g.MeasureString("V", $font)
    $x = ($size - $stringSize.Width) / 2
    $y = ($size - $stringSize.Height) / 2
    
    # Adjust for letter offset
    $g.DrawString("V", $font, $fontBrush, $x, $y)
    
    # Save the file
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Clean up
    $font.Dispose()
    $brush.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

$dir = "d:\Final - Projects\Vocab-Extension\wordvault\icons"
if (!(Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir
}

CreateIcon 16 "$dir\icon16.png"
CreateIcon 32 "$dir\icon32.png"
CreateIcon 48 "$dir\icon48.png"
CreateIcon 128 "$dir\icon128.png"
Write-Host "Icons generated successfully!"
