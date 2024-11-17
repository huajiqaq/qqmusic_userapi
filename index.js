const express = require('express');
const sizeOf = require("image-size");
const app = express();
const port = 3000;

app.use(express.json());

// QQMusicFetcher 类用于处理与 QQ 音乐服务器的通信
class QQMusicFetcher {
    constructor(cookies) {
        if (typeof cookies === 'string') {
            this.cookies = this.parseCookies(cookies);
        } else if (typeof cookies !== 'object' || cookies === null) {
            throw new Error('仅支持 cookie 账号设置');
        } else {
            this.cookies = cookies;
        }
    }

    // 解析 cookie 字符串为对象
    parseCookies(cookieString) {
        return cookieString.split(';').reduce((acc, cookie) => {
            const [name, ...values] = cookie.trim().split('=');
            acc[name] = values.join('=').trim();
            return acc;
        }, {});
    }

    // 构建通用参数
    buildComm(options) {
        const baseComm = {
            qq: this.cookies.qqmusic_uin,
            authst: this.cookies.qm_keyst,
            gzip: '0',
            tmeAppID: 'qqmusic',
        };

        if (this.cookies.wxopenid && this.cookies.wxrefresh_token) {
            Object.assign(baseComm, {
                tmeLoginType: 1,
                wxopenid: this.cookies.wxopenid,
                wxrefresh_token: this.cookies.wxrefresh_token,
            });
        } else {
            Object.assign(baseComm, {
                tmeLoginType: 2,
                psrf_qqaccess_token: this.cookies.psrf_qqaccess_token,
                psrf_qqopenid: this.cookies.psrf_qqopenid,
            });
        }

        return { ...baseComm, ...(options.comm || {}) };
    }

    // 发送数据到 QQ 音乐服务器
    async fetchData(options) {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)',
            'Connection': 'Keep-Alive',
            'Accept-Encoding': '',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': this.buildCookieString(),
        };

        const requestOptions = {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...options, comm: this.buildComm(options) }),
        };

        try {
            const response = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', requestOptions);
            if (!response.ok) throw new Error(`HTTP 错误! 状态码: ${response.status}`);
            const data = await response.json();
            console.log(data);
            return data;
        } catch (error) {
            console.error('请求错误:', error.message);
            throw error;
        }
    }

    // 将 cookies 对象构建为字符串
    buildCookieString() {
        return Object.entries(this.cookies)
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }
}

// 基础 API 服务类
class BaseApiService {
    constructor(fetcher, apiConfig) {
        this.fetcher = fetcher;
        this.apiConfig = apiConfig;
    }

    // 调用 API 并处理响应
    async callApi(requestOptions, apiName) {
        try {
            const response = await this.fetcher.fetchData(requestOptions);
            return this.handleResponse(response, this.apiConfig[apiName]);
        } catch (error) {
            console.error(`${apiName} 错误:`, error.message);
            throw error;
        }
    }

    // 处理 API 响应
    handleResponse(response, config) {
        console.log(response)
        if (response.code !== 0 && response.code !== "0") {
            throw new Error(response.message || `API 返回非零码: ${response.code}`);
        }

        let responseData = response;
        if (!responseData.hasOwnProperty(config.keyPath)) {
            throw new Error(`无效的响应结构路径: ${config.keyPath}`);
        }
        responseData = responseData[config.keyPath];

        if (!responseData.data) {
            throw new Error("响应中缺少预期的数据键: data");
        }
        if ((responseData.data.code && responseData.data.code !== 0 && responseData.data.code !== "0") ||
            (responseData.data.errMsg && String(responseData.data.errMsg).toLowerCase() !== 'ok')) {
            throw new Error(`API 访问初步成功，进行 ${config.keyPath} 失败: ${responseData.data[config.ErrKey] || "未知错误"}`);
        }
        if (!responseData.data.hasOwnProperty(config.dataKey)) {
            throw new Error(`API 访问初步成功，进行 ${config.keyPath} 返回不到关键数据 ${config.dataKey}: ${responseData.data[config.ErrKey] || "未知错误"}`);
        }

        return responseData.data[config.dataKey];
    }
}

// 头像服务类
class AvatarService extends BaseApiService {
    constructor(fetcher) {
        super(fetcher, {
            uploadAvatar: { keyPath: "music.profile.Avatar.Upload", ErrKey: "msg", dataKey: "url" },
            alterAvatar: { keyPath: "music.UserInfo.userInfoServer.AlterUserInfo", ErrKey: "hintMsg", dataKey: "hintMsg" }
        });
    }

    // 验证图片格式和大小
    async validateImage(base64Image) {
        if (base64Image.startsWith("data:image/")) {
            base64Image = base64Image.substring(base64Image.indexOf("base64,") + 7);
        }

        const buffer = Buffer.from(base64Image, "base64");
        if (buffer.length > 1048576) {
            throw new Error("图片大小不能超过1MB");
        }

        const dimensions = sizeOf(buffer);
        if (dimensions.width !== 140 || dimensions.height !== 140) {
            throw new Error("图片尺寸必须是140x140像素");
        }

        return buffer;
    }

    // 上传头像
    async uploadAvatar(base64Image) {
        const requestData = {
            "music.profile.Avatar.Upload": {
                module: "music.profile.Avatar",
                method: "Upload",
                param: { img: (await this.validateImage(base64Image)).toString("base64"), bussiness: "avatar" }
            }
        };

        return this.callApi(requestData, "uploadAvatar");
    }

    // 修改头像 URL
    async alterAvatar(url) {
        const requestData = {
            "music.UserInfo.userInfoServer.AlterUserInfo": {
                module: "music.UserInfo.userInfoServer",
                method: "AlterUserInfo",
                param: { mask: 2, info: { logo: url } }
            }
        };

        return this.callApi(requestData, "alterAvatar");
    }

    // 上传并修改头像
    async uploadAndAlterAvatar(base64Image) {
        try {
            const url = await this.uploadAvatar(base64Image);
            await this.alterAvatar(url);
            return url;
        } catch (error) {
            console.error("上传并修改头像错误:", error.message);
            throw error;
        }
    }
}

// 用户信息服务类
class UserInfoManager extends BaseApiService {
    constructor(fetcher) {
        super(fetcher, {
            alterName: { keyPath: "music.UserInfo.userInfoServer.AlterUserInfo", dataKey: "hintMsg" }
        });
    }

    // 修改用户名
    async alterName(newName) {
        const requestData = {
            "music.UserInfo.userInfoServer.AlterUserInfo": {
                module: "music.UserInfo.userInfoServer",
                method: "AlterUserInfo",
                param: { mask: 1, info: { nick: newName } }
            }
        };

        return this.callApi(requestData, "alterName");
    }
}

// 用户服务类
class UserService {
    constructor(fetcher) {
        this.avatarService = new AvatarService(fetcher);
        this.userInfoManager = new UserInfoManager(fetcher);
    }

    // 更新头像
    async updateAvatar(base64Image) {
        try {
            const url = await this.avatarService.uploadAndAlterAvatar(base64Image);
            console.log("头像更新成功:", url);
            return url;
        } catch (error) {
            console.error("更新头像错误:", error.message);
            throw error;
        }
    }

    // 修改用户名
    async alterName(newName) {
        try {
            const result = await this.userInfoManager.alterName(newName);
            console.log("用户名修改成功:", result || newName);
            return result;
        } catch (error) {
            console.error("修改用户名错误:", error.message);
            throw error;
        }
    }
}

// 设置全局 CORS 头
app.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, qqcookie');
    res.header('Content-Type', 'application/json;charset=utf-8');

    // 处理预检请求
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// 中间件：从请求头中提取 qqcookie
app.use((req, res, next) => {
    const qqcookie = req.headers['qqcookie'];
    if (!qqcookie) {
        return res.status(400).json({ error: '请求头中缺少 qqcookie 参数' });
    }
    req.qqcookie = qqcookie;
    next();
});

// 更新头像 API
app.post('/qqmusic_userapi_updateAvatar', async (req, res) => {
    const base64Image = req.body.base64Image;
    if (!base64Image) {
        return res.status(400).json({ error: '请求体中缺少 base64Image 参数' });
    }

    try {
        const fetcher = new QQMusicFetcher(req.qqcookie);
        const userService = new UserService(fetcher);
        const avatarUrl = await userService.updateAvatar(base64Image);
        res.status(200).json({ message: '头像更新成功', result: avatarUrl });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 修改用户名 API
app.post('/qqmusic_userapi_alterName', async (req, res) => {
    const newName = req.body.newName;
    if (!newName) {
        return res.status(400).json({ error: '请求体中缺少 newName 参数' });
    }

    try {
        const fetcher = new QQMusicFetcher(req.qqcookie);
        const userService = new UserService(fetcher);
        const result = await userService.alterName(newName);
        res.status(200).json({ message: '用户名修改成功', result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});
