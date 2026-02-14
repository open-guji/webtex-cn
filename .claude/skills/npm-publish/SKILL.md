---
name: npm-publish
description: Guide and execute npm package publish workflow including version bump, test, build, and publish
disable-model-invocation: false
user-invocable: true
allowed-tools: Bash(*), Read, Edit, Grep, Glob
argument-hint: [patch|minor|major]
---

# npm 发布工作流

对 webtex-cn 包执行完整的 npm 发布流程。版本类型通过参数指定：`$ARGUMENTS`（默认 patch）。

## 发布步骤（严格按顺序执行）

### 1. 预检查

- 确认当前在 `main` 分支，工作区干净（无未提交改动）
- 确认已登录 npm：`npm whoami`
- 读取当前 `package.json` 中的版本号，告知用户

```bash
git status --porcelain
git branch --show-current
npm whoami
```

如果工作区不干净或不在 main 分支，**停止并提醒用户**。

### 2. 运行测试

```bash
npm test
```

测试必须全部通过才能继续。如果有失败，**停止并报告失败的测试**。

### 3. 运行 Lint 检查

```bash
npm run lint
```

如果有 lint 错误，**停止并报告**。

### 4. 构建

```bash
npm run build
```

确认 `dist/` 目录已更新。

### 5. 版本号更新

根据参数决定版本类型（默认 `patch`）：

```bash
npm version <patch|minor|major> --no-git-tag-version
```

- `patch`：0.1.0 → 0.1.1（bug 修复）
- `minor`：0.1.0 → 0.2.0（新功能，向后兼容）
- `major`：0.1.0 → 1.0.0（破坏性变更）

使用 `--no-git-tag-version` 是因为我们要手动控制 commit 和 tag。

### 6. 预览发布内容

```bash
npm pack --dry-run
```

检查文件列表和包大小，确认无遗漏、无多余文件。向用户展示结果。

### 7. Git 提交 + Tag

```bash
git add package.json package-lock.json
git commit -m "release: v<新版本号>"
git tag v<新版本号>
```

### 8. 发布到 npm

**在执行前必须征得用户确认。**

```bash
npm publish
```

### 9. 推送到 GitHub

**在执行前必须征得用户确认。**

```bash
git push origin main --tags
```

### 10. 发布后确认

```bash
npm info webtex-cn version
```

向用户报告发布成功，显示新版本号。

## 注意事项

- 如果任何步骤失败，立即停止并报告，不要继续后续步骤
- `npm publish` 和 `git push` 是不可逆操作，必须在执行前明确获得用户确认
- `prepublishOnly` 脚本会在 `npm publish` 时自动运行 `npm run build`，但我们在步骤 4 提前构建以尽早发现问题
- 如果用户只想做部分操作（如只更新版本号），按用户指示执行对应步骤即可
