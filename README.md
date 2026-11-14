# dsh-podcast-panel

> 🐧 **AI 学习群：1132348296**（在 QQ 里搜群号就能加）— 一起听、一起拆、一起把 AI 用进日常。

在 DSH 侧栏放一个播客播放器：订阅 RSS / 小宇宙链接，倍速听、记住进度、每集给三行摘要。

解决一个很小的痛点：想听播客，却要来回切 App；听到一半丢了进度；听完想记一句，又懒得开笔记。

## 三大亮点

- **就在工作台里听，不用切窗口**：左侧「播客」入口和 AI 对话是同一个侧栏，听到一句好话，直接复制给 AI 接着聊。
- **进度真的记得住**：每 5 秒存一次，切走、刷新、关掉 DSH 都不丢；听完的自动标「已听完」，下次从上次的位置继续。
- **每集先给你三行**：从 show notes 里抽三句 + 一句金句，决定要不要花 40 分钟。没有 show notes 就老老实实说没有，不编。

---

## 安装

```bash
dsh plugin --profile desktop add https://github.com/clair0314/dsh-podcast-panel/releases/download/v0.1.1/dsh-podcast-panel-0.1.1.tgz
```

> npm 上的 `dsh-podcast-panel@0.1.0` 是早一版，暂未更新；优先用上面的 Release tgz。

本地开发：

```bash
dsh plugin --profile desktop add /path/to/podcast-panel
```

装完重启 DSH（客户端的 bundle 在启动时构建），左侧栏会出现「🎧 播客」。

## 用法

1. 点左侧「播客」。
2. 粘贴小宇宙 / RSS 链接 → 订阅。小宇宙在节目页「分享 → 复制链接」。
3. 点一集开始听：播放/暂停、±15 秒、0.75–2 倍速、拖进度条。
4. 「三行摘要」看这集讲什么；「节目页」跳回原站。

对话里也可以用命令：

```
/podcast add https://example.com/feed.xml
/podcast list
/podcast refresh
```

## 配置

| 配置 | 位置 | 默认 |
| --- | --- | --- |
| 数据目录 | 插件 config 的 `dataDir`，或环境变量 `DSH_PODCAST_HOME` | `~/.dsh/podcast-panel` |
| 播放速度 | 面板里的倍速下拉框 | `1×` |
| 自动保存进度 | 固定每 5 秒 | — |

数据只有两个文件：`state.json`（订阅、剧集元数据、播放进度）和你的 DSH 配置。没有账号，没有云端。

## 它怎么工作

- 订阅：服务端拉取 RSS / Atom，解析 `<item>` / `<entry>`，优先 `<itunes:summary>` / `<description>`，没有就用 `<content:encoded>`；每个源最多留 200 集。
- 播放：音频走 `/podcast-panel/audio?u=<base64url>` 代理。代理会拒绝本机/内网地址（SSRF 防护），支持 HTTP Range，所以能拖进度条。
- 摘要：纯本地启发式——从 show notes 里挑三句 + 一句不超过 80 字的金句。不调用任何模型。
- 路由：`GET /podcast-panel/api/state`、`GET /podcast-panel/api/summary?id=`、`POST /podcast-panel/api/feeds`、`POST /podcast-panel/api/feeds/remove`、`POST /podcast-panel/api/feeds/refresh`、`POST /podcast-panel/api/progress`、`POST /podcast-panel/api/settings`。

## 边界（先说清楚）

- 不做倍速之外的音效、EQ、降噪。
- 不做播客搜索/推荐，也不内置任何节目源；你给什么链接就订阅什么。
- 三行摘要是抽取式，不是 AI 总结；想更准可以接自己的模型，欢迎提 issue。
- 单个订阅源上限 24MB；超过会直接拒绝，避免拖垮 DSH。

## 开发

```bash
node test/selftest.mjs      # 20 项，零网络
```

结构：`lib/index.js`（host：RSS 解析、状态、路由、命令）、`lib/client.js`（浏览器：侧栏入口、播放器面板）、`cordis.patch.yml`（一行 insert）。

## License

MIT © 2026 clair0314
