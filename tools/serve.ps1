# ---------------------------------------------------------------
# tools/serve.ps1 : Node も Python も要らないローカル試遊用の静的サーバ
#   使い方:  powershell -ExecutionPolicy Bypass -File tools\serve.ps1
#   停止  :  Ctrl+C
# ---------------------------------------------------------------
param(
  [int]$Port = 5173,
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path $Root).Path

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.webmanifest' = 'application/manifest+json'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "serving $Root  ->  http://localhost:$Port/" -ForegroundColor Green
Write-Host "stop with Ctrl+C"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
      $path = Join-Path $Root $rel
      $full = [System.IO.Path]::GetFullPath($path)

      # ルート外へのアクセスは拒否
      if (-not $full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 403
      } elseif (Test-Path $full -PathType Container) {
        $full = Join-Path $full 'index.html'
      }

      if ($res.StatusCode -ne 403 -and (Test-Path $full -PathType Leaf)) {
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-store')
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } elseif ($res.StatusCode -ne 403) {
        $res.StatusCode = 404
        $b = [System.Text.Encoding]::UTF8.GetBytes('404')
        $res.OutputStream.Write($b, 0, $b.Length)
      }
    } catch {
      $res.StatusCode = 500
    } finally {
      $res.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
