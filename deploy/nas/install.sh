#!/bin/bash

# NFO Maker 安装脚本 - 绿联 NAS 专用
# 用于在绿联 NAS 上部署 NFO Maker 定时扫描服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 Docker 是否安装
check_docker() {
    log_info "检查 Docker 环境..."
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先在绿联 NAS 应用中心安装 Docker"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose 未安装，请确保 Docker 组件完整"
        exit 1
    fi

    log_success "Docker 环境检查通过"
}

# 检查并创建配置文件
setup_config() {
    log_info "检查配置文件..."

    if [ ! -f ".env" ]; then
        log_warn "未找到 .env 配置文件，从 .env.example 创建..."
        cp .env.example .env
        log_warn "请编辑 .env 文件，配置媒体目录路径和定时规则"
        echo ""
        log_warn "重要配置项："
        echo "  - MEDIA_DIR_1: 第一个媒体目录（NAS 上的实际路径）"
        echo "  - MEDIA_DIR_2: 第二个媒体目录（NAS 上的实际路径）"
        echo "  - WEB_PORT: Web 访问端口（默认 3000）"
        echo ""
        echo "  定时任务配置请在启动后访问 http://NAS_IP:PORT/cron 进行设置"
        echo ""

        read -p "是否现在编辑配置文件？(y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            ${EDITOR:-vi} .env
        fi
    else
        log_success "配置文件 .env 已存在"
    fi
}

# 检查应用代码
setup_app() {
    log_info "检查应用代码..."

    if [ ! -d "app" ]; then
        mkdir -p app
    fi

    # 检查必要文件是否存在
    if [ ! -f "app/server.js" ] || [ ! -f "app/package.json" ]; then
        log_warn "应用代码未部署，正在从上级目录复制..."
        if [ -f "../server.js" ] && [ -f "../package.json" ]; then
            cp -r ../public ../src ../server.js ../package.json app/
            log_success "应用代码复制完成"
        else
            log_error "未找到应用代码，请将整个项目上传到 NAS"
            exit 1
        fi
    else
        log_success "应用代码已存在"
    fi
}

# 创建必要的目录
create_directories() {
    log_info "创建必要目录..."

    # 创建日志目录
    mkdir -p logs

    # 从 .env 读取媒体目录并确保存在
    if [ -f ".env" ]; then
        source .env

        for dir in "${MEDIA_DIR_1}" "${MEDIA_DIR_2}"; do
            if [ -n "$dir" ]; then
                if [ ! -d "$dir" ]; then
                    log_warn "媒体目录不存在: $dir"
                    read -p "是否创建此目录？(y/n) " -n 1 -r
                    echo
                    if [[ $REPLY =~ ^[Yy]$ ]]; then
                        mkdir -p "$dir"
                        log_success "已创建目录: $dir"
                    fi
                else
                    log_success "媒体目录已存在: $dir"
                fi
            fi
        done
    fi
}

# 启动服务
start_service() {
    log_info "启动 NFO Maker 服务..."

    # 尝试使用 docker compose（新版）或 docker-compose（旧版）
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    else
        COMPOSE_CMD="docker-compose"
    fi

    $COMPOSE_CMD up -d

    log_success "服务启动成功！"
    echo ""
    log_info "访问地址："
    echo "  - Web UI: http://NAS_IP:${WEB_PORT:-3000}"
    echo "  - 定时任务管理: http://NAS_IP:${WEB_PORT:-3000}/cron"
    echo ""
    log_info "查看日志："
    echo "  - docker logs -f nfo-maker"
    echo ""
    log_info "管理服务："
    echo "  - 停止: ./manage.sh stop"
    echo "  - 重启: ./manage.sh restart"
    echo "  - 更新: ./manage.sh update"
    echo "  - 手动扫描: ./manage.sh scan"
    echo ""
}

# 主函数
main() {
    echo "========================================="
    echo "  NFO Maker 安装脚本 - 绿联 NAS 专用"
    echo "========================================="
    echo ""

    # 切换到脚本所在目录
    cd "$(dirname "$0")"

    check_docker
    setup_config
    setup_app
    create_directories

    echo ""
    log_info "准备启动服务..."
    echo ""
    start_service

    log_success "安装完成！"
}

# 运行主函数
main
