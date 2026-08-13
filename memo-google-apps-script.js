/**
 * ==============================================================================
 * 网页备忘录 (Webpage Memo Syncer) - Google Apps Script 后端服务代码
 * ==============================================================================
 * 
 * 📋 【Google Sheet 表格结构说明】
 * 本脚本会自动在 Google Sheet 工作表中初始化如下 6 列（首行表头）：
 * ------------------------------------------------------------------------------
 * | 列 A (1) | 列 B (2)   | 列 C (3)     | 列 D (4)   | 列 E (5)   | 列 F (6)   |
 * | URL      | 页面标题   | 备忘录内容   | 标签/分类  | 创建时间   | 最后更新   |
 * ------------------------------------------------------------------------------
 * 
 * 🚀 【部署为 Web App 详细步骤】
 * 1. 新建 Google Sheet 表格：
 *    - 访问 https://sheets.new 创建一个新的 Google 表格，命名为「网页备忘录」或自定义名称。
 *    - 从浏览器地址栏复制表格 ID（URL 中 /d/ 和 /edit 之间的长字符串，例如：`1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`）。
 * 
 * 2. 打开 Apps 脚本编辑器：
 *    - 在该表格顶部菜单栏点击：「扩展程序」 (Extensions) -> 「Apps 脚本」 (Apps Script)。
 * 
 * 3. 粘贴代码：
 *    - 清空编辑器原有的 `function myFunction() {}`，将本文件全部代码复制粘贴进去。
 *    - 点击工具栏的「保存」图标 (Ctrl+S / Cmd+S)。
 * 
 * 4. 部署为 Web 应用 (Web App)：
 *    - 点击右上角蓝色「部署」 (Deploy) 按钮 -> 选择「新建部署」 (New deployment)。
 *    - 点击左侧齿轮图标「选择类型」 -> 选择「Web 应用」 (Web app)。
 *    - 在配置窗口中填写：
 *        - 说明 (Description)：网页备忘录同步服务
 *        - Web 应用执行身份 (Execute as)：选择「我 (你的邮箱)」 (Me)
 *        - 谁有权访问 (Who has access)：选择「任何人」 (Anyone)  <-- 【重要！必须选择任何人，否则油猴跨域无法免登访问】
 *    - 点击「部署」 (Deploy)。
 *    - 弹出权限请求时，点击「授予访问权限」 (Authorize access) -> 选择你的 Google 账号 -> 点击「Advanced (高级)」 -> 点击「Go to Untitled project (unsafe)」 -> 点击「Allow (允许)」。
 * 
 * 5. 获取 Web 应用网址：
 *    - 部署成功后，复制页面显示的「Web 应用网址 (URL)」（格式如：`https://script.google.com/macros/s/AKfycbx.../exec`）。
 * 
 * 6. 配置到油猴脚本：
 *    - 将复制的「Web 应用 URL」和第 1 步的「Google Sheet ID」分别填入油猴脚本开头的 `CONFIG.SCRIPT_URL` 与 `CONFIG.SHEET_ID`。
 * ==============================================================================
 */

// ==================== 1. 处理 POST 请求 (保存 / 更新 / 删除) ====================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: "error", message: "无效的 POST 请求体" });
    }

    const payload = JSON.parse(e.postData.contents);
    const sheetId = payload.sheetId;
    const action = payload.action || "save"; // 'save' | 'delete'

    if (!sheetId) {
      return jsonResponse({ status: "error", message: "缺少 sheetId 参数" });
    }

    const sheet = getOrCreateSheet(sheetId);
    const nowStr = formatDateTime(new Date());

    if (action === "save") {
      const url = (payload.url || "").trim();
      const title = (payload.title || "").trim();
      const memo = payload.memo || "";
      const tags = (payload.tags || "").trim();

      if (!url) {
        return jsonResponse({ status: "error", message: "缺少 url 参数" });
      }

      // 查找当前 URL 是否已存在行
      const rowIndex = findRowIndexByUrl(sheet, url);

      if (rowIndex > 0) {
        // 更新已有行：URL(A), 标题(B), 备忘录(C), 标签(D), 更新时间(F)
        sheet.getRange(rowIndex, 2).setValue(title);
        sheet.getRange(rowIndex, 3).setValue(memo);
        sheet.getRange(rowIndex, 4).setValue(tags);
        sheet.getRange(rowIndex, 6).setValue(nowStr);

        return jsonResponse({
          status: "success",
          action: "updated",
          message: "备忘录已更新",
          data: { url, title, memo, tags, updatedAt: nowStr }
        });
      } else {
        // 追加新行: [URL, 页面标题, 备忘录内容, 标签, 创建时间, 更新时间]
        sheet.appendRow([url, title, memo, tags, nowStr, nowStr]);

        return jsonResponse({
          status: "success",
          action: "created",
          message: "备忘录已保存",
          data: { url, title, memo, tags, createdAt: nowStr, updatedAt: nowStr }
        });
      }

    } else if (action === "delete") {
      const url = (payload.url || "").trim();
      if (!url) {
        return jsonResponse({ status: "error", message: "缺少 url 参数" });
      }

      const rowIndex = findRowIndexByUrl(sheet, url);
      if (rowIndex > 0) {
        sheet.deleteRow(rowIndex);
        return jsonResponse({ status: "success", action: "deleted", message: "备忘录已删除" });
      } else {
        return jsonResponse({ status: "success", action: "not_found", message: "未找到对应备忘录" });
      }

    } else {
      return jsonResponse({ status: "error", message: "未知的 action 操作: " + action });
    }

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// ==================== 2. 处理 GET 请求 (查询单条 / 获取全部) ====================
function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const sheetId = params.sheetId;
    const action = params.action || "get"; // 'get' | 'getAll'

    if (!sheetId) {
      return jsonResponse({ status: "error", message: "缺少 sheetId 参数" });
    }

    const sheet = getOrCreateSheet(sheetId);
    const lastRow = sheet.getLastRow();

    // 如果只有表头或无数据
    if (lastRow <= 1) {
      if (action === "getAll") {
        return jsonResponse({ status: "success", data: [] });
      }
      return jsonResponse({ status: "success", data: null });
    }

    // 读取全部数据 (跳过第 1 行表头，从第 2 行到 lastRow，共 6 列)
    const dataRange = sheet.getRange(2, 1, lastRow - 1, 6).getValues();

    if (action === "getAll") {
      const list = dataRange.map(row => ({
        url: (row[0] || "").toString(),
        title: (row[1] || "").toString(),
        memo: (row[2] || "").toString(),
        tags: (row[3] || "").toString(),
        createdAt: (row[4] || "").toString(),
        updatedAt: (row[5] || "").toString()
      })).filter(item => item.url !== "");

      return jsonResponse({ status: "success", data: list });
    }

    // 默认 action === 'get'，查询指定 URL
    const targetUrl = (params.url || "").trim();
    if (!targetUrl) {
      return jsonResponse({ status: "error", message: "缺少 url 参数" });
    }

    for (let i = 0; i < dataRange.length; i++) {
      const row = dataRange[i];
      const rowUrl = (row[0] || "").toString().trim();
      if (rowUrl === targetUrl) {
        return jsonResponse({
          status: "success",
          data: {
            url: rowUrl,
            title: (row[1] || "").toString(),
            memo: (row[2] || "").toString(),
            tags: (row[3] || "").toString(),
            createdAt: (row[4] || "").toString(),
            updatedAt: (row[5] || "").toString()
          }
        });
      }
    }

    // 没找到
    return jsonResponse({ status: "success", data: null });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// ==================== 3. 辅助函数 ====================

/**
 * 获取或初始化工作表（自动写入表头）
 */
function getOrCreateSheet(sheetId) {
  const spreadsheet = SpreadsheetApp.openById(sheetId);
  const sheet = spreadsheet.getSheets()[0]; // 获取第一个工作表

  // 检查是否有表头，如果没有则自动创建
  if (sheet.getLastRow() === 0) {
    const headers = ["URL", "页面标题", "备忘录内容", "标签/分类", "创建时间", "最后更新"];
    sheet.appendRow(headers);
    // 设置表头加粗和底色
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#f3f4f6");
  }

  return sheet;
}

/**
 * 根据 URL 查找所在行号 (1-indexed)，未找到返回 -1
 */
function findRowIndexByUrl(sheet, targetUrl) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;

  // 获取第一列 (A 列) 所有 URL
  const urls = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < urls.length; i++) {
    const val = (urls[i][0] || "").toString().trim();
    if (val === targetUrl) {
      return i + 2; // 第 1 行是表头，所以数组下标 0 对应实际第 2 行
    }
  }
  return -1;
}

/**
 * 格式化日期为 YYYY-MM-DD HH:mm:ss
 */
function formatDateTime(d) {
  const pad = (n) => (n < 10 ? "0" + n : n);
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 输出标准 JSON 响应
 */
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
