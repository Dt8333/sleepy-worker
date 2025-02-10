# sleepy-worker

一个用于 ~~*视奸*~~ 查看个人在线状态 (以及正在使用软件) 的 Flask 应用，让他人能知道你不在而不是故意吊他/她

原项目:[wyf9/sleepy](https://github.com/wyf9/sleepy)
本项目试图将其移植到Cloudflare Worker上，并尽力保证与原项目的兼容性。
本项目仅提供服务端。原项目中提供了多种客户端，这里不进行重复工作。
如果发现有不兼容的地方请在issue提出。

## Worker Environment
SECRET="你的SECRET"
USER="你的昵称"
LEARNMORE="更多信息链接的提示"
REPO="更多信息链接的目标"
MORETEXT="内容将在状态页底部 learn_more 上方插入"
BG="背景图片 url"

## Cloudflare KV
本项目使用Cloudflare KV存储当前状态和状态列表。
请在Wrangler.json中将KV id改为你自己账号相应的KV id。

## 初始化状态列表
访问/status_list/init

