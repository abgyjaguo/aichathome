# ChatGPT 对话导出 JSON 查看器（纯前端）

在浏览器中查看 ChatGPT 导出的对话 JSON（含 `mapping` / `current_node` 的结构），支持：

- 选择文件 / 拖拽加载
- 搜索（按内容）
- 显示/隐藏 `system` 消息
- 显示/隐藏被标记为“视觉隐藏”的消息
- 多分支对话：支持选择不同 `leaf` 分支

## 快速开始

1. 打开 `index.html`
2. 点击「选择 JSON」或直接拖拽 JSON 文件到页面

> 提示：如果想使用「加载示例」按钮，请用本地 HTTP 服务打开页面（见下文）。浏览器在 `file://` 模式下通常无法 `fetch` 同目录文件。

## 本地启动（推荐）

```bash
python -m http.server 8000
```

打开：

```text
http://localhost:8000/
```

## 隐私

建议不要把你自己的对话导出 JSON 提交到 Git 仓库或上传到公开网络。本项目已在 `.gitignore` 中默认忽略根目录下的 `*.json` 文件。

## 许可证

- 本项目：MIT（见 `LICENSE`）
- 第三方依赖：见 `THIRD_PARTY_NOTICES.md`

