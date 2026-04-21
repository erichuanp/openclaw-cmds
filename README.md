# openclaw-cmds

给 OpenClaw 加一组**不走 LLM 的确定性斜杠命令**。

当前内置：

- `/cmd`：显示命令列表
- `/atv`：执行 AddToView
- `/tm`：向 tmux 会话发送命令（只回“已执行”）
- `/tmfull`：在 tmux 会话中执行并回传输出
- `/tmk`：杀掉 tmux 会话
- `/tml`：列出 tmux 会话
- `/swdns`：执行本地 DNS 切换脚本
- `/use`：显示当前会话模型使用量（不走 LLM）

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

---

### 方式二：已有仓库，直接拉最新

```bash
cd ~/.openclaw/extensions/cmds
git pull
openclaw gateway restart
```

如果你操作的是某个 profile，比如 jojo：

```bash
openclaw --profile jojo gateway restart
```

---

## 验证是否生效

给机器人发：

```text
/cmd
```

如果命令列表里能看到 `/use`，说明扩展已加载成功。

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

### 1. `/use` 还是走了 LLM
通常是因为 `cmds` 没被真正加载。

检查两件事：

1. `openclaw.json` 里是否有：
   - `plugins.allow` 包含 `cmds`
   - `plugins.entries.cmds.enabled = true`
2. OpenClaw 是否真的会扫描到扩展目录：
   - 默认一般会扫 `~/.openclaw/extensions`
   - 某些 profile 需要显式加 `plugins.load.paths`

改完后一定要重启 gateway。

### 2. 我用的是 profile，不是默认环境
统一这样操作：

```bash
openclaw --profile <profile-name> gateway restart
```

不要再自己拼 `OPENCLAW_HOME=... openclaw ...`。

---

## 仓库地址

- GitHub: `git@github.com:erichuanp/openclaw-cmds.git`
