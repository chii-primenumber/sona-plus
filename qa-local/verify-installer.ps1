#requires -Version 5.1
param([string]$BundleRoot)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\installer\Install-Sona.ps1')
. (Join-Path $PSScriptRoot '..\installer\Update-Sona.ps1')
$script:Checks=New-Object 'System.Collections.Generic.List[string]'
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('sona-installer-test_'+[guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testRoot)|Out-Null

function Assert-Check([bool]$Condition,[string]$Name) {
    if (!$Condition) { throw ('FAIL: '+$Name) }
    $script:Checks.Add($Name)
}
function Put([string]$Path,[string]$Text) {
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Path))|Out-Null
    [IO.File]::WriteAllText($Path,$Text,(New-Object Text.UTF8Encoding($false)))
}
function Read([string]$Path) { [IO.File]::ReadAllText($Path) }
function Expect-Failure([scriptblock]$Action,[string]$Pattern,[string]$Name) {
    $message=''
    try { &$Action|Out-Null } catch { $message=$_.Exception.Message }
    Assert-Check ($message -match $Pattern) $Name
}
function New-Fixture([string]$Name) {
    $base=Join-Path $testRoot $Name
    $package=Join-Path $base '解压 包''x'
    $league=Join-Path $base 'WeGameApps\英雄联盟\LeagueClient'
    $loader=Join-Path $base '安装 位置''x\Pengu Loader'
    $backup=Join-Path $base 'backups'
    foreach($file in @('LeagueClient.exe','LeagueClientUx.exe')){Put (Join-Path $league $file) 'fixture-client-not-executable'}
    foreach($file in @('Pengu Loader.exe','core.dll','version')){Put (Join-Path $package ('PenguLoader\'+$file)) $(if($file -eq 'version'){'1.1.6+fixture'}else{'new-'+$file})}
    foreach($file in @('index.js','index.css','LICENSE','assets\licenses\LeagueAkari-MIT.txt','assets\cover.txt')){Put (Join-Path $package ('sona\'+$file)) ('new-'+$file)}
    $files=@(Get-ChildItem -LiteralPath $package -File -Recurse|ForEach-Object {@{path=$_.FullName.Substring($package.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName).Hash}})
    @{schema=1;version='1.10.0-personal.23';penguVersion='1.1.6';files=$files}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $package 'manifest.json') -Encoding UTF8
    @{package=$package;league=$league;loader=$loader;backup=$backup}
}

# No production registry writes, privilege changes, process launches or client changes in these tests.
$script:FakeDebugger=''
$script:ActivationFail=$false
$script:ActivationCalls=0
function Get-DebuggerValue { $script:FakeDebugger }
function Invoke-PenguActivation([string]$LoaderDir) {
    $script:ActivationCalls++
    $script:FakeDebugger='rundll32 "'+(Join-Path $LoaderDir 'core.dll')+'", #6000 '
    if($script:ActivationFail){throw 'fixture activation failure'}
}
function Restore-DebuggerValue([string]$Previous,[string]$Core) {$script:FakeDebugger=$Previous}
function Enable-NewLoaderPermissions([string]$LoaderDir) {}

if($BundleRoot){
    $bundle=Test-Package $BundleRoot
    Assert-Check ($bundle.files.Count -gt 20) 'real packaged payload passes every SHA256 check'
    $raw=[IO.File]::ReadAllBytes((Join-Path $BundleRoot 'Install-Sona.ps1'))
    Assert-Check ($raw[0]-eq 239 -and $raw[1]-eq 187 -and $raw[2]-eq 191) 'packaged script has UTF8 BOM for Windows PowerShell 5.1'
    $cmdRaw=[IO.File]::ReadAllBytes((Join-Path $BundleRoot '一键安装.cmd'))
    Assert-Check ($cmdRaw[0]-ne 239) 'packaged cmd launcher has no UTF8 BOM for cmd.exe'
    $hintPath=Join-Path $BundleRoot '“双击一键安装cmd”即可一键安装(需要管理员权限)'
    Assert-Check ((Test-Path -LiteralPath $hintPath -PathType Leaf) -and (Get-Item -LiteralPath $hintPath).Length -eq 0 -and [IO.Path]::GetExtension($hintPath) -eq '') 'packaged zero-byte extensionless install hint placeholder exists'
    $updRaw=[IO.File]::ReadAllBytes((Join-Path $BundleRoot 'sona\Update-Sona.ps1'))
    Assert-Check ($updRaw[0]-eq 239 -and $updRaw[1]-eq 187 -and $updRaw[2]-eq 191) 'packaged in-folder updater script has UTF8 BOM for PowerShell 5.1'
    $updCmdRaw=[IO.File]::ReadAllBytes((Join-Path $BundleRoot 'sona\双击更新SonaPlus.cmd'))
    Assert-Check ($updCmdRaw[0]-ne 239) 'packaged in-folder updater cmd launcher has no UTF8 BOM'
    $updErrors=$null;$updTokens=$null
    [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $BundleRoot 'sona\Update-Sona.ps1'),[ref]$updTokens,[ref]$updErrors)
    Assert-Check ($updErrors.Count-eq 0) 'packaged in-folder updater parses under PowerShell 5.1'
    $parseErrors=$null;$tokens=$null
    [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $BundleRoot 'Install-Sona.ps1'),[ref]$tokens,[ref]$parseErrors)
    Assert-Check ($parseErrors.Count-eq 0) 'packaged script parses under PowerShell 5.1'
    foreach($md in @(Get-ChildItem -LiteralPath $BundleRoot -Filter '*.md' -File -Recurse)){
        $content=[regex]::Replace([IO.File]::ReadAllText($md.FullName),'```[\s\S]*?```','')
        foreach($m in [regex]::Matches($content,'(?<!!)\[[^\]]+\]\(([^)]+)\)')){
            $target=$m.Groups[1].Value.Trim().Split('#')[0].Trim()
            if(!$target -or $target -match '^(?:https?:|mailto:)'){continue}
            $resolved=[IO.Path]::GetFullPath((Join-Path $md.DirectoryName $target))
            Assert-Check ((Test-Within $resolved $BundleRoot) -and (Test-Path -LiteralPath $resolved -PathType Leaf)) ('packaged markdown link resolves: '+$md.Name+' -> '+$target)
        }
    }
}

$fresh=New-Fixture 'fresh'
Assert-Check ((Resolve-LeagueDirectory (Split-Path -Parent $fresh.league))-eq $fresh.league) 'resolve game root to nested client'
Assert-Check ((Resolve-LeagueDirectory (Join-Path $fresh.league 'LeagueClient.exe'))-eq $fresh.league) 'resolve supplied executable path'
Assert-Check (@(Select-UniquePaths @($fresh.league,$fresh.league.ToUpperInvariant())).Count-eq 1) 'deduplicate Windows paths ignoring case'
Assert-Check ((Get-DebuggerCore 'rundll32 "D:\中文 目录\core.dll", #6000 ')-eq 'D:\中文 目录\core.dll') 'parse official activation command with spaces and Chinese'
Expect-Failure {Get-SafeChild $testRoot '..\escape'} '无效路径' 'reject traversal in package manifest'
Expect-Failure {Get-SafeChild $testRoot 'C:\outside'} '无效路径' 'reject absolute manifest paths'
$script:Inputs=New-Object 'System.Collections.Generic.Queue[string]'
function Read-Host([string]$Prompt){$script:Inputs.Dequeue()}
$script:Inputs.Enqueue('invalid-path');$script:Inputs.Enqueue($fresh.league)
Assert-Check ((Select-LeagueDirectory '' @())-eq $fresh.league) 'manual fallback retries invalid input then accepts valid client'
$script:Inputs.Enqueue('2')
Assert-Check ((Select-LeagueDirectory '' @('C:\fixture-one',$fresh.league))-eq $fresh.league) 'select correct client from multiple candidates'
$script:Inputs.Enqueue('Q')
Expect-Failure {Select-LeagueDirectory '' @()} '取消' 'manual cancellation stops without installation'
$backup=Invoke-SonaDeployment $fresh.package $fresh.league $fresh.loader $fresh.backup
Assert-Check ((Read (Join-Path $fresh.loader 'plugins\sona\index.js'))-eq 'new-index.js') 'fresh plugin installed in independent Loader directory'
Assert-Check ((Get-ConfigValue (Join-Path $fresh.loader 'config') 'LeaguePath')-eq $fresh.league) 'client path saved without losing Chinese or apostrophe'
Assert-Check ((Get-ConfigValue (Join-Path $fresh.loader 'config') 'UseSymlink')-eq 'false') 'new install uses official global mode'
Assert-Check (Test-PenguActivation $fresh.loader $fresh.league $false) 'activation verified after CLI invocation'

$upgrade=New-Fixture 'upgrade'
$script:FakeDebugger=''
Put (Join-Path $upgrade.loader 'config') "Language=English`nOptimizeClient=false`nCustom=keep`nUseSymlink=false`n"
Put (Join-Path $upgrade.loader 'datastore') 'private-local-preferences'
Put (Join-Path $upgrade.loader 'version') '1.1.4+fixture'
Put (Join-Path $upgrade.loader 'plugins\another-plugin\index.js') 'other-plugin'
Put (Join-Path $upgrade.loader 'plugins\sona\index.js_') 'disabled-old-plugin'
Put (Join-Path $upgrade.loader 'plugins\sona\assets\cover.txt') 'custom-wallpaper'
$backup=Invoke-SonaDeployment $upgrade.package $upgrade.league $upgrade.loader $upgrade.backup
Assert-Check ((Read (Join-Path $upgrade.loader 'datastore'))-eq 'private-local-preferences') 'existing datastore retained'
Assert-Check ((Get-ConfigValue (Join-Path $upgrade.loader 'config') 'Language')-eq 'English' -and (Get-ConfigValue (Join-Path $upgrade.loader 'config') 'Custom')-eq 'keep') 'unknown and language settings retained'
Assert-Check ((Read (Join-Path $upgrade.loader 'plugins\sona\assets\cover.txt'))-eq 'custom-wallpaper') 'custom assets win over packaged defaults'
Assert-Check ((Read (Join-Path $upgrade.loader 'plugins\another-plugin\index.js'))-eq 'other-plugin') 'other plugins untouched'
Assert-Check (!(Test-Path -LiteralPath (Join-Path $upgrade.loader 'plugins\sona\index.js_'))) 'disabled old entry removed after enabling new plugin'
Assert-Check ((Read (Join-Path $backup 'PenguLoader\plugins\sona\index.js_'))-eq 'disabled-old-plugin') 'complete backup stays outside plugins and retains original disabled entry'

$rollback=New-Fixture 'rollback'
$script:FakeDebugger='';$script:ActivationFail=$true
Put (Join-Path $rollback.loader 'config') "Language=中文`nCustom=original`n"
Put (Join-Path $rollback.loader 'plugins\sona\index.js_') 'old-disabled'
$configHash=(Get-FileHash -LiteralPath (Join-Path $rollback.loader 'config')).Hash
Expect-Failure {Invoke-SonaDeployment $rollback.package $rollback.league $rollback.loader $rollback.backup} 'fixture activation failure' 'activation failure triggers transaction rollback'
Assert-Check ((Get-FileHash -LiteralPath (Join-Path $rollback.loader 'config')).Hash-eq $configHash) 'failed install restores original config bytes'
Assert-Check ((Read (Join-Path $rollback.loader 'plugins\sona\index.js_'))-eq 'old-disabled' -and !(Test-Path -LiteralPath (Join-Path $rollback.loader 'plugins\sona\index.js'))) 'failed install restores disabled state and removes new executable entry'
Assert-Check ($script:FakeDebugger-eq '' -and !(Test-Path -LiteralPath (Join-Path $rollback.loader 'core.dll'))) 'failed install restores activation and removes newly added runtime'
$script:ActivationFail=$false

$conflict=New-Fixture 'conflict'
$script:FakeDebugger='unrelated-debugger.exe'
$calls=$script:ActivationCalls
Expect-Failure {Invoke-SonaDeployment $conflict.package $conflict.league $conflict.loader $conflict.backup} '其他激活项' 'unrelated activation is never overwritten'
Assert-Check ($script:ActivationCalls-eq $calls -and !(Test-Path -LiteralPath $conflict.loader)) 'conflict exits before writes or activation'
$script:FakeDebugger=''
$bad=New-Fixture 'bad-hash'
Put (Join-Path $bad.package 'sona\index.js') 'corrupt'
Expect-Failure {Invoke-SonaDeployment $bad.package $bad.league $bad.loader $bad.backup} '校验失败' 'damaged package rejected before install'
Assert-Check (!(Test-Path -LiteralPath $bad.loader)) 'damaged package leaves target untouched'

$newer=New-Fixture 'newer-loader'
Put (Join-Path $newer.loader 'version') '1.2.0+fixture'
Put (Join-Path $newer.loader 'core.dll') 'newer-core'
Put (Join-Path $newer.loader 'Pengu Loader.exe') 'newer-loader'
Invoke-SonaDeployment $newer.package $newer.league $newer.loader $newer.backup|Out-Null
Assert-Check ((Read (Join-Path $newer.loader 'core.dll'))-eq 'newer-core') 'newer Loader runtime is not downgraded'

$custom=New-Fixture 'custom-plugin-directory'
$script:FakeDebugger=''
$pluginRoot=Join-Path (Split-Path -Parent $custom.backup) 'custom-plugins'
Put (Join-Path $custom.loader 'config') ("plugins_dir="+$pluginRoot+"`ndisabled_plugins=abcd,"+(Get-SonaHash)+",1234`n")
Put (Join-Path $pluginRoot 'sona\index.js') 'custom-old'
Put (Join-Path $pluginRoot 'other\index.js') 'other-external-plugin'
$backup=Invoke-SonaDeployment $custom.package $custom.league $custom.loader $custom.backup
Assert-Check ((Read (Join-Path $pluginRoot 'sona\index.js'))-eq 'new-index.js') 'custom external plugin directory used without changing config'
Assert-Check ((Read (Join-Path $backup 'ExternalPlugins\sona\index.js'))-eq 'custom-old') 'external plugin directory receives a full separate backup'
Assert-Check ((Get-ConfigValue (Join-Path $custom.loader 'config') 'disabled_plugins')-eq 'abcd,1234') 'enable only Sona in legacy disabled hash list'
Assert-Check ((Read (Join-Path $pluginRoot 'other\index.js'))-eq 'other-external-plugin') 'other external plugins preserved'

$customFail=New-Fixture 'custom-plugin-rollback'
$script:FakeDebugger='';$script:ActivationFail=$true
$pluginRoot=Join-Path (Split-Path -Parent $customFail.backup) 'custom-plugins'
Put (Join-Path $customFail.loader 'config') ('plugins_dir='+$pluginRoot)
Put (Join-Path $pluginRoot 'sona\index.js') 'original-external-plugin'
Expect-Failure {Invoke-SonaDeployment $customFail.package $customFail.league $customFail.loader $customFail.backup} 'fixture activation failure' 'custom plugin directory participates in rollback'
Assert-Check ((Read (Join-Path $pluginRoot 'sona\index.js'))-eq 'original-external-plugin') 'failed custom install restores external plugin bytes'
$script:ActivationFail=$false

$link=New-Fixture 'link-conflict'
$script:FakeDebugger=''
Put (Join-Path $link.loader 'config') 'UseSymlink=true'
Put (Join-Path $link.league 'version.dll') 'unrelated-file'
Expect-Failure {Invoke-SonaDeployment $link.package $link.league $link.loader $link.backup} 'version.dll' 'unrelated client DLL is never overwritten'
Assert-Check ((Read (Join-Path $link.league 'version.dll'))-eq 'unrelated-file') 'client DLL contents retained after conflict'

Assert-Check (!(Test-Path -LiteralPath (Join-Path $backup 'staging'))) 'temporary staging directory removed after completed deployment'

$retention=New-Fixture 'backup-retention'
$script:FakeDebugger=''
foreach($oldName in @('20260101_000001_00000001','20260101_000002_00000002','20260101_000003_00000003','20260101_000004_00000004')){
    Put (Join-Path $retention.backup ($oldName+'\backup.json')) '{"schema":1,"status":"installed"}'
}
Put (Join-Path $retention.backup '20260101_000000_ffffffff\backup.json') '{"schema":1}'
Put (Join-Path $retention.backup 'manual-notes\readme.txt') 'keep-user-folder'
$latestRetained=Invoke-SonaDeployment $retention.package $retention.league $retention.loader $retention.backup 3
Assert-Check (!(Test-Path -LiteralPath (Join-Path $retention.backup '20260101_000001_00000001')) -and !(Test-Path -LiteralPath (Join-Path $retention.backup '20260101_000002_00000002'))) 'oldest completed backups pruned beyond KeepBackups limit'
Assert-Check ((Test-Path -LiteralPath (Join-Path $retention.backup '20260101_000003_00000003')) -and (Test-Path -LiteralPath (Join-Path $retention.backup '20260101_000004_00000004')) -and (Test-Path -LiteralPath $latestRetained)) 'newest completed backups retained up to KeepBackups limit'
Assert-Check ((Test-Path -LiteralPath (Join-Path $retention.backup '20260101_000000_ffffffff')) -and (Test-Path -LiteralPath (Join-Path $retention.backup 'manual-notes\readme.txt'))) 'incomplete backups and unrelated folders never pruned'

Add-Type -AssemblyName System.IO.Compression.FileSystem
$updFixture=Join-Path $testRoot 'in-folder-updater'
$updTarget=Join-Path $updFixture 'Pengu Loader\plugins\sona'
$updBackup=Join-Path $updFixture 'backups'
$updSrc=Join-Path $updFixture 'zip-src'
Put (Join-Path $updTarget 'index.js') "/**`n * @version 1.1.2`n */`nold-entry"
Put (Join-Path $updTarget 'index.css') 'old-css'
Put (Join-Path $updTarget 'chunks\old-chunk-123.js') 'stale-chunk'
Put (Join-Path $updTarget 'assets\wallpaper.png') 'user-custom-wallpaper'
Put (Join-Path $updSrc 'sona\index.js') "/**`n * @version 1.1.3`n */`nnew-entry"
Put (Join-Path $updSrc 'sona\index.css') 'new-css'
Put (Join-Path $updSrc 'sona\chunks\new-chunk-456.js') 'fresh-chunk'
Put (Join-Path $updSrc 'sona\assets\wallpaper.png') 'default-wallpaper'
Put (Join-Path $updSrc 'sona\assets\licenses\LeagueAkari-MIT.txt') 'mit-license'
$zipPath=Join-Path $updFixture 'sona-plus-v1.1.3.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($updSrc, $zipPath)
$zipSha=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
$sumsPath=Join-Path $updFixture 'SHA256SUMS.txt'
Put $sumsPath ($zipSha+'  sona-plus-v1.1.3.zip')
$badSumsPath=Join-Path $updFixture 'BAD_SHA256SUMS.txt'
Put $badSumsPath (('0'*64)+'  sona-plus-v1.1.3.zip')
Expect-Failure {Invoke-SonaPluginUpdate $updTarget $zipPath $badSumsPath $updBackup 3} 'SHA256' 'in-folder updater rejects mismatched SHA256 before modifying plugin'
Assert-Check ((Get-CurrentPluginVersion $updTarget)-eq '1.1.2') 'rejected update leaves existing plugin version untouched'
Invoke-SonaPluginUpdate $updTarget $zipPath $sumsPath $updBackup 3|Out-Null
Assert-Check ((Get-CurrentPluginVersion $updTarget)-eq '1.1.3' -and (Read (Join-Path $updTarget 'chunks\new-chunk-456.js'))-eq 'fresh-chunk') 'in-folder updater installs new version and code-split chunks'
Assert-Check (!(Test-Path -LiteralPath (Join-Path $updTarget 'chunks\old-chunk-123.js'))) 'in-folder updater removes stale chunks from previous version'
Assert-Check ((Read (Join-Path $updTarget 'assets\wallpaper.png'))-eq 'user-custom-wallpaper') 'in-folder updater preserves user custom assets'

$result=@{result='passed';checks=$script:Checks.ToArray();count=$script:Checks.Count;fixtures=$testRoot;realActivation='mocked';realFiles='isolated temporary fixtures'}
$jsonOut=$result|ConvertTo-Json -Depth 5
Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
$jsonOut
