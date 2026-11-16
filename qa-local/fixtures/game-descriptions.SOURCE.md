# 悬停文本样本

采集日期：2026-11-17。样本仅用于开发验证，不随插件安装；模拟图标与真实客户端图标分开。

- Riot 客户端中文静态资料（CommunityDragon 镜像）：[items.json](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/zh_cn/v1/items.json)、[perks.json](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/zh_cn/v1/perks.json)、[perkstyles.json](https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/zh_cn/v1/perkstyles.json)。选取残疫 3118、召唤：艾黎 8214、五种符文系 tooltip；运行时仍读取当前客户端原有资源请求。
- ARAMKit 16.22 资源：[装备](https://data.aramkit.cn/resources/16.22-8a495cc12b20/zh-CN/resources/items.json)、[强化](https://data.aramkit.cn/resources/16.22-8a495cc12b20/zh-CN/resources/augments.json)。选取残疫 3118 与泰坦的坚决 1001，保留结构化 semantic。
- 配色核对 [ARAMKit 官方站样式](https://aramkit.cn/_nuxt/entry.Bb438qau.css) 中的 game-tooltip 语义色，并保留 Riot 原文 font 的十六进制色。装备属性数字按本次要求统一为金色；不根据数值推测伤害种类，不把缺失字段补为 0。

生涯背景选择使用客户端的 splashPath 主体构图，兼容 centeredSplashPath，只有缺少前两项时才读取 uncenteredSplashPath。没有对某一张共享原画写死位置或英雄 ID。
