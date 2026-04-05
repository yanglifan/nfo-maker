# NFO Maker - 绿联 NAS 部署指南

在绿联 NAS 4300 PLUS 上通过 Docker 部署 NFO Maker 服务，支持 Web UI 和定时任务管理。

## 功能

- **Web UI** - 豆瓣页面解析、NFO 生成和下载
- **定时任务管理** - 可视化的定时扫描配置和运行日志查看
- **API 服务** - 供外部调用的 RESTful API

## 前置条件

1. **Docker 已安装** - 在绿联 NAS 应用中心安装 Docker
2. **Node.js 项目代码** - 完整的 nfo-maker 项目文件
3. **媒体目录** - 准备好要扫描的电影/电视剧目录

## 部署步骤

### 1. 上传文件到 NAS

将 `deploy/nas/` 目录下所有文件和整个项目代码上传到 NAS：

```
/mnt/share/nfo-maker/
├── app/                          # 项目代码
│   ├── server.js
│   ├── package.json
│   ├── src/
│   └── public/
└── deploy/nas/
    ├── docker-compose.yml
    ├── .env.example
    ├── install.sh
    └── manage.sh
```

### 2. 配置环境变量

```bash
cd /mnt/share/nfo-maker/deploy/nas
cp .env.example .env
vi .env
```

主要配置媒体目录路径：
```bash
MEDIA_DIR_1=/mnt/share/Media/Movies
MEDIA_DIR_2=/mnt/share/Media/TVShows
WEB_PORT=3000
```

**定时任务的扫描配置（cron、目录、间隔等）请在 Web 界面的 `/cron` 页面设置。**

### 3. 运行安装脚本

```bash
chmod +x install.sh
./install.sh
```

### 4. 配置定时任务

启动后访问 `http://NAS_IP:3000/cron` 打开定时任务管理页面进行配置和测试。

## 管理命令

```bash
./manage.sh status    # 查看状态
./manage.sh logs      # 查看日志
./manage.sh scan      # 手动触发扫描
./manage.sh restart   # 重启服务
```

## 注意事项

1. **反爬虫策略**：请求间隔建议 3-5 秒
2. **目录权限**：确保 Docker 有权限读写媒体目录
3. **配置优先级**：定时任务配置以 `/cron` 页面的 JSON 配置为准，环境变量仅在首次启动时作为默认值
4. **数据持久化**：`data/` 目录已挂载，配置和日志自动持久化
