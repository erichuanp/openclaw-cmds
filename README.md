# openclaw-cmds

这是我自己先在用的一组 OpenClaw 斜杠命令，然后才顺手整理给其他龙虾复用。

**先说结论：你安装完以后，应该先删掉我的私人命令，再加你自己的。**  
因为像 `/atv`、`/swdns` 这种命令，里面调用的是我本机私有脚本/目录。你保留也没用，通常只会报错。

这个仓库真正适合复用的思路是：

1. 保留通用命令（比如 `/use`）
2. 删除作者私有命令（比如 `/atv`、`/swdns`）
3. 按你自己的机器环境，新增你自己的命令

---

## 当前命令

- `/cmd`：显示命令列表
- `/use`：显示当前会话模型使用量（不走 LLM）
- `/atv`：**作者私有命令**，执行 AddToView
- `/swdns`：**作者私有命令**，执行本地 DNS 切换脚本

如果你不是作者本人，默认建议删掉：

- `/atv`
- `/swdns`

---

## 安装

### 方式一：直接 clone 到 OpenClaw 扩展目录

```bash
git clone git@github.com:erichuanp/openclaw-cmds.git ~/.openclaw/extensions/cmds
```

然后确认 `~/.openclaw/openclaw.json` 里启用了它：

```json
{
  "plugins": {
    "allow": ["cmds"],
    "entries": {
      "cmds": {
        "enabled": true
      }
    }
  }
}
```

如果你的 OpenClaw 没有自动扫描 `~/.openclaw/extensions`，再补上：

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/Users/<your-user>/.openclaw/extensions"
      ]
    }
  }
}
```

最后重启 gateway：

```bash
openclaw gateway restart
```

如果你操作的是某个 profile，比如 jojo：

```bash
openclaw --profile jojo gateway restart
```

---

## 安装后第一件事：删掉作者私有命令

打开：

```bash
~/.openclaw/extensions/cmds/index.ts
```

找到并删除你不需要的 `commandDefs.push({...})` 块。

默认建议删除这两个：

- `name: "atv"`
- `name: "swdns"`

删完之后重启 gateway：

```bash
openclaw gateway restart
```

如果你是 profile：

```bash
openclaw --profile <profile-name> gateway restart
```

---

## 如何添加你自己的命令

这个插件的写法很直接：每个命令就是一个 `commandDefs.push({...})`。

最小结构是：

```ts
commandDefs.push({
  name: "hello",
  description: "返回一句固定文本",
  requireAuth: true,
  acceptsArgs: false,
  handler: async () => {
    return { text: "hello" };
  },
});
```

### 一个执行本地 shell 的例子

```ts
commandDefs.push({
  name: "upt",
  description: "查看机器 uptime",
  requireAuth: true,
  acceptsArgs: false,
  handler: async () => {
    const { code, stdout, stderr } = await runBash("uptime", 10000);
    const all = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
    return { text: code === 0 ? all : `执行失败\n${all}` };
  },
});
```

### 参数命令的例子

如果你要做 `/echo hello` 这种带参数命令，可以自己从 `ctx?.args`、`ctx?.rawArgs` 等字段里取。

这个仓库现在没有再保留 tmux 那套示例了，所以更适合作为一个简洁骨架：

- 需要固定回复 → 直接返回 `{ text }`
- 需要跑本地命令 → 复用 `runBash(...)`
- 需要复杂逻辑 → 在 `handler` 里自己写

---

## 验证是否生效

给机器人发：

```text
/cmd
```

如果列表里能看到你保留/新增的命令，就说明扩展已加载成功。

也可以直接测试：

```text
/use
```

期望得到类似：

```text
五时：剩余 60%；3时58分后（今日19时09分）恢复
一周：剩余 92%；6天22时后（4月28日13时）恢复
```

---

## 常见问题

### 1. 命令还是走了 LLM
通常是因为 `cmds` 没被真正加载。

检查三件事：

1. `plugins.allow` 里有 `cmds`
2. `plugins.entries.cmds.enabled = true`
3. OpenClaw 真能扫描到你的扩展目录
   - 默认一般会扫 `~/.openclaw/extensions`
   - 某些 profile 需要显式加 `plugins.load.paths`

改完后一定要重启 gateway。

### 2. 我用的是 profile，不是默认环境
统一这样操作：

```bash
openclaw --profile <profile-name> gateway restart
```

不要自己再拼 `OPENCLAW_HOME=... openclaw ...`。

### 3. 我不想保留作者的私人命令
对，正常就该删。

这个仓库不是“装完原样照用”的产品，更像：

- 一个作者自用命令集合
- 外加一个你可以快速改造成自己命令集的模板

---

## 仓库地址

- GitHub: `git@github.com:erichuanp/openclaw-cmds.git`
