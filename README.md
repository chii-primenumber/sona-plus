# Sona Plus

**Sona Plus v1.1.2** 是基于原作者 WJZ_P 开发的 Sona 项目进行二次开发的英雄联盟客户端增强插件。在保留原项目基础能力的同时，chii-primenumber 对项目进行了持续的功能扩展和界面调整，重点涵盖战绩展示、英雄配装与客户端 UI。

原项目作者、版权声明和 AGPL-3.0 许可继续保留；新增和修改的功能由 chii-primenumber 开发与维护。

## 核心功能

- 个人战绩总览、英雄统计、近期队友与对手、分页和多条件筛选。
- 单场十人战报，展示装备、技能、符文、海克斯、经济、伤害、治疗与视野等数据。
- 选人及游戏中的队伍信息面板，并可从多处客户端入口打开玩家战绩。
- 玩家搜索、好友与最近访问、段位详情、回放下载与播放。
- OP.GG 英雄对位和配装推荐，含选取率、胜率与推荐上下文。
- 黑金客户端风格、主题化提示、显示项目设置及原版 Sona 的其他可选工具。

具体功能会受英雄联盟客户端版本、大区和接口返回数据影响。完整安装说明见 [README_个人版.md](README_个人版.md)，功能变更见 [CHANGELOG.md](CHANGELOG.md)。

## 相比原版 Sona 的主要改进

- 扩展个人战绩、十人战报、队伍信息与多入口查询，增加统计、排序和筛选。
- 优化英雄配装、核心出装与海克斯推荐的卡片布局和交互。
- 统一半透明黑金界面、语义提示、弹窗及显示设置。

## 安装与使用

前往 [Sona Plus Releases](https://github.com/chii-primenumber/sona-plus/releases) 下载安装包。已有 Pengu Loader 的用户安装插件包；首次安装可使用 Windows 一键安装包。插件目录继续使用 `sona`，以沿用已有的自定义资源和本机配置。安装步骤及回退方法见 [安装说明](installer/INSTALL.md)。

按 **F1** 打开 Sona Plus 面板。发布包会包含插件、必要资源、安装说明和 SHA256 校验文件。

## 构建

需要 Node.js 及 npm：

```sh
npm ci
npm run build
```

项目使用 React 19、TypeScript、Vite 6，并通过 Pengu Loader 接入英雄联盟客户端。Release 包由 `scripts/package-release.py` 生成。

## 作者与致谢

- **Modified & Maintained by chii-primenumber**：<https://github.com/chii-primenumber>
- Sona Plus 仓库：<https://github.com/chii-primenumber/sona-plus>
- **Original Project by WJZ_P**：<https://github.com/WJZ-P/sona>
- 战绩界面和评分相关实现参考 League Akari；相关版权与 MIT 许可随项目保留。

新增和修改的功能由 chii-primenumber 开发与维护。感谢原作者及上游项目贡献者。

## 开源协议

本项目继续遵循 [GNU AGPL-3.0](LICENSE)。原项目版权与许可证信息保留；分发修改版本时请遵守协议要求。
