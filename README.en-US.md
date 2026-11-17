# Sona Plus

**Sona Plus v1.0.0** is a customized and extended version of the original Sona League of Legends client plugin by WJZ_P. It preserves the original project's foundations while adding ongoing enhancements by chii-primenumber, especially for match history presentation, champion builds, and client UI.

Sona Plus is a derivative of the original Sona project. The original author, copyright notices, and AGPL-3.0 license remain acknowledged. New and modified features are developed and maintained by chii-primenumber.

## Features

- Player match-history overview, champion statistics, recent teammates and opponents, pagination, and filters.
- Ten-player match reports with items, abilities, runes, augments, economy, damage, healing, and vision data.
- Team overviews in champion select and in-game, with multiple client entry points to player profiles.
- Player search, friends and recent visits, rank details, and replay download/playback controls.
- OP.GG matchups and item-build recommendations with pick-rate and win-rate information.
- A League client-inspired dark and gold interface, themed tooltips, display settings, and retained optional Sona tools.

Feature availability depends on the League client version, region, and data returned by client APIs. See the [Chinese installation guide](README_个人版.md) and [changelog](CHANGELOG.md).

## Enhancements over original Sona

- Extended player history, ten-player reports, team information, statistics, sorting, filters and client entry points.
- Refined item-build, core-build and augment recommendation layouts and interactions.
- A consistent translucent black-and-gold interface with semantic tooltips, dialogs and display settings.

## Installation

Download a package from [Sona Plus Releases](https://github.com/chii-primenumber/sona-plus/releases). Existing Pengu Loader users can install the plugin package; first-time users can use the Windows installer. The plugin folder remains `sona` to preserve existing custom assets and local settings. See the [installation instructions](installer/INSTALL.md).

Press **F1** to open the Sona Plus panel.

## Build

Requires Node.js and npm:

```sh
npm ci
npm run build
```

The project uses React 19, TypeScript, Vite 6, and Pengu Loader. Release packages are prepared with `scripts/package-release.py`.

## Authors and acknowledgements

- **Modified & Maintained by chii-primenumber**: <https://github.com/chii-primenumber>
- Sona Plus repository: <https://github.com/chii-primenumber/sona-plus>
- **Original Project by WJZ_P**: <https://github.com/WJZ-P/sona>
- Match-history presentation and rating work also draws on League Akari; its notices and MIT license are retained.

New and modified features are developed and maintained by chii-primenumber. Thanks to the original author and upstream contributors.

## License

This project continues under the [GNU AGPL-3.0](LICENSE). Original copyright notices and license information are retained.
