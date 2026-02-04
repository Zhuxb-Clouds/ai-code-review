#!/usr/bin/env node

/**
 * 本地测试脚本
 * 用于测试 AI Code Review 的各项功能
 */

import fs from "fs";
import path from "path";
import { execSync, spawn } from "child_process";
import { fileURLToPath } from "url";
import { HttpsProxyAgent } from "https-proxy-agent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// 颜色输出
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(msg, color = "reset") {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logSection(title) {
  console.log("\n" + "=".repeat(50));
  log(`📋 ${title}`, "cyan");
  console.log("=".repeat(50));
}

function logVerbose(msg) {
  // 在测试中始终启用 verbose 日志
  console.log(`[DEBUG] ${msg}`);
}

// 从 OpenAI 错误提取诊断信息
function analyzeOpenAIError(error) {
  const errorInfo = {
    code: error.code,
    status: error.status,
    message: error.message,
    type: error.type || error.constructor?.name,
  };

  // 尝试获取原始错误信息
  if (error.response?.data?.error) {
    const apiError = error.response.data.error;
    errorInfo.apiError = {
      type: apiError.type,
      message: apiError.message,
      param: apiError.param,
      code: apiError.code,
    };
  }

  // 检查底层错误
  if (error.cause) {
    errorInfo.cause = {
      code: error.cause.code,
      errno: error.cause.errno,
      syscall: error.cause.syscall,
      hostname: error.cause.hostname,
      port: error.cause.port,
    };
  }

  return errorInfo;
}

// 测试用例
const tests = {
  // 测试环境变量加载
  async testEnvLoading() {
    logSection("测试环境变量加载");

    const envPath = path.join(projectRoot, ".env");
    if (fs.existsSync(envPath)) {
      log("✅ .env 文件存在", "green");

      const content = fs.readFileSync(envPath, "utf-8");
      const hasApiKey = content.includes("OPENAI_API_KEY");

      if (hasApiKey) {
        log("✅ OPENAI_API_KEY 已配置", "green");
      } else {
        log("⚠️  OPENAI_API_KEY 未配置", "yellow");
      }
    } else {
      log("⚠️  .env 文件不存在，请从 .env.example 复制", "yellow");
    }
  },

  // 测试 CLI 命令
  async testCLI() {
    logSection("测试 CLI 命令");

    try {
      const helpOutput = execSync("node bin/cli.mjs help", {
        cwd: projectRoot,
        encoding: "utf-8",
      });
      log("✅ ai-review help 命令正常", "green");
      console.log(helpOutput);
    } catch (error) {
      log("❌ CLI 命令失败: " + error.message, "red");
    }
  },

  // 测试 Git Diff 获取
  async testGitDiff() {
    logSection("测试 Git Diff 获取");

    try {
      const diff = execSync("git diff --cached", {
        cwd: projectRoot,
        encoding: "utf-8",
      });

      if (diff.trim()) {
        log(`✅ 检测到暂存区变更 (${(diff.length / 1000).toFixed(1)}KB)`, "green");
        console.log("前 500 字符预览:");
        console.log(diff.slice(0, 500) + (diff.length > 500 ? "\n..." : ""));
      } else {
        log("ℹ️  暂存区没有变更", "blue");
        log("   提示: 使用 git add <file> 添加文件后再测试", "yellow");
      }
    } catch (error) {
      log("❌ Git Diff 获取失败: " + error.message, "red");
    }
  },

  // 测试构建命令
  async testBuild() {
    logSection("测试构建命令");

    const packageJsonPath = path.join(projectRoot, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    if (packageJson.scripts?.build) {
      log("ℹ️  发现 build 脚本，尝试运行...", "blue");
      try {
        execSync("npm run build", { cwd: projectRoot, stdio: "inherit" });
        log("✅ 构建成功", "green");
      } catch (error) {
        log("❌ 构建失败", "red");
      }
    } else {
      log("ℹ️  没有 build 脚本（这是正常的，此项目不需要构建）", "blue");
    }
  },

  // 模拟 Hook 调用（不实际调用 AI）
  async testHookDryRun() {
    logSection("测试 Hook 逻辑（模拟运行）");

    // 检查必要文件
    const hookPath = path.join(projectRoot, "bin/hook.mjs");
    if (fs.existsSync(hookPath)) {
      log("✅ hook.mjs 文件存在", "green");
    } else {
      log("❌ hook.mjs 文件不存在", "red");
      return;
    }

    // 检查依赖
    try {
      await import("openai");
      log("✅ openai 依赖已安装", "green");
    } catch {
      log("❌ openai 依赖未安装，请运行 npm install", "red");
    }
  },

  // AI 提供商预设配置
  AI_PROVIDERS: {
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
  },

  // 获取当前 AI 配置
  getAIConfig() {
    const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
    const preset = this.AI_PROVIDERS[provider] || this.AI_PROVIDERS.openai;
    const apiKey = process.env[preset.envKey] || process.env.OPENAI_API_KEY;
    const baseURL = process.env.OPENAI_BASE_URL || preset.baseURL;
    const model = process.env.OPENAI_MODEL || preset.defaultModel;
    return { provider, apiKey, baseURL, model };
  },

  // 测试 API 连接
  async testAPI() {
    logSection("测试 AI API 连接");

    // 加载环境变量
    const envPath = path.join(projectRoot, ".env");
    if (!fs.existsSync(envPath)) {
      log("⏭️  跳过：未找到 .env 文件", "yellow");
      return;
    }

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

    const aiConfig = this.getAIConfig();

    if (!aiConfig.apiKey) {
      log(`⏭️  跳过：未配置 API Key`, "yellow");
      log(`   当前提供商: ${aiConfig.provider}`, "yellow");
      log(
        `   需要设置: ${this.AI_PROVIDERS[aiConfig.provider]?.envKey || "OPENAI_API_KEY"}`,
        "yellow",
      );
      return;
    }

    log(`🔗 正在测试 ${aiConfig.provider.toUpperCase()} API 连接...`, "blue");
    const timeout = parseInt(process.env.AI_REVIEW_TIMEOUT) || 30000;
    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      process.env.https_proxy ||
      process.env.http_proxy;

    log(`   提供商: ${aiConfig.provider}`, "blue");
    log(`   Base URL: ${aiConfig.baseURL}`, "blue");
    log(`   模型: ${aiConfig.model}`, "blue");
    log(`   超时: ${timeout}ms`, "blue");
    if (proxyUrl) {
      log(`   代理: ${proxyUrl}`, "blue");
    } else {
      log(`   代理: 未配置 (设置 HTTPS_PROXY 环境变量启用)`, "yellow");
    }

    try {
      const OpenAI = (await import("openai")).default;

      // 创建代理 agent
      let httpAgent = undefined;
      if (proxyUrl) {
        httpAgent = new HttpsProxyAgent(proxyUrl);
        logVerbose(`   已创建代理 agent`);
      }

      // 创建 OpenAI 客户端实例
      log("\n   1️⃣  初始化 AI 客户端...", "blue");
      const openai = new OpenAI({
        apiKey: aiConfig.apiKey,
        baseURL: aiConfig.baseURL,
        timeout: timeout,
        maxRetries: 0, // 禁用自动重试，由我们控制
        httpAgent: httpAgent,
      });

      logVerbose(`   客户端初始化成功`);

      // 测试 API 连接 - 发送轻量级请求
      log("   2️⃣  测试 API 连接...", "blue");
      const startTime = Date.now();

      try {
        const completion = await openai.chat.completions.create({
          model: aiConfig.model,
          messages: [
            {
              role: "user",
              content: "Say 'OK' only.",
            },
          ],
          max_tokens: 10,
          temperature: 0,
        });

        const elapsed = Date.now() - startTime;

        log("   3️⃣  解析响应...", "blue");
        const response = completion.choices[0]?.message?.content || "";

        log("\n✅ OpenAI API 连接成功！", "green");
        log(`   实际模型: ${completion.model}`, "blue");
        log(`   响应内容: ${response}`, "blue");
        log(`   响应时间: ${elapsed}ms`, "blue");

        if (completion.usage) {
          log(`   📊 Token 使用:`, "blue");
          log(`      • Prompt tokens: ${completion.usage.prompt_tokens}`, "blue");
          log(`      • Completion tokens: ${completion.usage.completion_tokens}`, "blue");
          log(`      • Total tokens: ${completion.usage.total_tokens}`, "blue");
        }

        log(`\n✨ 所有检查通过，API 连接正常！`, "green");
      } catch (apiError) {
        // API 调用失败，但客户端创建成功说明基本连接没问题
        throw apiError;
      }
    } catch (error) {
      log("❌ API 测试失败", "red");

      // 获取错误详情
      const errorInfo = analyzeOpenAIError(error);

      logVerbose(`\n错误对象分析:`);
      logVerbose(`  Code: ${errorInfo.code}`);
      logVerbose(`  Status: ${errorInfo.status}`);
      logVerbose(`  Type: ${errorInfo.type}`);
      logVerbose(`  Message: ${errorInfo.message}`);
      if (errorInfo.apiError) {
        logVerbose(`  API Error: ${JSON.stringify(errorInfo.apiError)}`);
      }
      if (errorInfo.cause) {
        logVerbose(`  Cause: ${JSON.stringify(errorInfo.cause)}`);
      }

      log("\n🔍 诊断和修复建议：", "yellow");

      // 详细的错误诊断
      if (error.code === "ECONNREFUSED" || errorInfo.cause?.code === "ECONNREFUSED") {
        log("\n  错误：无法连接到服务器", "red");
        log("  可能原因：", "blue");
        log("    • Base URL 错误或服务器无法访问", "blue");
        log("    • 网络连接问题", "blue");
        log("    • 防火墙或代理阻止了请求", "blue");
        log(
          `\n  当前 Base URL: ${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}`,
          "yellow",
        );
        log("  修复步骤：", "blue");
        log("    1. 测试网络: ping api.openai.com", "blue");
        log("    2. 检查代理: 如需代理，设置 HTTP_PROXY 或 HTTPS_PROXY", "blue");
        log("    3. 检查防火墙设置", "blue");
      } else if (error.code === "ETIMEDOUT" || errorInfo.cause?.code === "ETIMEDOUT") {
        log("\n  错误：请求超时", "red");
        log("  可能原因：", "blue");
        log("    • 网络延迟过高", "blue");
        log("    • API 响应缓慢", "blue");
        log("    • 超时时间设置过短", "blue");
        log(`\n  当前超时: ${process.env.AI_REVIEW_TIMEOUT || 30000}ms`, "yellow");
        log("  修复步骤：", "blue");
        log("    1. 增加超时: 设置 AI_REVIEW_TIMEOUT=60000", "blue");
        log("    2. 检查网络延迟: ping api.openai.com", "blue");
        log("    3. 稍后重试", "blue");
      } else if (error.code === "ENOTFOUND" || errorInfo.cause?.code === "ENOTFOUND") {
        log("\n  错误：DNS 解析失败", "red");
        log("  可能原因：", "blue");
        log("    • DNS 配置错误", "blue");
        log("    • 域名拼写错误", "blue");
        log("    • 网络无法访问 DNS 服务", "blue");
        log(
          `\n  当前 Base URL: ${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}`,
          "yellow",
        );
        log("  修复步骤：", "blue");
        log("    1. 检查 DNS 设置", "blue");
        log("    2. 尝试使用公共 DNS 8.8.8.8", "blue");
        log("    3. 检查 Base URL 拼写", "blue");
      } else if (error.status === 401 || errorInfo.apiError?.code === "invalid_api_key") {
        log("\n  错误：API Key 无效或已过期", "red");
        log("  可能原因：", "blue");
        log("    • API Key 不正确或已删除", "blue");
        log("    • API Key 已过期", "blue");
        log("    • API Key 权限不足", "blue");
        log("\n  修复步骤：", "blue");
        log("    1. 检查 .env 中的 OPENAI_API_KEY 是否正确", "blue");
        log("    2. 访问 https://platform.openai.com/api-keys 重新生成 Key", "blue");
        log("    3. 等待 60 秒后重试", "blue");
      } else if (error.status === 429 || errorInfo.apiError?.code === "rate_limit_exceeded") {
        log("\n  错误：请求频率超限或配额不足", "red");
        log("  可能原因：", "blue");
        log("    • 请求过于频繁", "blue");
        log("    • API 配额已用尽", "blue");
        log("    • 账户余额不足", "blue");
        log("\n  修复步骤：", "blue");
        log("    1. 等待几分钟后重试", "blue");
        log("    2. 检查账户余额: https://platform.openai.com/account/billing/overview", "blue");
        log("    3. 检查使用配额: https://platform.openai.com/account/rate-limits", "blue");
      } else if (error.status === 404 || errorInfo.apiError?.code === "model_not_found") {
        log("\n  错误：模型不存在或无权访问", "red");
        log("  可能原因：", "blue");
        log("    • 模型名称错误或不存在", "blue");
        log("    • 模型已下线", "blue");
        log("    • 账户无权使用该模型", "blue");
        log(`\n  当前模型: ${process.env.OPENAI_MODEL || "gpt-4o-mini"}`, "yellow");
        log("  修复步骤：", "blue");
        log("    1. 检查模型名称: https://platform.openai.com/docs/models", "blue");
        log("    2. 修改 OPENAI_MODEL 为有效的模型名", "blue");
        log("    3. 检查账户权限", "blue");
      } else if (error.status === 500 || error.status === 502 || error.status === 503) {
        log(`\n  错误：OpenAI 服务器错误 (${error.status})`, "red");
        log("  可能原因：", "blue");
        log("    • OpenAI 服务暂时不可用", "blue");
        log("    • 服务器故障", "blue");
        log("    • 服务器维护中", "blue");
        log("\n  修复步骤：", "blue");
        log("    1. 稍后重试", "blue");
        log("    2. 检查 OpenAI 状态: https://status.openai.com", "blue");
        log("    3. 查看官方通告", "blue");
      } else {
        log(`\n  错误: ${error.message}`, "yellow");
        log(`  错误类型: ${errorInfo.type}`, "yellow");
        log(`  错误代码: ${errorInfo.code || "未知"}`, "yellow");
        if (error.status) {
          log(`  HTTP 状态: ${error.status}`, "yellow");
        }
        log("\n  通用排查步骤：", "blue");
        log("    1. 启用详细日志: AI_REVIEW_VERBOSE=true", "blue");
        log("    2. 检查 .env 配置文件中的所有参数", "blue");
        log("    3. 验证 API Key 和 Base URL", "blue");
        log("    4. 测试网络连接: curl https://api.openai.com/v1/models", "blue");
        log("    5. 查看完整错误信息（使用 AI_REVIEW_VERBOSE=true）", "blue");
      }
    }
  },

  // 测试完整流程（需要 API Key）
  async testFullFlow() {
    logSection("测试完整流程（需要暂存的更改和 API Key）");

    const envPath = path.join(projectRoot, ".env");
    if (!fs.existsSync(envPath)) {
      log("⏭️  跳过：未配置 .env", "yellow");
      return;
    }

    try {
      const diff = execSync("git diff --cached", {
        cwd: projectRoot,
        encoding: "utf-8",
      });

      if (!diff.trim()) {
        log("⏭️  跳过：暂存区没有变更", "yellow");
        log("   要测试完整流程，请先 git add 一些文件", "blue");
        return;
      }

      log("🚀 运行完整 Hook 测试...", "blue");
      log("   这将调用 OpenAI API（会产生费用）", "yellow");
      log("   按 Ctrl+C 可取消\n", "yellow");

      // 创建临时 commit msg 文件
      const tmpMsgFile = path.join(projectRoot, ".git/COMMIT_EDITMSG_TEST");
      fs.writeFileSync(tmpMsgFile, "");

      try {
        execSync(`node bin/hook.mjs "${tmpMsgFile}" message`, {
          cwd: projectRoot,
          stdio: "inherit",
          env: { ...process.env },
        });

        const generatedMsg = fs.readFileSync(tmpMsgFile, "utf-8");
        if (generatedMsg) {
          log("\n✅ 完整流程测试成功！", "green");
          log(`📝 生成的提交信息: ${generatedMsg}`, "cyan");
        }
      } finally {
        // 清理临时文件
        if (fs.existsSync(tmpMsgFile)) {
          fs.unlinkSync(tmpMsgFile);
        }
      }
    } catch (error) {
      log("❌ 完整流程测试失败: " + error.message, "red");
    }
  },
};

// 运行所有测试
async function runTests() {
  console.log("\n🧪 AI Code Review 本地测试\n");

  const testName = process.argv[2];

  if (testName && tests[testName]) {
    // 运行指定测试
    await tests[testName]();
  } else if (testName === "full") {
    // 运行完整流程测试
    await tests.testFullFlow();
  } else {
    // 运行所有基础测试
    await tests.testEnvLoading();
    await tests.testCLI();
    await tests.testGitDiff();
    await tests.testBuild();
    await tests.testHookDryRun();

    console.log("\n" + "=".repeat(50));
    log("💡 提示", "cyan");
    console.log("=".repeat(50));
    console.log(`
测试 API 连接（会调用 API，消耗少量 token）：
  npm test testAPI

运行完整流程测试（会调用 API）：
  npm test full

单独运行某个测试：
  npm test testEnvLoading
  npm test testCLI
  npm test testGitDiff
  npm test testAPI
  npm test testFullFlow

本地链接测试（在其他项目中使用）：
  npm run test:link
  cd ../other-project
  npx ai-review init
`);
  }
}

runTests().catch(console.error);
