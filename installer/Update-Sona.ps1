#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$PluginDir,
    [string]$ReleaseZipPath,
    [string]$ChecksumFile,
    [switch]$Force,
    [switch]$NoPause,
    [int]$KeepBackups = 5
)

Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'
$script:UpdaterFile = $PSCommandPath
$script:LogFile = $null
$script:DelegatedToAdmin = $false
$script:GithubLatestApi = 'https://api.github.com/repos/chii-primenumber/sona-plus/releases/latest'
$script:DownloadPrefix = 'https://github.com/chii-primenumber/sona-plus/releases/download/'

function Write-UpdaterStep([string]$Text) {
    Write-Host $Text
    if ($script:LogFile) { Add-Content -LiteralPath $script:LogFile -Value $Text -Encoding UTF8 }
}

function Get-UpdaterFullPath([string]$Path) {
    [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Path.Trim().Trim('"'))).TrimEnd('\', '/')
}

function Test-UpdaterWithin([string]$Path, [string]$Root) {
    $p = Get-UpdaterFullPath $Path
    $r = Get-UpdaterFullPath $Root
    $p.Equals($r, [StringComparison]::OrdinalIgnoreCase) -or $p.StartsWith($r + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Get-UpdaterSafeChild([string]$Root, [string]$Relative) {
    if ([IO.Path]::IsPathRooted($Relative) -or $Relative -match '(^|[\\/])\.\.([\\/]|$)' -or $Relative.Contains(':')) { throw '更新包包含无效路径。' }
    $path = Get-UpdaterFullPath (Join-Path $Root $Relative)
    if (!(Test-UpdaterWithin $path $Root) -or $path -eq (Get-UpdaterFullPath $Root)) { throw '更新包路径超出目标范围。' }
    $path
}

function Copy-UpdaterSafeTree([string]$Source, [string]$Destination) {
    if ((Get-Item -LiteralPath $Source -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw ('请先处理目录链接：' + $Source) }
    [IO.Directory]::CreateDirectory($Destination) | Out-Null
    foreach ($entry in @(Get-ChildItem -LiteralPath $Source -Force -Recurse)) {
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw ('请先处理目录链接：' + $entry.FullName) }
        $relative = $entry.FullName.Substring((Get-UpdaterFullPath $Source).Length + 1)
        $target = Get-UpdaterSafeChild $Destination $relative
        if ($entry.PSIsContainer) { [IO.Directory]::CreateDirectory($target) | Out-Null }
        else {
            [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
            Copy-Item -LiteralPath $entry.FullName -Destination $target -Force
        }
    }
}

function Test-DirectoryWritable([string]$Dir) {
    if (!(Test-Path -LiteralPath $Dir -PathType Container)) { return $false }
    $probe = Join-Path $Dir ('.sona_write_probe_' + [guid]::NewGuid().ToString('N'))
    try {
        [IO.File]::WriteAllText($probe, 'ok', [Text.Encoding]::ASCII)
        Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
        return $true
    } catch {
        return $false
    }
}

function Get-CurrentPluginVersion([string]$TargetPluginDir) {
    $entry = Join-Path $TargetPluginDir 'index.js'
    if (!(Test-Path -LiteralPath $entry -PathType Leaf)) { return '0.0.0' }
    $head = (Get-Content -LiteralPath $entry -TotalCount 20 -Encoding UTF8) -join "`n"
    if ($head -match '@version\s+v?(\d+\.\d+\.\d+)') { return $matches[1] }
    return '0.0.0'
}

function Read-ExpectedZipSha256([string]$SumsPath, [string]$ArchiveName) {
    foreach ($line in [IO.File]::ReadAllLines($SumsPath)) {
        if ($line -match '^\s*([0-9a-fA-F]{64})\s+\*?(.+?)\s*$') {
            $hash = $matches[1].ToUpperInvariant()
            $name = [IO.Path]::GetFileName($matches[2].Trim())
            if ($name.Equals($ArchiveName, [StringComparison]::OrdinalIgnoreCase)) { return $hash }
        }
    }
    throw ('SHA256SUMS.txt 中未找到对应文件校验项：' + $ArchiveName)
}

function Expand-VerifiedPluginZip([string]$ZipPath, [string]$Destination) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Directory]::CreateDirectory($Destination) | Out-Null
    $archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        foreach ($entry in $archive.Entries) {
            $norm = $entry.FullName.Replace('\', '/')
            if ([string]::IsNullOrWhiteSpace($norm) -or $norm.EndsWith('/')) { continue }
            if (!$norm.StartsWith('sona/', [StringComparison]::Ordinal) -and $norm -ne 'AKARI评分说明.md') {
                throw ('更新包包含非预期条目：' + $entry.FullName)
            }
            $outPath = Get-UpdaterSafeChild $Destination $norm
            [IO.Directory]::CreateDirectory((Split-Path -Parent $outPath)) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $outPath, $true)
        }
    } finally {
        $archive.Dispose()
    }
    $sonaRoot = Join-Path $Destination 'sona'
    foreach ($req in @('index.js', 'index.css')) {
        if (!(Test-Path -LiteralPath (Join-Path $sonaRoot $req) -PathType Leaf)) {
            throw ('更新包缺少核心文件：sona/' + $req)
        }
    }
    return $sonaRoot
}

function Remove-OldUpdaterBackups([string]$BackupRoot, [string]$CurrentBackup, [int]$KeepCount = 5) {
    if ($KeepCount -lt 1 -or !(Test-Path -LiteralPath $BackupRoot -PathType Container)) { return }
    $currentFull = Get-UpdaterFullPath $CurrentBackup
    $completed = @(Get-ChildItem -LiteralPath $BackupRoot -Directory -Force -ErrorAction SilentlyContinue | Where-Object {
        !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
        $_.Name -match '^\d{8}_\d{6}_[0-9a-fA-F]{8}$' -and
        (Test-Path -LiteralPath (Join-Path $_.FullName 'backup.json') -PathType Leaf)
    } | Where-Object {
        try {
            $meta = Get-Content -LiteralPath (Join-Path $_.FullName 'backup.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            $meta -and $meta.PSObject.Properties['status'] -and $meta.status -eq 'installed'
        } catch { $false }
    } | Sort-Object Name -Descending)
    for ($i = $KeepCount; $i -lt $completed.Count; $i++) {
        if ((Get-UpdaterFullPath $completed[$i].FullName) -ieq $currentFull) { continue }
        try { Remove-Item -LiteralPath $completed[$i].FullName -Recurse -Force -ErrorAction Stop } catch {}
    }
}

function Invoke-SonaPluginUpdate([string]$TargetPluginDir, [string]$ZipPath, [string]$SumsPath, [string]$BackupRoot, [int]$KeepCount = 5) {
    $TargetPluginDir = Get-UpdaterFullPath $TargetPluginDir
    $BackupRoot = Get-UpdaterFullPath $BackupRoot
    if (!(Test-Path -LiteralPath (Join-Path $TargetPluginDir 'index.js') -PathType Leaf)) {
        throw ('目标目录不是有效的 Sona Plus 插件目录：' + $TargetPluginDir)
    }
    if ((Test-UpdaterWithin $BackupRoot $TargetPluginDir) -or (Test-UpdaterWithin $TargetPluginDir $BackupRoot)) {
        throw '备份目录必须独立于插件目录。'
    }
    if (!(Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
        throw ('未找到更新压缩包：' + $ZipPath)
    }
    if ($SumsPath) {
        $expectedHash = Read-ExpectedZipSha256 $SumsPath ([IO.Path]::GetFileName($ZipPath))
        $actualHash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToUpperInvariant()
        if ($actualHash -ne $expectedHash) {
            throw '更新压缩包 SHA256 校验失败，已拒绝安装。'
        }
    }

    $workDir = Join-Path ([IO.Path]::GetTempPath()) ('sona-update-work_' + [guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($workDir) | Out-Null
    try {
        $extractedSona = Expand-VerifiedPluginZip $ZipPath (Join-Path $workDir 'extracted')
        $newVersion = Get-CurrentPluginVersion $extractedSona

        $backupDir = Join-Path $BackupRoot ((Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + [guid]::NewGuid().ToString('N').Substring(0, 8))
        [IO.Directory]::CreateDirectory($backupDir) | Out-Null
        $snapshotSona = Join-Path $backupDir 'sona'
        Write-UpdaterStep '正在备份当前 Sona Plus 插件与自定义资源……'
        Copy-UpdaterSafeTree $TargetPluginDir $snapshotSona

        $stagedSona = Join-Path $workDir 'staged\sona'
        Copy-UpdaterSafeTree $extractedSona $stagedSona
        if (Test-Path -LiteralPath (Join-Path $TargetPluginDir 'assets') -PathType Container) {
            Copy-UpdaterSafeTree (Join-Path $TargetPluginDir 'assets') (Join-Path $stagedSona 'assets')
        }
        if (Test-Path -LiteralPath (Join-Path $extractedSona 'assets\licenses') -PathType Container) {
            Copy-UpdaterSafeTree (Join-Path $extractedSona 'assets\licenses') (Join-Path $stagedSona 'assets\licenses')
        }

        $touched = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        $metadata = @{
            schema = 1
            mode = 'plugin-update'
            version = $newVersion
            pluginDir = $TargetPluginDir
        }
        $metadata | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backupDir 'backup.json') -Encoding UTF8

        try {
            $oldChunks = Join-Path $TargetPluginDir 'chunks'
            if (Test-Path -LiteralPath $oldChunks -PathType Container) {
                foreach ($stale in @(Get-ChildItem -LiteralPath $oldChunks -File -Recurse -Force)) {
                    $rel = 'chunks\' + $stale.FullName.Substring((Get-UpdaterFullPath $oldChunks).Length + 1)
                    [void]$touched.Add($rel)
                    Remove-Item -LiteralPath $stale.FullName -Force
                }
            }

            foreach ($file in @(Get-ChildItem -LiteralPath $stagedSona -File -Recurse -Force)) {
                $rel = $file.FullName.Substring((Get-UpdaterFullPath $stagedSona).Length + 1)
                $dest = Get-UpdaterSafeChild $TargetPluginDir $rel
                [void]$touched.Add($rel)
                [IO.Directory]::CreateDirectory((Split-Path -Parent $dest)) | Out-Null
                Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
            }

            foreach ($coreFile in @('index.js', 'index.css')) {
                if ((Get-FileHash -LiteralPath (Join-Path $stagedSona $coreFile)).Hash -ne (Get-FileHash -LiteralPath (Join-Path $TargetPluginDir $coreFile)).Hash) {
                    throw ('更新后文件校验不一致：' + $coreFile)
                }
            }

            $metadata.written = @($touched)
            $metadata.status = 'installed'
            $metadata | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backupDir 'backup.json') -Encoding UTF8
            Remove-OldUpdaterBackups $BackupRoot $backupDir $KeepCount
            Write-UpdaterStep ('更新完成：Sona Plus v' + $newVersion)
            Write-UpdaterStep ('插件位置：' + $TargetPluginDir)
            Write-UpdaterStep ('备份位置：' + $backupDir)
            if (@(Get-Process -Name LeagueClientUx -ErrorAction SilentlyContinue).Count -gt 0) {
                Write-UpdaterStep '无需退出客户端：切回英雄联盟客户端按 Ctrl+Enter（或点击更新页「重载客户端生效」）即可立即生效！'
            } else {
                Write-UpdaterStep '现在可以启动英雄联盟客户端，按 F1 打开 Sona Plus。'
            }
            return $backupDir
        } catch {
            $err = $_
            Write-UpdaterStep '更新中途异常，正在自动恢复原版文件……'
            foreach ($rel in $touched) {
                $dest = Get-UpdaterSafeChild $TargetPluginDir $rel
                $orig = Get-UpdaterSafeChild $snapshotSona $rel
                if (Test-Path -LiteralPath $orig -PathType Leaf) {
                    [IO.Directory]::CreateDirectory((Split-Path -Parent $dest)) | Out-Null
                    Copy-Item -LiteralPath $orig -Destination $dest -Force
                } elseif (Test-Path -LiteralPath $dest -PathType Leaf) {
                    Remove-Item -LiteralPath $dest -Force
                }
            }
            Write-UpdaterStep '已恢复至更新前状态。'
            throw $err
        }
    } finally {
        Remove-Item -LiteralPath $workDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Start-SonaUpdater {
    $resolvedPluginDir = if ($PluginDir) { Get-UpdaterFullPath $PluginDir } else { Get-UpdaterFullPath $PSScriptRoot }
    if (!(Test-Path -LiteralPath (Join-Path $resolvedPluginDir 'index.js') -PathType Leaf)) {
        throw ('未在目标位置找到 Sona Plus (index.js)：' + $resolvedPluginDir)
    }

    if (!(Test-DirectoryWritable $resolvedPluginDir)) {
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($identity)
        if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
            Write-UpdaterStep '插件目录位于受保护位置，需要一次管理员授权以完成更新……'
            $command = "& '" + $script:UpdaterFile.Replace("'", "''") + "' -PluginDir '" + $resolvedPluginDir.Replace("'", "''") + "'"
            if ($ReleaseZipPath) { $command += " -ReleaseZipPath '" + (Get-UpdaterFullPath $ReleaseZipPath).Replace("'", "''") + "'" }
            if ($ChecksumFile) { $command += " -ChecksumFile '" + (Get-UpdaterFullPath $ChecksumFile).Replace("'", "''") + "'" }
            if ($Force) { $command += ' -Force' }
            if ($NoPause) { $command += ' -NoPause' }
            if ($KeepBackups -ne 5) { $command += ' -KeepBackups ' + $KeepBackups }
            $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
            $proc = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded) -Verb RunAs -WindowStyle Normal -Wait -PassThru
            $script:DelegatedToAdmin = $true
            if ($proc.ExitCode -ne 0) { throw '更新未完成，请查看管理员窗口提示。' }
            return
        }
    }

    $progDataSona = Join-Path $env:ProgramData 'Sona'
    try { [IO.Directory]::CreateDirectory($progDataSona) | Out-Null } catch {}
    $dataRoot = if (Test-DirectoryWritable $progDataSona) { $progDataSona } else { Join-Path $env:LOCALAPPDATA 'Sona' }
    [IO.Directory]::CreateDirectory((Join-Path $dataRoot 'Logs')) | Out-Null
    $script:LogFile = Join-Path $dataRoot ('Logs\update_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.log')

    $currentVer = Get-CurrentPluginVersion $resolvedPluginDir
    Write-UpdaterStep ('Sona Plus 一键更新（当前版本：v' + $currentVer + '）')

    $downloadTemp = $null
    try {
        $zipToUse = $ReleaseZipPath
        $sumsToUse = $ChecksumFile

        if (!$zipToUse) {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Write-UpdaterStep '正在从 GitHub Releases 查询最新正式版……'
            $release = Invoke-RestMethod -Uri $script:GithubLatestApi -Headers @{ 'User-Agent' = 'SonaPlus-Updater'; 'Accept' = 'application/vnd.github+json' } -TimeoutSec 20
            $tag = [string]$release.tag_name
            if ($tag -notmatch '^v?(\d+\.\d+\.\d+)$') { throw ('远端未返回有效正式版本号：' + $tag) }
            $latestVer = $matches[1]
            if (!$Force -and ([version]$latestVer -le [version]$currentVer)) {
                Write-UpdaterStep ('当前已是最新版本（v' + $currentVer + '），无需更新。')
                return
            }
            Write-UpdaterStep ('发现新版本：v' + $currentVer + ' -> v' + $latestVer)
            $expectedZipName = "sona-plus-v$latestVer.zip"
            $zipAsset = @($release.assets | Where-Object { $_.name -ieq $expectedZipName })[0]
            $sumsAsset = @($release.assets | Where-Object { $_.name -ieq 'SHA256SUMS.txt' })[0]
            if (!$zipAsset -or !$sumsAsset) { throw ('Release 缺少必要附件：' + $expectedZipName + ' 或 SHA256SUMS.txt') }
            foreach ($u in @([string]$zipAsset.browser_download_url, [string]$sumsAsset.browser_download_url)) {
                if (!$u.StartsWith($script:DownloadPrefix, [StringComparison]::OrdinalIgnoreCase)) {
                    throw ('附件下载地址不在受信任仓库范围内：' + $u)
                }
            }

            $downloadTemp = Join-Path ([IO.Path]::GetTempPath()) ('sona-update-dl_' + [guid]::NewGuid().ToString('N'))
            [IO.Directory]::CreateDirectory($downloadTemp) | Out-Null
            $zipToUse = Join-Path $downloadTemp $expectedZipName
            $sumsToUse = Join-Path $downloadTemp 'SHA256SUMS.txt'
            Write-UpdaterStep ('正在下载 ' + $expectedZipName + ' ……')
            Invoke-WebRequest -Uri ([string]$zipAsset.browser_download_url) -OutFile $zipToUse -UseBasicParsing -TimeoutSec 120
            Invoke-WebRequest -Uri ([string]$sumsAsset.browser_download_url) -OutFile $sumsToUse -UseBasicParsing -TimeoutSec 30
        }

        # 插件文件更新仅替换 plugins\sona 下的前端资源与脚本，无需退出客户端，替换后在客户端内按 Ctrl+Enter 重载即可生效
        Invoke-SonaPluginUpdate $resolvedPluginDir $zipToUse $sumsToUse (Join-Path $dataRoot 'Backups') $KeepBackups | Out-Null
        Write-UpdaterStep ('更新日志：' + $script:LogFile)
    } finally {
        if ($downloadTemp) { Remove-Item -LiteralPath $downloadTemp -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    $exitCode = 0
    try { Start-SonaUpdater }
    catch {
        Write-UpdaterStep ('更新未完成：' + $_.Exception.Message)
        if ($script:LogFile) { Write-Host ('日志：' + $script:LogFile) }
        $exitCode = 1
    }
    if (!$NoPause -and !$script:DelegatedToAdmin) { [void](Read-Host '按回车关闭') }
    exit $exitCode
}
