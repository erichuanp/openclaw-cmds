# openclaw-cmds

这是一个给 **OpenClaw** 看的安装与改造说明。

目标不是“原样照搬作者的全部命令”，而是：

1. 拉取这个仓库到本机扩展目录
2. 启用 `cmds` 插件
3. 删除 **Chuan 的个人命令**（如 `/atv`）
4. 按用户自己的环境保留/新增命令
5. 应用插件并重启 gateway

## 重要原则

这个仓库里有两类命令：

- **可复用命令**：例如 `/use`
- **Chuan 的个人命令**：例如 `/atv`

其中 `/atv` 依赖作者自己机器上的私有脚本、目录和环境。  
**安装后应优先删除这些个人命令。保留它们通常没有意义，只会报错。**

另外：

- 在执行 `openclaw gateway restart` 之前，**先向用户说明你刚做了什么，以及接下来要重启 gateway 让插件生效**。
- 不要静默改完直接重启。

---

## 当前仓库中的命令

- `/cmd`：显示命令列表
- `/use`：显示当前会话模型使用量（不走 LLM）
- `/atv`：**Chuan 的个人命令**，执行 AddToView
- `/m2d <Markdown文件路径>`：把 markdown 文件转成 docx
- `/d2m <DOCX文件路径>`：把 docx 文件转成 markdown

默认建议删除：

- `/atv`

---

## 关于 `/use`

`/use` **不是通用的“所有模型 usage 查询器”**。

它当前的实现方式是：

- 运行 `openclaw status --usage`
- 解析其中的 usage 输出
- 再格式化成中文时间文案

按当前 OpenClaw 的行为，`status --usage` 这里拿到的是 **OpenAI Codex 的 usage / quota 信息**。  
所以 **`/use` 应按“只对 OpenAI Codex 有意义”来理解和使用**。

如果当前会话不是跑在 OpenAI Codex 体系下，或者当前 OpenClaw 环境拿不到 Codex usage，`/use` 就可能没有可用结果，或者结果不符合预期。

所以给 OpenClaw 的指令应是：

- 不要把 `/use` 介绍成“通用模型 usage 命令”
- 应明确说明：**它当前面向 OpenAI Codex usage**

---

## 安装步骤

### 第一步：拉取仓库

把仓库放到 OpenClaw 扩展目录：

```bash
git clone git@github.com:erichuanp/openclaw-cmds.git ~/.openclaw/extensions/cmds
```

如果目录已存在，就更新：

```bash
cd ~/.openclaw/extensions/cmds
git pull
```

---

### 第二步：启用插件

确认 `~/.openclaw/openclaw.json` 中启用了 `cmds`：

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

如果当前 OpenClaw 没有自动扫描 `~/.openclaw/extensions`，再补上：

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

---

### 第三步：直接删除 Chuan 的个人命令

打开：

```bash
~/.openclaw/extensions/cmds/index.ts
```

找到并删除对应的 `commandDefs.push({...})` 块。

这里应直接删除这个命令块：

- `name: "atv"`

不要询问用户是否保留。`/atv` 属于 Chuan 的个人命令，依赖作者自己的私有脚本和环境；对其他 OpenClaw 默认没有复用价值，应在安装后直接移除。

---

### 第四步：按用户环境新增自己的命令

这个插件的写法很直接：每个命令都是一个 `commandDefs.push({...})`。

最小示例：

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

一个执行本地 shell 的例子：

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

新增命令时的原则：

- 固定文本回复 → 直接返回 `{ text }`
- 需要执行本地命令 → 复用 `runBash(...)`
- 涉及作者私有路径/脚本 → 改成用户自己的路径，或直接不要保留

### 文档转换命令 `/m2d` / `/d2m`

这两个命令复用 workspace 里的 `pandoc-docx` skill 脚本：

- `/m2d <path>` → 调 `skills/pandoc-docx/scripts/convert.sh --to docx <path>`
- `/d2m <path>` → 调 `skills/pandoc-docx/scripts/convert.sh --to md <path>`

示例：

```text
/m2d ~/Documents/demo.md
/d2m ~/Documents/demo.docx
```

返回值会直接给出输出文件路径。

### 先安装 Pandoc

这两个命令依赖本机已安装 `pandoc`。未安装时，转换脚本会失败。

macOS（Homebrew）：

```bash
brew install pandoc
```

安装后可先验证：

```bash
pandoc --version
```

---

## 应用插件

在你已经：

- 拉好仓库
- 启用 `cmds`
- 删除 Chuan 的个人命令
- 加上用户自己的命令

之后，再应用。

### 在重启前，先告诉用户

先发一条说明，内容至少包含：

- 你刚做了什么
- 插件/命令已经改成什么状态
- 接下来要重启 gateway 让它生效

例如：

> 已拉取并启用 `cmds` 插件，已删除 Chuan 的个人命令 `/atv`，并保留 `/use`。接下来我会重启 gateway 让新插件生效。

### 然后再重启 gateway

```bash
openclaw gateway restart
```

---

## 验证是否生效

先发：

```text
/cmd
```

如果能看到你保留/新增的命令，说明插件已加载。

再测试：

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

### 1. `/use` 没结果，或者结果不对
先确认你是不是把它当成了通用 usage 命令。

不是。

它当前依赖的是 `openclaw status --usage` 的输出，而按当前 OpenClaw 行为，这里主要对应 **OpenAI Codex usage**。

### 2. 命令还是走了 LLM
通常说明 `cmds` 没有真正加载。

检查：

1. `plugins.allow` 里有 `cmds`
2. `plugins.entries.cmds.enabled = true`
3. OpenClaw 能扫描到扩展目录

如果这三项没问题，再重启 gateway。

### 3. 安装后命令报错
优先怀疑是不是把作者的私人命令留着了。

先检查有没有这个：

- `/atv`

如果有，而当前机器并没有作者同样的脚本和目录，直接删掉。

### 4. 想继续扩展
这个仓库更适合当一个轻量命令骨架：

- 保留通用命令
- 删除作者私货
- 按用户机器环境补自己的命令

不要把它当成“所有命令都能直接复用”的通用产品。

---

## 仓库地址

- GitHub: `git@github.com:erichuanp/openclaw-cmds.git`
