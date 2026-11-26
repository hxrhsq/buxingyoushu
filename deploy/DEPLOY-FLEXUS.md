# 部署到华为云 Flexus 香港（183.87.134.238）执行手册

给「能操作用户电脑、且已连上这台服务器」的智能体执行。
目标：**独立部署一套新版，旧 ECS 完全不动，验证通过后再切 DNS。**

## 0. 先确认这四件事

- 本地（Windows 工作区 `1b7b268e`）**已经构建好 standalone 产物**：`.next/standalone/`（约 26M，含 `server.js` 与精简 `node_modules`）。**不要在服务器上再跑 build**（2 核 2G 容易 OOM）。
- 版本号取 `.next/BUILD_ID`（构建时生成，部署完要报回来）。
- 环境变量**就是原来的 8 个**，`FLYAI_API_KEY` 已含推广者权限，**不需要新增变量**：
  `FLYAI_API_KEY`、`AMAP_WEB_KEY`、`AMAP_JS_KEY`、`AMAP_JS_SECURITY_CODE`、
  `DASHSCOPE_API_KEY`、`BAILIAN_WORKSPACE_ID`、`BAILIAN_AGENT_ID`、`BAILIAN_ENV_ID`。
  全部只放服务端 `.env.local`（权限 600），**不要加任何 `NEXT_PUBLIC_` 前缀**。
- 服务器只跑运行时：Node ≥ 20、Caddy。Docker 不是必须的。

## 1. 上传到新机

在本机项目目录执行（把 `USER` 换成实际 SSH 用户）：

```bash
tar -czf /tmp/bxys-app.tgz .next/standalone .next/static public
scp /tmp/bxys-app.tgz USER@183.87.134.238:/tmp/
scp .env.local USER@183.87.134.238:/tmp/bxys.env
```

服务器上：

```bash
mkdir -p /opt/buxingyoushu/app
tar -xzf /tmp/bxys-app.tgz -C /opt/buxingyoushu
cp -r /opt/buxingyoushu/.next/standalone/. /opt/buxingyoushu/app/
cp -r /opt/buxingyoushu/.next/static /opt/buxingyoushu/app/.next/static
cp -r /opt/buxingyoushu/public /opt/buxingyoushu/app/public
install -m 600 /tmp/bxys.env /opt/buxingyoushu/app/.env.local
```

## 2. 用 systemd 跑运行时

`/etc/systemd/system/buxingyoushu.service`：

```ini
[Unit]
Description=buxingyoushu Next.js standalone
After=network.target

[Service]
WorkingDirectory=/opt/buxingyoushu/app
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
EnvironmentFile=/opt/buxingyoushu/app/.env.local
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

然后：

```bash
systemctl daemon-reload
systemctl enable --now buxingyoushu
systemctl status buxingyoushu --no-pager
curl -I http://127.0.0.1:3000/
```

本机 `curl` 返回 200 再继续。

## 3. 反代与证书

把本项目 `deploy/Caddyfile` 的内容放到 `/etc/caddy/Caddyfile`（域名 `travel.peiqirui.com`），要点：

- `reverse_proxy 127.0.0.1:3000`，`read_timeout 300s`、`write_timeout 300s`、`flush_interval -1`。
- **`/_AMapService` 不要做任何改写**，原样转发；Next 内部会处理，这条断了地图就全挂。

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

**切 DNS 之后**，等 Caddy 把 https 证书签好（`journalctl -u caddy --no-pager | tail` 看签发日志）。

## 4. 公网验收（三件都过才算上线）

1. **首页**：`https://travel.peiqirui.com/` 打开是「步行有数 · 每段走得动」，首屏是济南/南京/扬州三选一。
2. **生成一条路线**：默认济南点「生成我的路线」，能出 4 站（东花墙子街/曲水亭街/芙蓉街/西更道街）。
3. **酒店卡链接**：路线下方「住一晚」有 3 家酒店与图片，点「飞猪详情」能跳到飞猪；链接是 `router.feizhu.com` 的编码短链（归因在内层，外层看不到 `pid` 属正常，不要当成异常）。

如果酒店卡或路线不出，先查 `systemctl status buxingyoushu` 和 `.env.local` 是否 8 个变量都在。

## 5. 回滚与汇报

- **旧 ECS 不要停、不要改**，新机验收不过就把 DNS 切回旧机。
- 验收通过后汇报：访问地址（`https://travel.peiqirui.com`）、版本号（`.next/BUILD_ID`）、三项验收结果。