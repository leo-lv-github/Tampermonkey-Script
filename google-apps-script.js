/**
 * 部署为 Web App 的步骤：
 * 1. 在浏览器中打开 Google Sheets，点击菜单中的 "扩展程序" -> "Apps 脚本"
 * 2. 清空原有的代码，粘贴以下全部代码。
 * 3. 点击右上角 "部署" -> "新建部署"
 * 4. 左侧选择类型："Web 应用" (如果没有则点击齿轮图标选择)
 * 5. 执行方选择："我"，访问权限选择："所有人" (必须是所有人，否则油猴脚本无法不登录访问)
 * 6. 点击 "部署"，授权访问权限后，复制提供的 "Web 应用网址 (URL)"。
 * 7. 将这个 URL 填入到油猴脚本代码里的 CONFIG.scriptUrl 中。
 */

function doPost(e) {
  try {
    // 解析从油猴脚本 POST 过来的 JSON 数据
    const data = JSON.parse(e.postData.contents);
    const sheetId = data.sheetId; // 从请求中获取 Sheet ID
    const company = data.company;
    const product = data.product;
    const url = data.url;
    const remark = data.remark || "";

    if (!sheetId) {
      return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": "缺少 Sheet ID" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 根据传入的 Sheet ID 打开表格
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheet = spreadsheet.getSheets()[0]; // 获取第一个工作表 (Sheet1)

    // 检查是否有表头，如果没有任何数据，则自动添加表头
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["供應商名", "產品", "url", "備註"]);
    }

    // 将数据作为新的一行插入到表格底部
    sheet.appendRow([company, product, url, remark]);

    // 返回成功状态
    return ContentService.createTextOutput(JSON.stringify({ "status": "success" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // 捕获异常并返回错误信息
    return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const sheetId = e.parameter.sheetId;
    if (!sheetId) {
      return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": "缺少 Sheet ID" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheet = spreadsheet.getSheets()[0];
    
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ "status": "success", "data": [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 获取第一列（A列）的所有数据，从第二行开始跳过表头
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    
    // 展平数组，过滤空白项并去重
    const companies = [];
    values.forEach(row => {
      const val = row[0] ? row[0].toString().trim() : "";
      if (val) {
        companies.push(val);
      }
    });
    
    const uniqueCompanies = [...new Set(companies)];
    
    return ContentService.createTextOutput(JSON.stringify({ "status": "success", "data": uniqueCompanies }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "status": "error", "message": error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
