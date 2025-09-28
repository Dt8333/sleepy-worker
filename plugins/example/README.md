# Example Plugin

这是一个示例插件，演示了 Sleepy Worker 插件系统的主要功能。

## 功能特性

- ✅ 插件路由：`/plugin/example/hello`
- ✅ 全局路由：`/plugin-demo`
- ✅ 主页卡片：显示插件信息和访问统计
- ✅ 管理面板卡片：显示插件状态和管理选项
- ✅ 内容注入：添加自定义 CSS 和 JavaScript
- ✅ 事件处理：响应页面访问和登录事件
- ✅ 数据存储：记录访问次数和初始化时间

## API 端点

### 插件路由

- **GET** `/plugin/example/hello`
  - 返回插件问候消息
  - 响应格式：
    ```json
    {
      "success": true,
      "message": "Hello from Example Plugin!",
      "plugin": "example",
      "timestamp": "2025-09-28T10:00:00.000Z"
    }
    ```

### 全局路由

- **GET** `/plugin-demo`
  - 显示插件演示页面
  - 包含插件信息和返回主页链接

## 配置选项

在 `config.toml` 或环境配置中可以设置以下选项：

```toml
[plugin.example]
enabled = true
greeting = "Hello from Example Plugin!"
showInPanel = true
```

## 存储数据

插件会存储以下数据：

- `visitCount`: 主页访问次数统计
- `lastInitialized`: 最后初始化时间

## 事件处理

插件监听以下事件：

- `index_access`: 主页访问事件
- `login`: 用户登录事件

## 开发说明

这个示例插件演示了如何：

1. 继承 `Plugin` 基类
2. 配置插件信息和依赖
3. 注册路由和处理器
4. 添加 UI 组件（卡片）
5. 注入自定义内容
6. 处理系统事件
7. 存储和读取数据

## 文件结构

```
plugins/example/
├── index.ts          # 主插件文件
└── README.md         # 插件文档
```

## 使用方法

1. 确保插件在 `plugins_enabled` 配置中启用
2. 重启应用程序
3. 访问主页查看插件卡片
4. 访问 `/plugin-demo` 查看插件页面
5. 在管理面板查看插件状态
