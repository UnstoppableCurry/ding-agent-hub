# Tools Configuration

## 核心工具集
| 工具 | 用途 | 负责人 |
|------|------|--------|
| Jira | 项目管理 | 开发代理 |
| GitHub/GitLab | 代码管理 | 开发代理 |
| Jenkins | CI/CD | 运维代理 |
| Grafana | 监控 | 运维代理 |
| Confluence | 文档 | 全员 |
| Slack/钉钉 | 通讯 | 全员 |

## 决策支持工具
- 数据分析平台
- 技术雷达
- 成本分析系统

## 圣平总专用工具
- 决策仪表盘（实时数据）
- 技术评审系统
- 资源调度平台

## 工具接入
```yaml
tools:
  - name: 决策仪表盘
    endpoint: /dashboard
    auth: required
  - name: 资源调度
    endpoint: /resources
    auth: required
