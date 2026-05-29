# 盲注回响 / Ante Echo

本地单人 Balatro-like Web App。第一版线上发布采用静态站部署，不包含账号、云存档、排行榜、多人或后端数据库。

## 本地开发

```bash
pnpm install
pnpm dev
```

常用检查：

```bash
pnpm test
pnpm build
pnpm preview
```

## 存档策略

- 当前 run 和长期资料保存在玩家自己的浏览器 `localStorage`。
- 换浏览器、换设备或清理浏览器数据后，线上站点不会自动恢复旧存档。
- 设置页提供“导出存档”和“导入存档”，用于手动备份和迁移。

## Cloudflare Pages 部署

1. 将项目推送到 GitHub 仓库。
2. 在 Cloudflare Pages 创建项目，并连接该仓库。
3. 构建配置：
   - Install command: `pnpm install`
   - Build command: `pnpm build`
   - Output directory: `dist`
4. 首次部署完成后，使用 Cloudflare 提供的 `*.pages.dev` 地址做 smoke test。
5. 后续如需自定义域名，在 Cloudflare Pages 的 Custom domains 中绑定。

## 发布前检查

- `pnpm test` 通过。
- `pnpm build` 通过。
- `pnpm preview` 下完成：首页 → 新开局 → 盲注选择 → 出牌 → 商店。
- 验证设置页可以导出 JSON 备份，并能导入后继续当前局。
- 桌面和移动端都确认没有按钮遮挡或横向溢出。

## 版权说明

《盲注回响 / Ante Echo》是独立制作的本地单人牌组挑战，不使用原版素材、音乐或受保护文案；只参考扑克构筑类玩法结构和信息层级。
