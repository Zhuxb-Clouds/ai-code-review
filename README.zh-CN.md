# AI Code Reviewer & Commit Generator

[English](./README.md) | [简体中文]

基于 Node.js 和 OpenAI-compatible API 的 Git Hooks 集成方案。在执行 `git commit` 时自动进行代码审查，并根据 Diff 自动生成符合 [Conventional Commits](https://www.conventionalcommits.org/) 规范的提交信息。

**支持的 AI 提供商**: OpenAI, DeepSeek

## 🚀 核心特性

- **自动化审查**：在代码提交前拦截潜在 Bug 或不规范实践
- **语义化提交**：自动撰写符合 Conventional Commits 规范的提交信息
- **无感集成**：通过 Git Hooks 实现，无需改变原有开发习惯
- **成本可控**：支持 Diff 大小限制，避免 Token 浪费
- **一键安装**：作为 npm 包安装到任何项目
- **多提供商支持**：支持 OpenAI、DeepSeek 等兼容 API
- **代理支持**：支持 HTTP/HTTPS/SOCKS5 代理

---

## 🛠️ 技术架构

```
git commit → Husky (prepare-commit-msg) → ai-review-hook → AI API (OpenAI/DeepSeek)
                                                 ↓
                                    ✅ 通过：自动填充 Commit Message
                                    ❌ 失败：拦截提交并输出建议
```

---

## 📦 快速开始

### 1. 安装到你的项目

```bash
# 安装为开发依赖
npm install ai-code-review -D

# 初始化（自动安装 Husky 并配置 Git Hook）
npx ai-review init
```

### 2. 配置环境变量

复制生成的 `.env.example` 为 `.env` 并填入你的 API Key：

```bash
cp .env.example .env
```

#### 使用 OpenAI

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-key-here
OPENAI_MODEL=gpt-4o-mini
```

#### 使用 DeepSeek

```bash
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-deepseek-key-here
# OPENAI_MODEL=deepseek-chat  # 可选，默认 deepseek-chat
```

#### 使用代理

```bash
HTTPS_PROXY=http://127.0.0.1:7890
```

> ⚠️ **安全提示**：`.env` 已自动添加到 `.gitignore`，请勿手动提交！

### 3. 开始使用

```bash
# 正常开发并暂存更改
git add .

# 发起提交（推荐不带 -m，让 AI 生成）
git commit

# AI 会自动审查并生成提交信息
# 🔍 正在进行 AI 代码审查...
# ✅ AI Review 通过
# 📝 生成的提交信息: feat(auth): add JWT token validation
```

---

## 📂 安装后的目录结构

```
your-project/
├── .husky/
│   └── prepare-commit-msg     # Git Hook（自动创建）
├── .env                       # API Key（自己创建，不要提交！）
├── .env.example               # 配置示例（自动创建）
├── .reviewignore              # AI 审查忽略文件（可选）
├── .reviewignore.example      # 忽略规则示例（自动创建）
├── .gitignore                 # 已包含 .env
└── package.json               # 包含 ai-code-review 依赖
```

---

## 🚫 文件忽略配置 (.reviewignore)

创建 `.reviewignore` 文件来跳过某些文件的 AI 审查，语法类似 `.gitignore`：

```bash
# 复制示例文件
cp .reviewignore.example .reviewignore
```

### 支持的语法

```gitignore
# 注释
# 这是一个注释

# 通配符
package-lock.json   # 匹配特定文件
*.min.js            # * 匹配任意字符（不包括 /）
dist/               # 匹配整个目录
**/*.snap           # ** 匹配任意路径层级

# 否定模式
*.md                # 忽略所有 markdown
!README.md          # 但不忽略 README.md
```

### 常见配置示例

```gitignore
# 锁文件
package-lock.json
pnpm-lock.yaml
yarn.lock

# 生成的文件
*.min.js
*.bundle.js
dist/
build/

# 文档和资源
*.md
*.svg
*.png

# 测试快照
__snapshots__/
*.snap
```

---

## ⌨️ CLI 命令

```bash
# 完整初始化（安装 Husky + 配置 Hook）
npx ai-review init

# 仅配置 Hook（如果 Husky 已安装）
npx ai-review setup

# 显示帮助
npx ai-review help
```

### 跳过 AI Review

```bash
# 使用 -m 参数时自动跳过 AI 生成（直接使用你的消息）
git commit -m "feat: your message"

# merge/squash/amend 提交也会自动跳过
git merge feature-branch
git commit --amend
```

---

## ⚙️ 配置选项

通过环境变量配置：

### 基础配置

| 环境变量           | 默认值   | 说明                                                             |
| ------------------ | -------- | ---------------------------------------------------------------- |
| `AI_PROVIDER`      | `openai` | AI 提供商：`openai` 或 `deepseek`                                |
| `OPENAI_API_KEY`   | -        | OpenAI API Key（使用 OpenAI 时必填）                             |
| `DEEPSEEK_API_KEY` | -        | DeepSeek API Key（使用 DeepSeek 时必填）                         |
| `OPENAI_BASE_URL`  | 自动设置 | 自定义 API 地址（可覆盖默认）                                    |
| `OPENAI_MODEL`     | 自动设置 | 模型名称（OpenAI 默认 gpt-4o-mini，DeepSeek 默认 deepseek-chat） |

### 网络配置

| 环境变量      | 默认值 | 说明                       |
| ------------- | ------ | -------------------------- |
| `HTTPS_PROXY` | -      | HTTP/HTTPS/SOCKS5 代理地址 |
| `HTTP_PROXY`  | -      | 同上，备选                 |

### 行为配置

| 环境变量                  | 默认值          | 说明                       |
| ------------------------- | --------------- | -------------------------- |
| `AI_REVIEW_MAX_DIFF_SIZE` | `15000`         | 最大 Diff 字符数，超出截断 |
| `AI_REVIEW_TIMEOUT`       | `30000`         | API 请求超时时间（毫秒）   |
| `AI_REVIEW_MAX_RETRIES`   | `3`             | 失败时最大重试次数         |
| `AI_REVIEW_RETRY_DELAY`   | `1000`          | 重试间隔时间（毫秒）       |
| `AI_REVIEW_VERBOSE`       | `false`         | 启用详细日志               |
| `AI_REVIEW_SKIP_BUILD`    | `false`         | 跳过构建检查               |
| `AI_REVIEW_BUILD_COMMAND` | `npm run build` | 构建命令                   |

---

## 📄 License

MIT
