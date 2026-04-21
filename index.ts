import { spawn } from "node:child_process";
import { i as buildAgentPeerSessionKey } from "/opt/homebrew/lib/node_modules/openclaw/dist/session-key-51LnISpq.js";

type CmdResult = { code: number; stdout: string; stderr: string; timedOut: boolean };

function runBash(command: string, timeoutMs = 15 * 60 * 1000): Promise<CmdResult> {
  return new Promise((resolve) => {
    const p = spawn("bash", ["-lc", command], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      p.kill("SIGTERM");
    }, timeoutMs);

    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));

    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

function parseAtvResult(stdout: string, stderr: string, code: number, timedOut: boolean): string {
  const all = `${stdout}\n${stderr}`;
  const m = all.match(/在此期间，有(\d+)个视频未看。/);
  if (m) {
    return `已经移除已观看的视频，添加了${m[1]}个新视频。`;
  }

  if (all.includes("'code': 4100000") || all.includes("用户未登录")) {
    return "atv 执行失败：B站登录失效（用户未登录）。";
  }

  if (timedOut) {
    return "atv 执行失败：超时。";
  }

  const tail = all.trim().split("\n").slice(-6).join("\n");
  return code === 0
    ? "atv 已执行，但未解析到新增视频数。"
    : `atv 执行失败（exit=${code}）。\n${tail || "无额外错误信息"}`;
}

type CommandDef = {
  name: string;
  description: string;
  requireAuth?: boolean;
  acceptsArgs?: boolean;
  handler: (ctx?: any) => Promise<{ text: string }>;
};

function shSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'"'"'`)}'`;
}

function parseArgs(ctx?: any): string[] {
  const candidates = [
    ctx?.args,
    ctx?.argv,
    ctx?.commandArgs,
    ctx?.inputArgs,
    ctx?.parsedArgs,
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) {
      return value.map((v) => String(v)).filter((v) => v.length > 0);
    }
    if (typeof value === "string" && value.trim()) {
      return value.trim().split(/\s+/);
    }
  }

  const raw = [ctx?.rawArgs, ctx?.text, ctx?.input, ctx?.message]
    .find((v) => typeof v === "string" && v.trim());
  if (typeof raw === "string") {
    return raw.trim().match(/(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\S+)/g)?.map((part) => {
      if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
        return part.slice(1, -1);
      }
      return part;
    }) ?? [];
  }

  return [];
}

function getRawArgs(ctx?: any): string {
  const raw = [ctx?.rawArgs, ctx?.text, ctx?.input, ctx?.message]
    .find((v) => typeof v === "string" && v.trim());
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeCommandForShell(command: string): string {
  return command.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$2");
}

function inferCurrentSessionKey(ctx?: any): string | null {
  const channel = typeof ctx?.channel === "string" ? ctx.channel.trim() : "";
  const senderId = typeof ctx?.senderId === "string" ? ctx.senderId.trim() : "";
  const config = ctx?.config ?? {};
  if (!channel || !senderId) {
    return null;
  }

  const mainAgentId = typeof config?.agents?.defaultId === "string" && config.agents.defaultId.trim()
    ? config.agents.defaultId.trim()
    : "main";
  const dmScope = typeof config?.session?.dmScope === "string" && config.session.dmScope.trim()
    ? config.session.dmScope.trim()
    : "main";

  return buildAgentPeerSessionKey({
    agentId: mainAgentId,
    channel,
    peerKind: "direct",
    peerId: senderId,
    dmScope,
  });
}

function extractUsageBlock(statusText: string): string[] {
  const lines = statusText.split(/\r?\n/);
  const out: string[] = [];
  let inUsage = false;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    if (!inUsage) {
      if (line.trim() === "Usage") {
        inUsage = true;
      }
      continue;
    }
    if (!line.trim()) {
      if (out.length > 0) break;
      continue;
    }
    if (/^[A-Z][A-Za-z ]+$/.test(line.trim()) && line.trim() !== "Usage") {
      break;
    }
    out.push(line);
  }
  return out;
}

function parseDurationMs(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  let totalMs = 0;
  const re = /(\d+)\s*([dhm])/g;
  let matched = false;
  while (true) {
    const m = re.exec(trimmed);
    if (!m) break;
    matched = true;
    const value = Number(m[1]);
    const unit = m[2];
    if (!Number.isFinite(value)) continue;
    if (unit === "d") totalMs += value * 24 * 60 * 60 * 1000;
    if (unit === "h") totalMs += value * 60 * 60 * 1000;
    if (unit === "m") totalMs += value * 60 * 1000;
  }
  return matched ? totalMs : null;
}

function formatChineseDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}时`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}分`);
  if (parts.length === 0) return "0分";
  return parts.join("");
}

function getShanghaiDateParts(targetMs: number): { year: number; month: number; day: number; hour: number; minute: number } {
  const date = new Date(targetMs);
  const dtf = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function formatShanghaiResetAt(targetMs: number, isFiveHour: boolean): string {
  const target = getShanghaiDateParts(targetMs);
  if (!isFiveHour) {
    if (target.minute === 0) {
      return `${target.month}月${target.day}日${target.hour}点`;
    }
    return `${target.month}月${target.day}日${target.hour}点${target.minute}分`;
  }

  const now = getShanghaiDateParts(Date.now());
  const targetStamp = `${target.year}-${target.month}-${target.day}`;
  const nowStamp = `${now.year}-${now.month}-${now.day}`;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const tomorrowParts = getShanghaiDateParts(tomorrow.getTime());
  const tomorrowStamp = `${tomorrowParts.year}-${tomorrowParts.month}-${tomorrowParts.day}`;

  const prefix = targetStamp === nowStamp ? "今日" : targetStamp === tomorrowStamp ? "明日" : `${target.month}月${target.day}日`;
  return `${prefix}${target.hour}点${String(target.minute).padStart(2, "0")}分`;
}

function formatUsageReply(statusText: string, _sessionKey: string | null): string {
  const usageBlock = extractUsageBlock(statusText)
    .map((line) => line.trim())
    .filter(Boolean);

  const now = Date.now();
  const lines = usageBlock.flatMap((line) => {
    const m = line.match(/^(5h|Week):\s*(\d+)% left · resets\s+(.+)$/i);
    if (!m) return [];
    const rawLabel = m[1].toLowerCase();
    const percent = m[2];
    const durationText = m[3].trim();
    const durationMs = parseDurationMs(durationText);
    if (durationMs == null) return [];
    const targetMs = now + durationMs;
    const isFiveHour = rawLabel === "5h";
    const label = isFiveHour ? "五时" : "一周";
    const resetAt = formatShanghaiResetAt(targetMs, isFiveHour);
    return [`${label}：剩余 ${percent}%；${formatChineseDuration(durationMs)}后（${resetAt}）恢复`];
  });

  return lines.join("\n") || "未读取到 usage 信息。";
}

function parseTmArgs(ctx?: any): { sessionName: string; commands: string[]; error?: string } {
  const arrayCandidates = [
    ctx?.args,
    ctx?.argv,
    ctx?.commandArgs,
    ctx?.inputArgs,
    ctx?.parsedArgs,
  ];

  for (const value of arrayCandidates) {
    if (Array.isArray(value)) {
      const parts = value.map((v) => String(v)).filter((v) => v.length > 0);
      const [sessionName, ...commands] = parts;
      if (sessionName && commands.length > 0) {
        return { sessionName, commands: commands.map(normalizeCommandForShell) };
      }
    }
    if (typeof value === "string" && value.trim()) {
      const parts = value.trim().match(/(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\S+)/g)?.map((part) => {
        if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
          return part.slice(1, -1);
        }
        return part;
      }) ?? [];
      const [sessionName, ...commands] = parts;
      if (sessionName && commands.length > 0) {
        return { sessionName, commands: commands.map(normalizeCommandForShell) };
      }
    }
  }

  let raw = getRawArgs(ctx);
  if (!raw) {
    return { sessionName: "", commands: [], error: '用法：/tm <session> "<cmd1>" "<cmd2>" ...' };
  }

  raw = raw.replace(/^\/tm\b\s*/i, "").trim();

  const sessionMatch = raw.match(/^(\S+)(?:\s+|$)/);
  const sessionName = sessionMatch?.[1] ?? "";
  const rest = raw.slice(sessionName.length).trim();

  if (!sessionName || !rest) {
    return { sessionName, commands: [], error: '用法：/tm <session> "<cmd1>" "<cmd2>" ...' };
  }

  const commands: string[] = [];
  const quoted = /\s*(["'])([\s\S]*?)\1/g;
  let consumed = "";
  let matchedAny = false;

  while (true) {
    const m = quoted.exec(rest);
    if (!m) break;
    matchedAny = true;
    commands.push(normalizeCommandForShell(m[2]));
    consumed += m[0];
  }

  if (!matchedAny || consumed.trim() !== rest.trim()) {
    return {
      sessionName,
      commands: [],
      error: 'tm 参数格式错误。请使用：/tm <session> "<cmd1>" "<cmd2>" ...',
    };
  }

  return { sessionName, commands };
}

async function tmuxExec(sessionName: string, commands: string[], timeoutMs = 30_000): Promise<{ text: string }> {
  if (!sessionName) {
    return { text: '用法：/tm <session> "<cmd1>" "<cmd2>" ...' };
  }
  if (commands.length === 0) {
    return { text: '用法：/tm <session> "<cmd1>" "<cmd2>" ...' };
  }

  const runId = `openclaw_tm_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const outFile = `/tmp/${runId}.out`;
  const statusFile = `/tmp/${runId}.status`;
  const joined = commands.join("; ");
  const payload = `({ ${joined}; }) >${shSingleQuote(outFile)} 2>&1; printf '%s' $? >${shSingleQuote(statusFile)}`;

  const script = [
    `set -euo pipefail`,
    `rm -f ${shSingleQuote(outFile)} ${shSingleQuote(statusFile)}`,
    `tmux has-session -t ${shSingleQuote(sessionName)} 2>/dev/null || tmux new-session -d -s ${shSingleQuote(sessionName)}`,
    `tmux send-keys -t ${shSingleQuote(sessionName)} -l ${shSingleQuote(payload)}`,
    `tmux send-keys -t ${shSingleQuote(sessionName)} Enter`,
    `deadline=$(( $(date +%s) + ${Math.ceil(timeoutMs / 1000)} ))`,
    `while [ ! -f ${shSingleQuote(statusFile)} ]; do`,
    `  if [ $(date +%s) -ge "$deadline" ]; then`,
    `    echo '__OPENCLAW_TIMEOUT__'`,
    `    exit 124`,
    `  fi`,
    `  sleep 0.2`,
    `done`,
    `status=$(cat ${shSingleQuote(statusFile)} 2>/dev/null || echo 1)`,
    `out=$(cat ${shSingleQuote(outFile)} 2>/dev/null || true)`,
    `rm -f ${shSingleQuote(outFile)} ${shSingleQuote(statusFile)}`,
    `printf '__OPENCLAW_EXIT__%s\n' "$status"`,
    `printf '%s' "$out"`,
  ].join("\n");

  const { code, stdout, stderr, timedOut } = await runBash(script, timeoutMs + 5_000);
  const all = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();

  if (timedOut || code === 124 || all.includes("__OPENCLAW_TIMEOUT__")) {
    return { text: `tm 会话 ${sessionName} 执行超时。` };
  }

  const m = all.match(/^__OPENCLAW_EXIT__(\d+)\n?/);
  if (!m) {
    return { text: all || `tm 执行失败（exit=${code}）。` };
  }

  const exitCode = Number(m[1]);
  const body = all.slice(m[0].length).trim();
  const suffix = exitCode === 0 ? "" : `\n[exit ${exitCode}]`;
  return { text: `${body}${suffix}`.trim() || suffix.trim() || "" };
}

export default function register(api: any) {
  const commandDefs: CommandDef[] = [];

  commandDefs.push({
    name: "cmd",
    description: "显示自定义命令列表",
    requireAuth: true,
    acceptsArgs: false,
    handler: async () => {
      const lines = [
        "我的命令：",
        ...commandDefs.map((c) => `/${c.name} - ${c.description}`),
      ];
      return { text: lines.join("\n") };
    },
  });

  commandDefs.push({
    name: "atv",
    description: "执行 AddToView，同步未看视频",
    requireAuth: false,
    acceptsArgs: true,
    handler: async () => {
      const cmd = [
        'source "$HOME/miniconda3/etc/profile.d/conda.sh" 2>/dev/null || source "$HOME/anaconda3/etc/profile.d/conda.sh" 2>/dev/null',
        "conda activate base",
        "cd ~/Projects/AddToView",
        "python AddToView.py",
      ].join(" && ");

      const { code, stdout, stderr, timedOut } = await runBash(cmd);
      const text = parseAtvResult(stdout, stderr, code, timedOut);
      return { text };
    },
  });

  commandDefs.push({
    name: "tm",
    description: "向宿主机 tmux 会话投递命令：/tm <session> \"<cmd1>\" \"<cmd2>\" ...（仅回已执行）",
    requireAuth: true,
    acceptsArgs: true,
    handler: async (ctx) => {
      const { sessionName, commands, error } = parseTmArgs(ctx);
      if (error) {
        return { text: error };
      }
      const joined = commands.join("; ");
      const script = [
        `set -euo pipefail`,
        `tmux has-session -t ${shSingleQuote(sessionName)} 2>/dev/null || tmux new-session -d -s ${shSingleQuote(sessionName)}`,
        `tmux send-keys -t ${shSingleQuote(sessionName)} -l ${shSingleQuote(joined)}`,
        `tmux send-keys -t ${shSingleQuote(sessionName)} Enter`,
      ].join("\n");
      const { code, stdout, stderr } = await runBash(script, 10_000);
      if (code !== 0) {
        const all = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
        return { text: all || `tm 执行失败（exit=${code}）。` };
      }
      return { text: "已执行" };
    },
  });

  commandDefs.push({
    name: "tmfull",
    description: "在宿主机 tmux 会话里执行命令并回传输出：/tmfull <session> \"<cmd1>\" \"<cmd2>\" ...",
    requireAuth: true,
    acceptsArgs: true,
    handler: async (ctx) => {
      const { sessionName, commands, error } = parseTmArgs(ctx);
      if (error) {
        return { text: error.replace(/^用法：\/tm /, '用法：/tmfull ').replace(/^tm 参数格式错误。请使用：\/tm /, 'tm 参数格式错误。请使用：/tmfull ') };
      }
      return tmuxExec(sessionName, commands);
    },
  });

  commandDefs.push({
    name: "tmk",
    description: "杀掉指定 tmux 会话：/tmk <session>",
    requireAuth: true,
    acceptsArgs: true,
    handler: async (ctx) => {
      const [sessionName] = parseArgs(ctx);
      if (!sessionName) {
        return { text: "用法：/tmk <session>" };
      }
      const { code, stdout, stderr } = await runBash(
        `tmux kill-session -t ${shSingleQuote(sessionName)}`,
        10_000,
      );
      if (code === 0) {
        return { text: `已杀掉 tmux 会话：${sessionName}` };
      }
      const all = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
      return { text: all || `tmk 执行失败（exit=${code}）。` };
    },
  });

  commandDefs.push({
    name: "tml",
    description: "列出所有 tmux 会话",
    requireAuth: true,
    acceptsArgs: false,
    handler: async () => {
      const { code, stdout, stderr } = await runBash(
        "tmux list-sessions -F '#{session_name}'",
        10_000,
      );
      const all = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
      if (code !== 0) {
        if (
          all.includes("no server running") ||
          all.includes("failed to connect to server") ||
          all.includes("error connecting to /private/tmp/tmux-")
        ) {
          return { text: "当前没有 tmux 会话。" };
        }
        return { text: all || `tml 执行失败（exit=${code}）。` };
      }
      return { text: all || "当前没有 tmux 会话。" };
    },
  });

  commandDefs.push({
    name: "use",
    description: "显示当前会话模型使用量（不走 LLM）",
    requireAuth: true,
    acceptsArgs: false,
    handler: async (ctx) => {
      const sessionKey = inferCurrentSessionKey(ctx);
      const { code, stdout, stderr, timedOut } = await runBash("openclaw status --usage", 20_000);
      if (timedOut) {
        return { text: "usage 读取超时。" };
      }
      const all = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
      if (code !== 0) {
        return { text: all || `usage 读取失败（exit=${code}）。` };
      }
      const text = formatUsageReply(stdout, sessionKey);
      return { text };
    },
  });

  const swdnsHandler = async () => {
    const cmd = [
      "set -euo pipefail",
      "cd ~/Scripts",
      "nohup conda run -n router-switch python switch_router_dns_gateway.py >/dev/null 2>&1 < /dev/null &",
    ].join("\n");

    const launch = await runBash(cmd, 15_000);
    if (launch.code !== 0 || launch.timedOut) {
      const tail = `${launch.stdout}${launch.stderr}`.trim();
      return { text: `启动失败。${tail ? `\n${tail}` : ""}` };
    }

    return { text: "尝试切换DNS与网关中..." };
  };

  commandDefs.push({
    name: "swdns",
    description: "执行本地 DNS 切换脚本（静默执行）",
    requireAuth: true,
    acceptsArgs: false,
    handler: swdnsHandler,
  });


  for (const c of commandDefs) {
    api.registerCommand({
      name: c.name,
      description: c.description,
      requireAuth: c.requireAuth ?? true,
      acceptsArgs: c.acceptsArgs ?? false,
      handler: c.handler,
    });
  }
}
