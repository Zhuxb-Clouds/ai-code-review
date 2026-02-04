#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 查找项目根目录
function findProjectRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

const projectRoot = findProjectRoot(process.cwd());
const command = process.argv[2];

const HOOK_CONTENT = `#!/bin/sh

# AI Code Review Hook
# 将 Git 提供的参数传递给脚本
# $1: 提交消息文件路径
# $2: 提交来源 (message, template, merge, squash, commit)
npx ai-review-hook "$1" "$2"
`;

const ENV_EXAMPLE = `# OpenAI API 配置
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1

# 可选配置
# OPENAI_MODEL=gpt-4o-mini
# AI_REVIEW_MAX_DIFF_SIZE=15000
# AI_REVIEW_TIMEOUT=30000
`;

function showHelp() {
  console.log(`
AI Code Review CLI

用法:
  ai-review init       初始化 Husky 并配置 Git Hook
  ai-review setup      仅配置 Git Hook（假设 Husky 已安装）
  ai-review help       显示帮助信息

初始化后:
  1. 在项目根目录创建 .env 文件并配置 OPENAI_API_KEY
  2. 正常使用 git add && git commit 即可

跳过检查:
  git commit --no-verify -m "your message"
`);
}

function initHusky() {
  console.log("🚀 初始化 AI Code Review...\n");

  // 检查是否在 Git 仓库中
  try {
    execSync("git rev-parse --git-dir", { cwd: projectRoot, stdio: "ignore" });
  } catch {
    console.error("❌ 当前目录不是 Git 仓库，请先执行 git init");
    process.exit(1);
  }

  // 检查 husky 是否已安装
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  const hasHusky = packageJson.devDependencies?.husky || packageJson.dependencies?.husky;

  if (!hasHusky) {
    console.log("📦 安装 Husky...");
    try {
      execSync("npm install husky -D", { cwd: projectRoot, stdio: "inherit" });
    } catch {
      console.error("❌ Husky 安装失败");
      process.exit(1);
    }
  }

  // 初始化 husky
  console.log("\n🔧 初始化 Husky...");
  try {
    execSync("npx husky init", { cwd: projectRoot, stdio: "inherit" });
  } catch {
    // husky init 可能已经执行过，继续
  }

  setupHook();
}

function setupHook() {
  const huskyDir = path.join(projectRoot, ".husky");

  // 确保 .husky 目录存在
  if (!fs.existsSync(huskyDir)) {
    fs.mkdirSync(huskyDir, { recursive: true });
  }

  // 创建 prepare-commit-msg hook
  const hookPath = path.join(huskyDir, "prepare-commit-msg");
  fs.writeFileSync(hookPath, HOOK_CONTENT);
  fs.chmodSync(hookPath, "755");
  console.log("✅ 创建 Git Hook: .husky/prepare-commit-msg");

  // 创建 .env.example
  const envExamplePath = path.join(projectRoot, ".env.example");
  if (!fs.existsSync(envExamplePath)) {
    fs.writeFileSync(envExamplePath, ENV_EXAMPLE);
    console.log("✅ 创建配置示例: .env.example");
  }

  // 更新 .gitignore
  const gitignorePath = path.join(projectRoot, ".gitignore");
  let gitignoreContent = "";
  if (fs.existsSync(gitignorePath)) {
    gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
  }
  if (!gitignoreContent.includes(".env")) {
    fs.appendFileSync(gitignorePath, "\n# Environment variables\n.env\n.env.local\n");
    console.log("✅ 更新 .gitignore: 添加 .env");
  }

  console.log(`
🎉 配置完成！

下一步:
  1. 复制 .env.example 为 .env 并填入你的 OpenAI API Key:
     cp .env.example .env

  2. 正常提交代码即可:
     git add .
     git commit

  跳过检查:
     git commit --no-verify -m "your message"
`);
}

// 主逻辑
switch (command) {
  case "init":
    initHusky();
    break;
  case "setup":
    setupHook();
    break;
  case "help":
  case "--help":
  case "-h":
    showHelp();
    break;
  default:
    showHelp();
    break;
}
