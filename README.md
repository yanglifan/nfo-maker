# NFO Maker

从豆瓣电影/剧集页面生成 Kodi / Emby / Jellyfin / UGNAS 兼容的 NFO 元数据文件。

## 功能

- 输入豆瓣电影或剧集 URL，自动解析页面元数据
- 自动识别电影 / 剧集类型，也可手动切换
- 提取标题、原始标题、年份、评分、类型、导演、编剧、演员、国家/地区、片长、集数、剧情简介、海报等信息
- 生成符合标准的 NFO XML 文件（`movie.nfo` 或 `tvshow.nfo`）
- 网页端预览解析结果，支持下载 NFO 文件或复制 XML 内容

## 技术栈

- **后端**: Node.js + Express
- **页面解析**: Cheerio
- **HTTP 请求**: node-fetch
- **前端**: 原生 HTML / CSS / JavaScript

## 项目结构

```
nfo-maker/
├── server.js                     # Express 服务入口
├── package.json
├── public/                       # 前端静态文件
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── src/
    ├── routes/api.js             # API 路由
    ├── controllers/nfoController.js  # 请求处理
    ├── services/
    │   ├── doubanScraper.js      # 豆瓣页面抓取
    │   ├── doubanParser.js       # HTML 解析与数据提取
    │   └── nfoGenerator.js       # NFO XML 生成
    ├── utils/
    │   ├── httpClient.js         # HTTP 客户端（含验证处理）
    │   └── validator.js          # URL 校验
    └── constants/selectors.js    # CSS 选择器常量
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm start
```

服务默认运行在 `http://localhost:3000`，可通过环境变量 `PORT` 自定义端口。

### 使用方式

1. 打开浏览器访问 `http://localhost:3000`
2. 输入豆瓣电影或剧集的 URL（如 `https://movie.douban.com/subject/1292052/`）
3. 点击「解析」按钮，等待页面解析完成
4. 预览解析结果，按需切换 NFO 类型（电影 / 剧集）
5. 点击「下载 NFO 文件」保存，或点击「复制 XML」将内容复制到剪贴板

## API

### POST /api/parse

解析豆瓣页面，返回结构化数据。

**请求体:**

```json
{
  "url": "https://movie.douban.com/subject/1292052/"
}
```

**响应:**

```json
{
  "success": true,
  "data": {
    "type": "movie",
    "doubanId": "1292052",
    "title": "肖申克的救赎",
    "originalTitle": "The Shawshank Redemption",
    "year": "1994",
    "rating": "9.7",
    "genres": ["犯罪", "剧情"],
    "directors": ["弗兰克·德拉邦特"],
    "writers": ["弗兰克·德拉邦特", "斯蒂芬·金"],
    "actors": [{ "name": "蒂姆·罗宾斯", "role": "" }],
    "countries": ["美国"],
    "runtime": "142",
    "plot": "...",
    "poster": "..."
  }
}
```

### POST /api/generate

生成并下载 NFO 文件。

**请求体:**

```json
{
  "url": "https://movie.douban.com/subject/1292052/",
  "type": "movie"
}
```

也可直接传入已解析的数据：

```json
{
  "data": { ... },
  "type": "tvshow"
}
```

**响应:** XML 文件（`Content-Type: application/xml`），浏览器将自动触发下载。

## 兼容性

生成的 NFO 文件兼容以下媒体中心软件：

- Kodi
- Emby
- Jellyfin
- UGNAS

## License

ISC
