# AI Code Reviewer & Commit Generator

[English] | [简体中文](./README.zh-CN.md)

A Git Hooks integration solution built with Node.js and OpenAI-compatible APIs. It automatically performs code reviews during `git commit` and generates commit messages that follow the [Conventional Commits](https://www.conventionalcommits.org/) specification based on your code changes.

**Supported AI Providers**: OpenAI, DeepSeek, and more.

## 🚀 Key Features

* **Automated Review**: Intercepts potential bugs or sub-optimal practices before the commit is finalized.
* **Semantic Commits**: Automatically drafts commit messages adhering to the Conventional Commits standard.
* **Seamless Integration**: Powered by Git Hooks; requires no changes to your existing development workflow.
* **Cost Efficiency**: Supports diff size limits to prevent excessive Token usage.
* **One-Click Installation**: Easily installable as an npm package in any project.
* **Multi-Provider Support**: Compatible with OpenAI, DeepSeek, and other OpenAI-compliant APIs.
* **Proxy Support**: Full support for HTTP/HTTPS/SOCKS5 proxies.

---

## 🛠️ Technical Architecture

```
git commit → Husky (prepare-commit-msg) → ai-review-hook → AI API (OpenAI/DeepSeek)
                                                 ↓
                                    ✅ Pass: Auto-fill Commit Message
                                    ❌ Fail: Block commit & output suggestions

```

---

## 📦 Quick Start

### 1. Install in your project

```bash
# Install as a dev dependency
npm install ai-code-review -D

# Initialize (Automatically installs Husky and configures Git Hooks)
npx ai-review init

```

### 2. Configure Environment Variables

Copy the generated `.env.example` to `.env` and enter your API Key:

```bash
cp .env.example .env

```

#### Using OpenAI

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-key-here
OPENAI_MODEL=gpt-4o-mini

```

#### Using DeepSeek

```bash
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-deepseek-key-here
# OPENAI_MODEL=deepseek-chat  # Optional, defaults to deepseek-chat

```

#### Using Proxies

```bash
HTTPS_PROXY=http://127.0.0.1:7890

```

> ⚠️ **Security Note**: `.env` is automatically added to `.gitignore`. Never commit your API keys!

### 3. Usage

```bash
# Develop and stage your changes as usual
git add .

# Execute commit (Recommended: omit -m to let AI generate the message)
git commit

# AI will automatically review and generate the message
# 🔍 Running AI Code Review...
# ✅ AI Review Passed
# 📝 Generated Message: feat(auth): add JWT token validation

```

---

## 📂 Post-Installation Directory Structure

```
your-project/
├── .husky/
│   └── prepare-commit-msg     # Git Hook (Auto-generated)
├── .env                       # API Keys (User-created, do not commit!)
├── .env.example               # Configuration template (Auto-generated)
├── .reviewignore              # AI Review ignore file (Optional)
├── .reviewignore.example      # Ignore rules template (Auto-generated)
├── .gitignore                 # Now includes .env
└── package.json               # Contains ai-code-review dependency

```

---

## 🚫 File Exclusion (.reviewignore)

Create a `.reviewignore` file to skip AI reviews for specific files. The syntax is identical to `.gitignore`:

```bash
# Copy the example file
cp .reviewignore.example .reviewignore

```

### Supported Syntax

```gitignore
# Comments
# This is a comment

# Wildcards
package-lock.json   # Match specific file
*.min.js            # * matches any string (excluding /)
dist/               # Match entire directory
**/*.snap           # ** matches any path depth

# Negation patterns
*.md                # Ignore all markdown files
!README.md          # Do NOT ignore README.md

```

### Common Configuration Examples

```gitignore
# Lock files
package-lock.json
pnpm-lock.yaml
yarn.lock

# Generated files
*.min.js
*.bundle.js
dist/
build/

# Docs and Assets
*.md
*.svg
*.png

# Test Snapshots
__snapshots__/
*.snap

```

---

## ⌨️ CLI Commands

```bash
# Full Initialization (Install Husky + Config Hook)
npx ai-review init

# Configure Hook Only (If Husky is already installed)
npx ai-review setup

# Display help information
npx ai-review help

```

### Skipping AI Review

```bash
# Manual messages using -m will automatically skip AI generation
git commit -m "feat: your manual message"

# Merge, squash, and amend operations also skip the review automatically
git merge feature-branch
git commit --amend

```

---

## ⚙️ Configuration Options

Configure your setup via environment variables in the `.env` file:

### Base Configuration

| Variable           | Default  | Description                                               |
| ------------------ | -------- | --------------------------------------------------------- |
| `AI_PROVIDER`      | `openai` | AI Provider: `openai` or `deepseek`                       |
| `OPENAI_API_KEY`   | -        | OpenAI API Key (Required if using OpenAI)                 |
| `DEEPSEEK_API_KEY` | -        | DeepSeek API Key (Required if using DeepSeek)             |
| `OPENAI_BASE_URL`  | Auto     | Custom API endpoint URL                                   |
| `OPENAI_MODEL`     | Auto     | Model name (OpenAI: gpt-4o-mini, DeepSeek: deepseek-chat) |

### Network Configuration

| Variable      | Default | Description                     |
| ------------- | ------- | ------------------------------- |
| `HTTPS_PROXY` | -       | HTTP/HTTPS/SOCKS5 proxy address |
| `HTTP_PROXY`  | -       | Alternative proxy address       |

### Behavior Configuration

| Variable                  | Default | Description                                    |
| ------------------------- | ------- | ---------------------------------------------- |
| `AI_REVIEW_MAX_DIFF_SIZE` | `15000` | Max characters in diff (truncated if exceeded) |
| `AI_REVIEW_TIMEOUT`       | `30000` | API request timeout in milliseconds            |
| `AI_REVIEW_MAX_RETRIES`   | `3`     | Max retries on failure                         |
| `AI_REVIEW_RETRY_DELAY`   | `1000`  | Delay between retries in milliseconds          |
| `AI_REVIEW_VERBOSE`       | `false` | Enable detailed logging                        |

### Build Checks (Optional)

Build checks have been moved to the hook script. You can customize them by editing `.husky/prepare-commit-msg`:

```bash
# Open the hook file
vim .husky/prepare-commit-msg

# Uncomment the following lines to enable build checks
echo "🔨 Running build check..."
npm run build || exit 1
echo "✅ Build passed"

```

---

## 📄 License

MIT
