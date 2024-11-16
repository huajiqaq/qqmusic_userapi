# qqmusic_userapi

用于qq音乐电脑端设置用户名和头像的nodejs服务器

## 如何使用

## 首先 请配置nodejs环境 并且在项目根目录手动执行npm i

### 1.获取qq cookie

首先本项目只测试过qq音乐电脑端 测试使用Fiddler

抓包 点击工具 选项 HTTPS  **勾选捕获HTTPS请求 勾选解密HTTPS通信 勾选忽略服务器证书错误(不安全)**

**点击连接 查看Fiddler监听端口 记住这个端口 默认是8888**  打开qq音乐电脑端 点击设置 找到网络设置 代理设置 选择HTTP代理 地址为127.0.0.1 端口为监听端口 点击测试 如果提示 代理服务器可以连接。 就是正常 点击确认后重启qq音乐客户端 

随后 在Fiddler 点击用户主页 随便找到musics.fcg的请求 右键Cookie 查看标头 把值那里全部复制

注意 请在更改完后将qq音乐 HTTP代理 更改回来 不然之后不打开Fiddler无法联网

### 2.获取服务器地址

在项目根目录 输入node ./index.js 随后会有类似提示 `服务器运行在 http://localhost:3000` 你可在index.js 手动更改端口
