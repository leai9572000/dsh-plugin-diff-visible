# dsh-plugin-diff-visible

让 DeepSeek Harness Web GUI 里的 `write` / `edit` 工具卡片**默认展开**，代码改动一眼可见，
并且把带行号信息的 diff 渲染成 **git 风格 unified diff**（行号栏 + `@@` 头 + 红绿增删行）。

## 做了什么

注册 `tool.call.toolview` 槽位的 `write` 和 `edit` 条目，**优先级低于**内置的文件变更行，
因此这一行会**覆盖（shadow）**内置实现。与内置版本的两点行为差异：

1. **diff 卡片默认展开**——不需要点一下才看到改动；
2. 当文件系统工具附带了 hunk 行号（`oldStart` / `newStart` 以及交错的 `rows`）时，
   diff 渲染为 git 风格的 unified diff：带行号栏、`@@` 头、红绿 `+/-` 行。

没有行号信息的 diff（运行中的调用、回放旧会话）自动回退到共享的 `DiffBlock`。

## 界面位置

`tool.call.toolview` 插槽——工具调用卡片区域，覆盖内置的 `write` / `edit` 行。

## 样式

自带 CSS 通过 `style[data-plugin-css]` 去重注入，类名前缀统一为 `dshdv_`
（`dsh` + `diff` + `visible`），全部使用 DSH 的设计令牌（`--dsw-alias-*`、`--ds-font-family-code`），
因此自动适配明暗主题，不需要额外样式。

`DisclosureRow` / `DiffBlock` / `StateDot` 的样式由 shell 自带样式表提供。

## 安全边界

- 纯浏览器端插件，宿主端（`lib/index.js`）是空实现（`export function apply() {}`）。
- 不引入任何第三方依赖，不发起任何网络请求。
- 只读渲染，不修改会话数据。

## 安装

### 从 GitHub 安装（推荐）

```bash
dsh plugin --profile web add github:leai9572000/dsh-plugin-diff-visible
```

`dsh plugin` 会转发给 pnpm，在 profile 目录完成安装。装完后把包名登记进
`~/.dsh/profiles/web/package.json` 的 bundle 列表（DSH 0.1.2-rc.1 需要手工登记）：

```json
{
  "dsh": { "profile": { "bundles": ["…已有 bundle…", "dsh-plugin-diff-visible"] } }
}
```

然后重启 `dsh web`。

> 注意：这个插件声明了 `dsh.client.inject: ["@deepseek-ai/dsh-client-runtime"]`，
> 它依赖 DSH 的客户端运行时注入，因此必须在 profile 的 `bundles` 里登记后才会生效。

### 从本机源码安装（开发时）

```json
{
  "dependencies": { "dsh-plugin-diff-visible": "file:/绝对路径/dsh-plugin-diff-visible" },
  "dsh": { "profile": { "bundles": ["…已有 bundle…", "dsh-plugin-diff-visible"] } }
}
```

在该目录执行 `pnpm install` 并重启 `dsh web`。

### ⚠️ 改了源码却不生效？先看这里

`nodeLinker: hoisted` 模式下，pnpm 把 `file:` 依赖**拷贝**进
`~/.dsh/profiles/web/node_modules/<name>`，不是软链。所以直接改源码目录后重启服务，
跑的还是那份旧拷贝。

处理方式（二选一）：

1. 在 `~/.dsh/profiles/web` 重新跑 `pnpm install`，让拷贝刷新；
2. 把安装位置换成指向源码的软链（推荐，之后改源码即生效）：

```bash
cd ~/.dsh/profiles/web/node_modules/dsh-plugin-diff-visible
rm -rf lib && ln -s /绝对路径/dsh-plugin-diff-visible/lib lib
```

注意：后续再次 `pnpm install` 可能把软链改回拷贝，到时重做一次。

客户端插件改动需要 `dsh web` 重启；若同时跑着 `pnpm run dev:web` 构建监听，
客户端 bundle 会重新打包并热更新。

## License

MIT
