#!/bin/bash

# NFO Maker 管理脚本 - 绿联 NAS 专用
# 用于管理 NFO Maker 定时扫描服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 切换到脚本所在目录
cd "$(dirname "$0")"

# 加载环境变量
if [ -f ".env" ]; then
    source .env
else
    echo -e "${YELLOW}[WARN]${NC} 未找到 .env 文件，使用默认配置"
fi

# 设置 compose 命令
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

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

# 显示帮助信息
show_help() {
    echo "========================================="
    echo "  NFO Maker 管理脚本（纯 CLI 定时扫描）"
    echo "========================================="
    echo ""
    echo "用法: ./manage.sh <命令>"
    echo ""
    echo "可用命令："
    echo "  start       - 启动服务"
    echo "  stop        - 停止服务"
    echo "  restart     - 重启服务"
    echo "  status      - 查看服务状态"
    echo "  logs        - 查看实时日志"
    echo "  logs-tail   - 查看最近 100 行日志"
    echo "  scan        - 手动触发一次扫描"
    echo "  update      - 更新应用代码并重启"
    echo "  backup      - 备份配置和日志"
    echo "  clean       - 清理 Docker 资源"
    echo "  help        - 显示此帮助信息"
    echo ""
}

# 启动服务
cmd_start() {
    log_info "启动 NFO Maker 服务..."
    $COMPOSE_CMD up -d
    log_success "服务已启动"
    echo ""
    log_info "服务模式：纯 CLI 定时扫描（无 Web UI）"
    log_info "查看日志: docker logs -f nfo-maker"
}

# 停止服务
cmd_stop() {
    log_info "停止 NFO Maker 服务..."
    $COMPOSE_CMD down
    log_success "服务已停止"
}

# 重启服务
cmd_restart() {
    log_info "重启 NFO Maker 服务..."
    $COMPOSE_CMD restart
    log_success "服务已重启"
}

# 查看服务状态
cmd_status() {
    log_info "服务状态："
    echo ""
    $COMPOSE_CMD ps
    echo ""

    if docker ps --format '{{.Names}}' | grep -q "^nfo-maker$"; then
        log_success "服务正在运行"
        echo ""

        # 显示容器资源使用
        log_info "资源使用情况："
        docker stats nfo-maker --no-stream --format "  CPU: {{.CPUPerc}} | 内存: {{.MemUsage}}"
        echo ""

        # 显示定时任务配置
        log_info "定时任务配置："
        echo "  扫描规则: ${SCAN_CRON:-0 2 * * *}"
        echo "  扫描目录: ${SCAN_DIRS:-/data/media1,/data/media2}"
        echo "  请求间隔: ${SCAN_INTERVAL:-3} 秒"
    else
        log_warn "服务未运行"
    fi
}

# 查看实时日志
cmd_logs() {
    log_info "查看实时日志（Ctrl+C 退出）..."
    docker logs -f nfo-maker
}

# 查看最近日志
cmd_logs_tail() {
    log_info "最近 100 行日志："
    echo "========================================="
    docker logs --tail 100 nfo-maker
    echo "========================================="
}

# 手动触发扫描
cmd_scan() {
    log_info "手动触发扫描..."

    # 通过容器内的 Web API 触发扫描
    docker exec nfo-maker wget -qO- http://localhost:3000/api/cron/scan --post-data='' 2>/dev/null || \
    docker exec nfo-maker node -e "
      const http = require('http');
      const req = http.request({hostname:'localhost',port:3000,path:'/api/cron/scan',method:'POST'}, res => {
        let d=''; res.on('data',c => d+=c); res.on('end', () => console.log(d));
      });
      req.end();
    "

    echo ""
    log_success "扫描任务已提交，请查看日志了解进度"
}

# 更新应用代码
cmd_update() {
    log_info "更新应用代码..."

    if [ ! -d "../.git" ]; then
        log_warn "未检测到 git 仓库，请手动更新应用代码"
        log_info "请将新的代码复制到 app/ 目录，然后重启服务"
        return
    fi

    # 如果是 git 仓库，拉取最新代码
    log_info "从 git 仓库拉取最新代码..."
    git pull

    # 重新构建
    log_info "重新构建容器..."
    $COMPOSE_CMD up -d --build

    log_success "更新完成"
}

# 备份配置和日志
cmd_backup() {
    BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"

    log_info "创建备份到 $BACKUP_DIR ..."

    mkdir -p "$BACKUP_DIR"

    # 备份配置文件
    if [ -f ".env" ]; then
        cp .env "$BACKUP_DIR/"
        log_info "已备份 .env"
    fi

    # 备份 docker-compose.yml
    if [ -f "docker-compose.yml" ]; then
        cp docker-compose.yml "$BACKUP_DIR/"
        log_info "已备份 docker-compose.yml"
    fi

    # 备份日志
    if [ -d "logs" ] && [ "$(ls -A logs 2>/dev/null)" ]; then
        cp -r logs "$BACKUP_DIR/"
        log_info "已备份日志"
    fi

    # 创建备份压缩包
    tar -czf "${BACKUP_DIR}.tar.gz" "$BACKUP_DIR"
    rm -rf "$BACKUP_DIR"

    log_success "备份完成: ${BACKUP_DIR}.tar.gz"
}

# 清理 Docker 资源
cmd_clean() {
    log_warn "此操作将："
    echo "  - 停止并删除容器"
    echo "  - 删除相关网络"
    echo "  - 删除未使用的镜像"
    echo ""

    read -p "确认执行？(y/n) " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "清理中..."
        $COMPOSE_CMD down
        docker system prune -f
        log_success "清理完成"
    else
        log_info "操作已取消"
    fi
}

# 主函数
main() {
    case "${1:-help}" in
        start)
            cmd_start
            ;;
        stop)
            cmd_stop
            ;;
        restart)
            cmd_restart
            ;;
        status)
            cmd_status
            ;;
        logs)
            cmd_logs
            ;;
        logs-tail)
            cmd_logs_tail
            ;;
        scan)
            cmd_scan
            ;;
        update)
            cmd_update
            ;;
        backup)
            cmd_backup
            ;;
        clean)
            cmd_clean
            ;;
        help|*)
            show_help
            ;;
    esac
}

# 运行主函数
main "$@"
