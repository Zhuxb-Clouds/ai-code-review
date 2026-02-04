# AI Code Reviewer & Commit Generator

基于 Node.js 和 OpenAI API 的 Git Hooks 集成方案。在执行 `git commit` 时自动进行代码审查，并根据 Diff 自动生成符合 [Conventional Commits](https://www.conventionalcommits.org/) 规范的提交信息。

## 🚀 核心特性

- **自动化审查**：在代码提交前拦截潜在 Bug 或不规范实践
- **语义化提交**：自动撰写符合 Conventional Commits 规范的提交信息
- **无感集成**：通过 Git Hooks 实现，无需改变原有开发习惯
- **成本可控**：支持 Diff 大小限制，避免 Token 浪费
- **一键安装**：作为 npm 包安装到任何项目

---

## 🛠️ 技术架构

```
git commit → Husky (prepare-commit-msg) → ai-review-hook → OpenAI API
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

编辑 `.env`：

```bash
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，用于自定义 API 地址
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
│   └── prepare-commit-msg    # Git Hook（自动创建）
├── .env                      # API Key（自己创建，不要提交！）
├── .env.example              # 配置示例（自动创建）
├── .gitignore                # 已包含 .env
└── package.json              # 包含 ai-code-review 依赖
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

### 特殊情况

```bash
# 跳过 AI 审查（紧急情况）
git commit --no-verify -m "hotfix: urgent fix"

# 带 -m 提交时仍会进行审查，但会使用你提供的消息
git commit -m "your message"
```

---

## ⚙️ 配置选项

通过环境变量配置：

| 环境变量                  | 默认值                      | 说明                                    |
| ------------------------- | --------------------------- | --------------------------------------- |
| `OPENAI_API_KEY`          | -                           | **必填**，OpenAI API Key                |
| `OPENAI_BASE_URL`         | `https://api.openai.com/v1` | 自定义 API 地址                         |
| `OPENAI_MODEL`            | `gpt-4o-mini`               | 模型，可选 `gpt-4o`、`gpt-3.5-turbo` 等 |
| `AI_REVIEW_MAX_DIFF_SIZE` | `15000`                     | 最大 Diff 字符数，超出将被截断          |
| `AI_REVIEW_TIMEOUT`       | `30000`                     | API 请求超时时间（毫秒）                |

---

## 🔄 替代方案对比

| 方案                                              | 优点                              | 缺点                   |
| ------------------------------------------------- | --------------------------------- | ---------------------- |
| **本方案 (ai-code-review)**                       | 一键安装、代码审查 + 提交信息生成 | 需要 OpenAI API Key    |
| [aicommits](https://github.com/Nutlope/aicommits) | 开箱即用的 CLI                    | 不含代码审查功能       |
| [cz-git](https://cz-git.qbb.sh/) + AI             | 交互式提交、规范完善              | 配置较复杂             |
| GitHub Copilot                                    | IDE 集成、体验好                  | 需要订阅、无 Hook 集成 |

---

## ⚠️ 注意事项

1. **网络环境**：确保可访问 OpenAI API（或配置代理/自定义 Base URL）
2. **成本控制**：
   - 默认使用 `gpt-4o-mini`，成本约为 GPT-4 的 1/10
   - 大改动建议分批 `git add` 提交
3. **安全**：`.env` 文件绝对不要提交到仓库
4. **容错**：脚本在 API 出错时会允许提交，不阻塞开发

---

## 📄 License

MIT
