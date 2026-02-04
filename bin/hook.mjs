#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import OpenAI from "openai";

// 查找项目根目录（包含 package.json 的目录）
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

// 加载 .env 文件
function loadEnv(envPath) {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...vals] = trimmed.split("=");
        if (key && vals.length) {
          process.env[key.trim()] = vals.join("=").trim();
        }
      }
    });
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = findProjectRoot(process.cwd());

// 尝试从多个位置加载 .env
loadEnv(path.join(projectRoot, ".env"));
loadEnv(path.join(process.cwd(), ".env"));

// 配置
const CONFIG = {
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  maxDiffSize: parseInt(process.env.AI_REVIEW_MAX_DIFF_SIZE) || 15000,
  timeout: parseInt(process.env.AI_REVIEW_TIMEOUT) || 30000,
  skipBuild: process.env.AI_REVIEW_SKIP_BUILD === "true",
  buildCommand: process.env.AI_REVIEW_BUILD_COMMAND || "npm run build",
};

const commitMsgFile = process.argv[2];
const commitSource = process.argv[3]; // message, template, merge, squash, commit

// 如果是 merge/squash 或已有 message，跳过处理
if (["merge", "squash", "commit"].includes(commitSource)) {
  console.log("ℹ️  跳过 AI Review（merge/squash/amend 提交）");
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ 未找到 OPENAI_API_KEY，请在项目根目录创建 .env 文件");
  console.error("   示例: OPENAI_API_KEY=sk-your-api-key-here");
  console.log("⚠️  跳过 AI Review，允许提交");
  process.exit(0);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
  timeout: CONFIG.timeout,
});

const SYSTEM_PROMPT = `你是一个资深代码审查员。请分析以下 Git Diff，执行两个任务：

1. **代码审查**：检查是否存在明显的 Bug、安全漏洞或严重的代码规范问题
2. **生成提交信息**：按照 Conventional Commits 规范生成提交信息

返回 JSON 格式：
- 如果代码通过审查：{"is_passed": true, "message": "type(scope): description"}
- 如果代码有问题：{"is_passed": false, "reason": "问题描述和修复建议"}

提交类型：feat, fix, docs, style, refactor, perf, test, chore, ci
注意：只有严重问题才返回 is_passed: false，代码风格建议可以在 reason 中提及但仍然通过`;

async function runAIReview() {
  try {
    // 1. 获取暂存区 Diff
    const diff = execSync("git diff --cached", { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });

    if (!diff.trim()) {
      console.log("ℹ️  没有暂存的更改");
      process.exit(0);
    }

    // 2. 运行构建检查
    if (!CONFIG.skipBuild) {
      console.log(`🔨 正在运行构建检查: ${CONFIG.buildCommand}`);
      try {
        execSync(CONFIG.buildCommand, {
          cwd: projectRoot,
          stdio: "inherit",
          encoding: "utf-8",
        });
        console.log("✅ 构建通过");
      } catch (buildError) {
        console.error("❌ 构建失败，请修复后重新提交");
        console.error("\n使用 git commit --no-verify 可跳过检查");
        process.exit(1);
      }
    }

    // 3. 检查 Diff 大小
    if (diff.length > CONFIG.maxDiffSize) {
      console.warn(`⚠️  Diff 过大 (${(diff.length / 1000).toFixed(1)}KB)，建议分批提交`);
      console.warn(`   当前限制: ${CONFIG.maxDiffSize / 1000}KB，超出部分将被截断`);
    }
    const truncatedDiff = diff.slice(0, CONFIG.maxDiffSize);

    // 4. 调用 OpenAI
    console.log("🔍 正在进行 AI 代码审查...");

    const completion = await openai.chat.completions.create({
      model: CONFIG.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: truncatedDiff },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(completion.choices[0].message.content);

    // 5. 处理结果
    if (result.is_passed) {
      fs.writeFileSync(commitMsgFile, result.message);
      console.log("✅ AI Review 通过");
      console.log(`📝 生成的提交信息: ${result.message}`);
      if (result.suggestions) {
        console.log(`💡 建议: ${result.suggestions}`);
      }
    } else {
      console.error("❌ AI Review 未通过");
      console.error(`📋 原因: ${result.reason}`);
      console.error("\n使用 git commit --no-verify 可跳过检查");
      process.exit(1);
    }
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
      console.error("❌ 无法连接到 OpenAI API，请检查网络");
    } else if (error.status === 401) {
      console.error("❌ API Key 无效，请检查 .env 配置");
    } else if (error.status === 429) {
      console.error("❌ API 请求频率超限，请稍后重试");
    } else {
      console.error("❌ AI Review 出错:", error.message);
    }
    // 出错时允许提交，避免阻塞开发流程
    console.log("⚠️  跳过 AI Review，允许提交");
    process.exit(0);
  }
}

runAIReview();
