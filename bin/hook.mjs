#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { HttpsProxyAgent } from "https-proxy-agent";

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

// AI 提供商预设配置
const AI_PROVIDERS = {
  openai: {
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    envKey: "OPENAI_API_KEY",
  },
  deepseek: {
    baseURL: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    envKey: "DEEPSEEK_API_KEY",
  },
  // 可扩展更多提供商
};

// 获取当前 AI 提供商配置
function getAIConfig() {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  const preset = AI_PROVIDERS[provider] || AI_PROVIDERS.openai;

  // 优先使用专用 API Key，否则使用通用 OPENAI_API_KEY
  const apiKey = process.env[preset.envKey] || process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || preset.baseURL;
  const model = process.env.OPENAI_MODEL || preset.defaultModel;

  return { provider, apiKey, baseURL, model };
}

const aiConfig = getAIConfig();

// 配置
const CONFIG = {
  model: aiConfig.model,
  maxDiffSize: parseInt(process.env.AI_REVIEW_MAX_DIFF_SIZE) || 15000,
  timeout: parseInt(process.env.AI_REVIEW_TIMEOUT) || 30000,
  skipBuild: process.env.AI_REVIEW_SKIP_BUILD === "true",
  buildCommand: process.env.AI_REVIEW_BUILD_COMMAND || "npm run build",
  verbose: process.env.AI_REVIEW_VERBOSE === "true",
  maxRetries: parseInt(process.env.AI_REVIEW_MAX_RETRIES) || 3,
  retryDelay: parseInt(process.env.AI_REVIEW_RETRY_DELAY) || 1000,
};

// 日志函数
function log(msg) {
  console.log(msg);
}

function logVerbose(msg) {
  if (CONFIG.verbose) {
    console.log(`[DEBUG] ${msg}`);
  }
}

function logTime(label) {
  if (CONFIG.verbose) {
    return { start: Date.now(), label };
  }
  return null;
}

function logTimeEnd(timer) {
  if (timer && CONFIG.verbose) {
    console.log(`[DEBUG] ${timer.label}: ${Date.now() - timer.start}ms`);
  }
}

// 延迟函数
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 带重试的 API 调用
async function callWithRetry(fn, retries = CONFIG.maxRetries) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 不可重试的错误
      if (error.status === 401 || error.status === 403) {
        throw error;
      }

      // 速率限制，等待更长时间
      if (error.status === 429) {
        const waitTime = CONFIG.retryDelay * attempt * 2;
        logVerbose(`速率限制，等待 ${waitTime}ms 后重试...`);
        await sleep(waitTime);
        continue;
      }

      // 网络错误或服务器错误，重试
      if (attempt < retries) {
        const waitTime = CONFIG.retryDelay * attempt;
        logVerbose(`请求失败 (${error.message})，${waitTime}ms 后重试 (${attempt}/${retries})...`);
        await sleep(waitTime);
      }
    }
  }
  throw lastError;
}

// 加载 .reviewignore 文件并解析为正则表达式
function loadReviewIgnore() {
  const ignorePatterns = [];
  const ignoreFiles = [
    path.join(projectRoot, ".reviewignore"),
    path.join(process.cwd(), ".reviewignore"),
  ];

  for (const ignoreFile of ignoreFiles) {
    if (fs.existsSync(ignoreFile)) {
      logVerbose(`加载 .reviewignore: ${ignoreFile}`);
      const content = fs.readFileSync(ignoreFile, "utf-8");
      content.split("\n").forEach((line) => {
        const trimmed = line.trim();
        // 跳过空行和注释
        if (trimmed && !trimmed.startsWith("#")) {
          ignorePatterns.push(trimmed);
        }
      });
      break; // 只使用找到的第一个 .reviewignore
    }
  }

  return ignorePatterns;
}

// 将 gitignore 风格的 pattern 转换为正则表达式
function patternToRegex(pattern) {
  // 处理否定模式
  if (pattern.startsWith("!")) {
    return { regex: patternToRegex(pattern.slice(1)).regex, negated: true };
  }

  let regexStr = pattern
    // 转义正则特殊字符（除了 * 和 ?）
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // ** 匹配任意路径（包括 /）
    .replace(/\*\*/g, "{{DOUBLE_STAR}}")
    // * 匹配任意字符（不包括 /）
    .replace(/\*/g, "[^/]*")
    // ? 匹配单个字符
    .replace(/\?/g, "[^/]")
    // 还原 **
    .replace(/{{DOUBLE_STAR}}/g, ".*");

  // 如果 pattern 以 / 开头，匹配从根目录开始
  if (pattern.startsWith("/")) {
    regexStr = "^" + regexStr.slice(2); // 移除开头的 \\/
  } else {
    // 否则匹配任意位置
    regexStr = "(^|/)" + regexStr;
  }

  // 如果 pattern 以 / 结尾，只匹配目录
  if (pattern.endsWith("/")) {
    regexStr = regexStr.slice(0, -2) + "(/|$)";
  } else {
    regexStr += "($|/)";
  }

  return { regex: new RegExp(regexStr), negated: false };
}

// 检查文件是否应该被忽略
function shouldIgnoreFile(filePath, patterns) {
  let ignored = false;

  for (const pattern of patterns) {
    const { regex, negated } = patternToRegex(pattern);
    if (regex.test(filePath)) {
      ignored = !negated;
    }
  }

  return ignored;
}

// 过滤 diff，移除被忽略的文件
function filterDiff(diff, ignorePatterns) {
  if (ignorePatterns.length === 0) {
    return diff;
  }

  const lines = diff.split("\n");
  const filteredLines = [];
  let currentFile = null;
  let skipCurrentFile = false;
  let ignoredFiles = [];

  for (const line of lines) {
    // 检测 diff 文件头
    const diffMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (diffMatch) {
      currentFile = diffMatch[2];
      skipCurrentFile = shouldIgnoreFile(currentFile, ignorePatterns);
      if (skipCurrentFile) {
        ignoredFiles.push(currentFile);
      }
    }

    if (!skipCurrentFile) {
      filteredLines.push(line);
    }
  }

  if (ignoredFiles.length > 0) {
    logVerbose(`跳过的文件 (${ignoredFiles.length}): ${ignoredFiles.join(", ")}`);
  }

  return filteredLines.join("\n");
}

const commitMsgFile = process.argv[2];
const commitSource = process.argv[3]; // message, template, merge, squash, commit

// 检查是否应该跳过 AI Review
// commitSource 说明：
// - "message": 使用 -m 或 -F 提供了消息
// - "template": 使用了模板
// - "merge": merge 提交
// - "squash": squash 提交
// - "commit": 使用 -c/-C/--amend

// 如果使用了 -m 提供消息，或者是 merge/squash/amend，跳过 AI 生成
if (["message", "merge", "squash", "commit"].includes(commitSource)) {
  const reasons = {
    message: "使用了 -m 参数",
    merge: "merge 提交",
    squash: "squash 提交",
    commit: "amend 提交",
  };
  console.log(`ℹ️  跳过 AI Review（${reasons[commitSource] || commitSource}）`);
  process.exit(0);
}

if (!aiConfig.apiKey) {
  console.error(`❌ 未找到 API Key，请在项目根目录创建 .env 文件`);
  console.error(`   当前提供商: ${aiConfig.provider}`);
  console.error(
    `   需要设置: ${AI_PROVIDERS[aiConfig.provider]?.envKey || "OPENAI_API_KEY"}=sk-your-api-key-here`,
  );
  console.error(`   可选提供商: ${Object.keys(AI_PROVIDERS).join(", ")}`);
  console.log("⚠️  跳过 AI Review，允许提交");
  process.exit(0);
}

// 获取代理配置
function getProxyAgent() {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.http_proxy;

  if (proxyUrl) {
    logVerbose(`使用代理: ${proxyUrl}`);
    return new HttpsProxyAgent(proxyUrl);
  }

  return undefined;
}

// 创建 OpenAI 客户端（支持自定义配置和代理）
const httpAgent = getProxyAgent();
const openai = new OpenAI({
  apiKey: aiConfig.apiKey,
  baseURL: aiConfig.baseURL,
  timeout: CONFIG.timeout,
  maxRetries: 0, // 我们自己处理重试
  httpAgent: httpAgent,
});

logVerbose(`AI 提供商: ${aiConfig.provider}`);
logVerbose(`API Base URL: ${aiConfig.baseURL}`);
logVerbose(`模型: ${aiConfig.model}`);

const SYSTEM_PROMPT = `
你是一个拥有 20 年经验的资深代码架构师。请分析提供的 Git Diff，执行以下任务：

1. **代码审计 (Critique)**：
   - 检查是否存在逻辑错误、安全漏洞（如敏感信息泄露）、或会导致 Crash 的严重隐患。
   - 评估代码是否简洁，并提出改进建议（如变量命名、冗余代码）。
   - 决策标准：
     - 如果存在阻断性问题（Bug/安全），*is_passed* 返回 false。
     - 如果只是优化建议或代码完美，*is_passed* 返回 true。

2. **生成提交信息 (Commit Message)**：
   - 严格遵循 Conventional Commits 规范。
   - 格式：<type>(<scope>): <description>
   - 类型范围：feat, fix, docs, style, refactor, perf, test, chore, ci。
   - 描述：使用中文，精准概括实质性变动。

3. **输出要求**：
   - 必须严格返回 JSON 格式，不得包含任何 Markdown 格式说明或其他解释文字。
   - 语言：*reason* 部分使用中文。

`;

async function runAIReview() {
  const totalTimer = logTime("总耗时");

  logVerbose(`项目根目录: ${projectRoot}`);
  logVerbose(`模型: ${CONFIG.model}`);
  logVerbose(`最大 Diff 大小: ${CONFIG.maxDiffSize}`);
  logVerbose(`超时时间: ${CONFIG.timeout}ms`);
  logVerbose(`跳过构建: ${CONFIG.skipBuild}`);
  if (process.env.OPENAI_BASE_URL) {
    logVerbose(`API Base URL: ${process.env.OPENAI_BASE_URL}`);
  }

  try {
    // 0. 加载 .reviewignore 配置
    const ignorePatterns = loadReviewIgnore();
    if (ignorePatterns.length > 0) {
      logVerbose(`已加载 ${ignorePatterns.length} 个忽略规则`);
    }

    // 1. 获取暂存区 Diff
    logVerbose("正在获取暂存区 Diff...");
    const diffTimer = logTime("获取 Diff");
    let diff = execSync("git diff --cached", { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    logTimeEnd(diffTimer);

    if (!diff.trim()) {
      console.log("ℹ️  没有暂存的更改");
      process.exit(0);
    }

    logVerbose(`原始 Diff 大小: ${(diff.length / 1000).toFixed(2)}KB`);

    // 1.5 应用 .reviewignore 过滤
    diff = filterDiff(diff, ignorePatterns);

    if (!diff.trim()) {
      console.log("ℹ️  所有更改的文件都在 .reviewignore 中，跳过 AI Review");
      process.exit(0);
    }

    logVerbose(`过滤后 Diff 大小: ${(diff.length / 1000).toFixed(2)}KB`);

    // 2. 运行构建检查
    if (!CONFIG.skipBuild) {
      console.log(`🔨 正在运行构建检查: ${CONFIG.buildCommand}`);
      const buildTimer = logTime("构建检查");
      try {
        execSync(CONFIG.buildCommand, {
          cwd: projectRoot,
          stdio: "inherit",
          encoding: "utf-8",
        });
        console.log("✅ 构建通过");
        logTimeEnd(buildTimer);
      } catch (buildError) {
        console.error("❌ 构建失败，请修复后重新提交");
        console.error("\n使用 git commit --no-verify 可跳过检查");
        process.exit(1);
      }
    } else {
      logVerbose("跳过构建检查 (AI_REVIEW_SKIP_BUILD=true)");
    }

    // 3. 检查 Diff 大小
    if (diff.length > CONFIG.maxDiffSize) {
      console.warn(`⚠️  Diff 过大 (${(diff.length / 1000).toFixed(1)}KB)，建议分批提交`);
      console.warn(`   当前限制: ${CONFIG.maxDiffSize / 1000}KB，超出部分将被截断`);
    }
    const truncatedDiff = diff.slice(0, CONFIG.maxDiffSize);

    // 4. 调用 OpenAI
    console.log("🔍 正在进行 AI 代码审查...");
    logVerbose(`发送 Diff 大小: ${(truncatedDiff.length / 1000).toFixed(2)}KB`);
    logVerbose(`最大重试次数: ${CONFIG.maxRetries}`);
    const apiTimer = logTime("API 调用");

    const completion = await callWithRetry(() =>
      openai.chat.completions.create({
        model: CONFIG.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `
              任务：审计以下 Diff 并生成 commit message。

              Diff 内容：
              ${truncatedDiff}

              请按此 JSON 结构返回：
              {
                "is_passed": boolean,
                "reason": "此处填写改进建议或未通过的具体原因，如无建议可为空字符串",
                "message": "此处填写生成的 Conventional Commit 消息"
              }
            `,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    );

    logTimeEnd(apiTimer);

    const result = JSON.parse(completion.choices[0].message.content);

    // 输出 token 使用情况
    if (completion.usage) {
      logVerbose(
        `Token 使用: 总计 ${completion.usage.total_tokens} (prompt: ${completion.usage.prompt_tokens}, completion: ${completion.usage.completion_tokens})`,
      );
    }
    logVerbose(`使用模型: ${completion.model}`);

    // 5. 处理结果
    if (result.is_passed) {
      // 构建 commit message，将 reason 作为注释附加
      let commitMessage = result.message;
      if (result.reason && result.reason.trim()) {
        // 将 reason 转换为 Git 注释格式（每行以 # 开头）
        const reasonLines = result.reason
          .split("\n")
          .map((line) => `# ${line}`)
          .join("\n");
        commitMessage += `\n\n# --- AI Review 建议 ---\n${reasonLines}`;
      }
      fs.writeFileSync(commitMsgFile, commitMessage);
      console.log("✅ AI Review 通过");
      console.log(`📝 生成的提交信息: ${result.message}`);
      if (result.reason && result.reason.trim()) {
        console.log(`💡 建议: ${result.reason}`);
      }
      logTimeEnd(totalTimer);
      process.exit(0); // 确保成功时返回退出码 0
    } else {
      console.error("❌ AI Review 未通过");
      console.error(`📋 原因: ${result.reason}`);
      console.error("\n使用 git commit --no-verify 可跳过检查");
      logTimeEnd(totalTimer);
      process.exit(1);
    }
  } catch (error) {
    if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
      console.error("❌ 无法连接到 OpenAI API，请检查网络");
      logVerbose(`Base URL: ${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}`);
    } else if (error.status === 401) {
      console.error("❌ API Key 无效，请检查 .env 配置");
    } else if (error.status === 429) {
      console.error("❌ API 请求频率超限，请稍后重试");
    } else {
      console.error("❌ AI Review 出错:", error.message);
      logVerbose(`错误详情: ${JSON.stringify(error, null, 2)}`);
    }
    // 出错时允许提交，避免阻塞开发流程
    console.log("⚠️  跳过 AI Review，允许提交");
    logTimeEnd(totalTimer);
    process.exit(0);
  }
}

runAIReview();
