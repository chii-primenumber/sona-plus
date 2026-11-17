# Sona Plus v1.0.0

Sona Plus v1.0.0 是个人长期维护的 Sona 衍生版本首次以独立品牌和版本体系发布。这是衍生项目的首个正式版本，不是原版 Sona 的 v1.0.0。

## 主要内容

- 整合个人战绩总览、英雄统计、近期队友与对手、筛选和分页。
- 提供十人单场战报，展示装备、技能、符文、海克斯以及伤害、经济、治疗和视野数据。
- 在选人和游戏过程中查看队伍信息，并从多个客户端入口访问玩家战绩。
- 提供玩家搜索、好友与最近访问、段位详情和回放下载/播放。
- 扩展 OP.GG 英雄对位与配装推荐，并优化战绩、配装和插件界面的显示。

## 界面与兼容

- 游戏进行中，客户端的“对局详情”和“配装推荐”使用原生文字按钮。
- 插件页面、战绩弹窗、配装页及下拉列表的滚动条只在滚动时显示，停止约 0.9 秒后隐藏，拖动期间保持可见。
- 延续个人版既有配置、自定义资源、插件目录及符文页，版本独立从 1.0.0 开始。

## 衍生关系与许可

- **Original Project by WJZ_P**：<https://github.com/WJZ-P/sona>
- **Modified & Maintained by chii-primenumber**：<https://github.com/chii-primenumber>
- Sona Plus repository：<https://github.com/chii-primenumber/sona-plus>
- 基于原版 Sona 继续遵循 AGPL-3.0；原作者版权与许可声明保留。新增和修改功能由 chii-primenumber 开发与维护。

## 安装

从 [Sona Plus Releases](https://github.com/chii-primenumber/sona-plus/releases) 下载插件包或 Windows 一键安装包。插件目录继续使用 `sona`，以兼容已有设置和自定义资源。安装前请阅读包内安装说明。

- `sona-plus-v1.0.0-one-click-windows.zip`：含官方 Pengu Loader v1.1.6 的完整 Windows 一键安装包。
- `sona-plus-v1.0.0.zip`：供已有 Pengu Loader 的用户使用的插件包。
- `SHA256SUMS.txt`：以上安装包的 SHA256 校验值。

本版本已通过生产构建、数据模型、完整浏览器模拟回归及隔离安装/回退检查；尚未完成真实客户端加载验证。更新前退出客户端，安装后完整重启生效。
