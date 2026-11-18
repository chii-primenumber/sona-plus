"""Build the Sona Plus plugin ZIP and offline Pengu installer from pinned inputs."""
import argparse
import hashlib
import json
import posixpath
import re
import shutil
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
REPO_URL = 'https://github.com/chii-primenumber/sona-plus'
MARKDOWN_LINK_RE = re.compile(r'(?<!!)\[[^\]]+\]\(([^)]+)\)')


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest().upper()


def write_zip(directory, destination):
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(directory.rglob('*')):
            if path.is_file():
                archive.write(path, path.relative_to(directory).as_posix())


def rewrite_links(text, mapping):
    for old, new in mapping:
        text = text.replace(old, new)
    return text


def verify_markdown_links_in_map(files_by_posix_path, label):
    all_paths = set(files_by_posix_path.keys())
    for md_path, content in files_by_posix_path.items():
        if not md_path.endswith('.md'):
            continue
        stripped = re.sub(r'```[\s\S]*?```', '', content)
        parent = posixpath.dirname(md_path)
        for match in MARKDOWN_LINK_RE.finditer(stripped):
            raw_target = match.group(1).strip()
            if not raw_target or raw_target.startswith(('http://', 'https://', 'mailto:', '#')):
                continue
            target_path = raw_target.split('#', 1)[0].strip()
            if not target_path:
                continue
            resolved = posixpath.normpath(posixpath.join(parent, target_path)) if parent else posixpath.normpath(target_path)
            if resolved.startswith('..') or resolved not in all_paths:
                raise ValueError(f'Broken relative markdown link in {label}:{md_path} -> {raw_target} (resolved: {resolved})')


def verify_archive_markdown_links(zip_path):
    with zipfile.ZipFile(zip_path) as archive:
        entries = {
            item.filename: archive.read(item).decode('utf-8') if item.filename.endswith('.md') else ''
            for item in archive.infolist()
            if not item.is_dir()
        }
    verify_markdown_links_in_map(entries, zip_path.name)


def package(pengu_zip, output):
    vendor = json.loads((ROOT / 'installer/vendor.json').read_text(encoding='utf-8'))
    if sha256(pengu_zip) != vendor['pengu']['sha256']:
        raise ValueError('Official Pengu ZIP SHA256 does not match the pinned artifact')
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    output.mkdir(parents=True, exist_ok=True)
    bundle = output / f'SonaPlus_{version}_Windows一键安装'
    if bundle.exists():
        raise FileExistsError(f'Use a new output directory; will not overwrite {bundle}')
    bundle.mkdir()
    plugin = bundle / 'sona'
    plugin.mkdir()
    for name in ['index.js', 'index.css']:
        shutil.copy2(ROOT / 'dist' / name, plugin / name)
    if (ROOT / 'dist/chunks').is_dir():
        shutil.copytree(ROOT / 'dist/chunks', plugin / 'chunks')
    shutil.copytree(ROOT / 'assets', plugin / 'assets')
    if (ROOT / 'dist/assets').is_dir():
        shutil.copytree(ROOT / 'dist/assets', plugin / 'assets', dirs_exist_ok=True)
    shutil.copy2(ROOT / 'LICENSE', plugin / 'LICENSE')
    updater_ps_text = (ROOT / 'installer/Update-Sona.ps1').read_text(encoding='utf-8-sig')
    (plugin / 'Update-Sona.ps1').write_text(updater_ps_text, encoding='utf-8-sig', newline='\r\n')
    updater_cmd_text = (ROOT / 'installer/Update-Sona.cmd').read_text(encoding='utf-8')
    (plugin / '双击更新SonaPlus.cmd').write_text(updater_cmd_text, encoding='utf-8', newline='\r\n')

    personal_readme_src = (ROOT / 'README_个人版.md').read_text(encoding='utf-8')
    bundle_plugin_readme = rewrite_links(personal_readme_src, [
        ('[完整功能介绍](README.md)', '[完整功能介绍](../SonaPlus功能介绍.md)'),
        ('[详细安装说明、备份位置与回退方式](installer/INSTALL.md)', '[详细安装说明、备份位置与回退方式](../安装说明.md)'),
    ])
    standalone_plugin_readme = rewrite_links(personal_readme_src, [
        ('[完整功能介绍](README.md)', f'[完整功能介绍]({REPO_URL}#readme)'),
        ('[详细安装说明、备份位置与回退方式](installer/INSTALL.md)', f'[详细安装说明、备份位置与回退方式]({REPO_URL}/blob/main/installer/INSTALL.md)'),
    ])
    (plugin / 'README.md').write_text(bundle_plugin_readme, encoding='utf-8', newline='\n')

    akari_doc_packaged = rewrite_links((ROOT / 'AKARI评分说明.md').read_text(encoding='utf-8'), [
        ('(assets/licenses/LeagueAkari-MIT.txt)', '(sona/assets/licenses/LeagueAkari-MIT.txt)'),
    ])
    (bundle / 'AKARI评分说明.md').write_text(akari_doc_packaged, encoding='utf-8', newline='\n')

    intro_doc_packaged = rewrite_links((ROOT / 'README.md').read_text(encoding='utf-8'), [
        ('[README_个人版.md](README_个人版.md)', '[sona/README.md](sona/README.md)'),
        ('[CHANGELOG.md](CHANGELOG.md)', f'[CHANGELOG.md]({REPO_URL}/blob/main/CHANGELOG.md)'),
        ('[安装说明](installer/INSTALL.md)', '[安装说明](安装说明.md)'),
        ('[GNU AGPL-3.0](LICENSE)', '[GNU AGPL-3.0](sona/LICENSE)'),
    ])
    (bundle / 'SonaPlus功能介绍.md').write_text(intro_doc_packaged, encoding='utf-8', newline='\n')

    for source, target in [('installer/INSTALL.md', '安装说明.md'), ('installer/THIRD_PARTY_NOTICES.md', '第三方项目与许可.md'), ('installer/vendor.json', 'vendor.json')]:
        shutil.copy2(ROOT / source, bundle / target)
    # BOM is necessary for Chinese messages in Windows PowerShell 5.1.
    ps_text = (ROOT / 'installer/Install-Sona.ps1').read_text(encoding='utf-8-sig')
    (bundle / 'Install-Sona.ps1').write_text(ps_text, encoding='utf-8-sig', newline='\r\n')
    cmd_text = (ROOT / 'installer/Install.cmd').read_text(encoding='utf-8')
    (bundle / '一键安装.cmd').write_text(cmd_text, encoding='utf-8', newline='\r\n')
    # Zero-byte extensionless visual hint file at root so users immediately see what to click without opening docs.
    (bundle / '“双击一键安装cmd”即可一键安装(需要管理员权限)').write_bytes(b'')
    (bundle / '安装说明.txt').write_text((ROOT / 'installer/INSTALL.md').read_text(encoding='utf-8'), encoding='utf-8-sig', newline='\r\n')
    loader = bundle / 'PenguLoader'
    loader.mkdir()
    with zipfile.ZipFile(pengu_zip) as archive:
        files = [item for item in archive.infolist() if not item.is_dir()]
        for item in files:
            name = PurePosixPath(item.filename.replace('\\', '/'))
            if name.is_absolute() or '..' in name.parts or len(name.parts) != 1:
                raise ValueError(f'Unexpected path in official Pengu ZIP: {item.filename}')
        if {item.filename for item in files} != set(vendor['pengu']['files']):
            raise ValueError('Official Pengu file list changed')
        for item in files:
            (loader / item.filename).write_bytes(archive.read(item))
    shutil.copy2(ROOT / 'installer/licenses/PenguLoader-MIT.txt', loader / 'LICENSE.txt')
    manifest = {'schema': 1, 'version': version, 'penguVersion': vendor['pengu']['version'], 'penguZipSha256': vendor['pengu']['sha256'], 'files': []}
    for file in sorted(bundle.rglob('*')):
        if file.is_file():
            manifest['files'].append({'path': file.relative_to(bundle).as_posix(), 'sha256': sha256(file)})
    (bundle / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    bundle_map = {
        file.relative_to(bundle).as_posix(): file.read_text(encoding='utf-8') if file.suffix.lower() == '.md' else ''
        for file in bundle.rglob('*')
        if file.is_file()
    }
    verify_markdown_links_in_map(bundle_map, bundle.name)

    all_in_one = output / f'sona-plus-v{version}-one-click-windows.zip'
    write_zip(bundle, all_in_one)
    verify_archive_markdown_links(all_in_one)

    plugin_only = output / f'sona-plus-v{version}.zip'
    with zipfile.ZipFile(plugin_only, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for file in sorted(plugin.rglob('*')):
            if file.is_file():
                rel = file.relative_to(plugin).as_posix()
                if rel == 'README.md':
                    archive.writestr('sona/README.md', standalone_plugin_readme.encode('utf-8'))
                else:
                    archive.write(file, 'sona/' + rel)
        archive.writestr('AKARI评分说明.md', akari_doc_packaged.encode('utf-8'))
    verify_archive_markdown_links(plugin_only)

    (output / 'SHA256SUMS.txt').write_text(''.join(f'{sha256(file)}  {file.name}\n' for file in [all_in_one, plugin_only]), encoding='utf-8')
    print(json.dumps({'version': version, 'bundle': str(bundle), 'files': len(manifest['files']), 'archives': [str(all_in_one), str(plugin_only)]}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pengu-zip', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    package(args.pengu_zip.resolve(), args.output.resolve())
