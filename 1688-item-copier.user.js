// ==UserScript==
// @name         1688 商品信息极简提取助手
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  极简版：右下角悬浮面板，一键提取1688商品页面信息，并可一键插入到Google Sheet中，带自定义备注。
// @author       SHENZHEN_LEO
// @match        *://detail.1688.com/offer/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=1688.com
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(function () {
    'use strict';

    // ================= 动态配置 =================
    // 使用 GM_getValue 获取持久化的设置，如果为空则为空字符串
    let scriptUrl = GM_getValue("scriptUrl", "");
    let sheetId = GM_getValue("sheetId", "");
    // ===========================================

    // 预设的 XPath (XML Path Language) - 多层试错
    const XPATH_COMPANY = [
        "/html/body/div[4]/div[2]/div[1]/div[1]/div/a/div[1]/a[1]/h1",
        "/html/body/div[4]/div[1]/div[1]/div[1]/div/a/div[1]/a[1]/h1",
        "/html/body/div[5]/div[2]/div[1]/div[1]/div[1]/a[1]/div[1]/a[1]/h1[1]"
    ];
    const XPATH_PRODUCT = [
        "/html/body/div[4]/div[2]/div[2]/div/div[1]/div[1]/div[2]/div/div[1]/h1",
        "/html/body/div[4]/div[1]/div[2]/div/div[1]/div/div[2]/div/div[1]/h1",
        "/html/body/div[5]/div[2]/div[2]/div[1]/div[1]/div[1]/div[2]/div[1]/div[1]/h1[1]"
    ];

    // 用于在后台存储抓取到的数据
    const extractedData = {
        company: "获取中...",
        product: "获取中...",
        url: window.location.origin + window.location.pathname // 自动清理了 URL 中的追踪参数
    };

    // 根据 XPath 数组获取 DOM 节点文本的辅助函数（多层试错）
    function getTextByXPath(xpathArray) {
        for (const xpath of xpathArray) {
            try {
                const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                if (result.singleNodeValue && result.singleNodeValue.textContent.trim() !== "") {
                    return result.singleNodeValue.textContent.trim();
                }
            } catch (e) {
                console.error("XPath 解析错误:", xpath, e);
            }
        }
        return "";
    }

    // 格式化显示名称（保留首尾各两个字）
    function formatName(name) {
        if (!name || name === "获取中..." || name.startsWith("未获取到")) return name;
        if (name.length <= 4) return name;
        return name.substring(0, 2) + "..." + name.substring(name.length - 2);
    }

    // 调用油猴 API 进行复制
    function copyToClipboard(text, buttonElement) {
        GM_setClipboard(text, 'text');
        const originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = "已复制 ✓";
        buttonElement.style.background = "#4CAF50"; // 成功时的绿色反馈
        setTimeout(() => {
            buttonElement.innerHTML = originalText;
            buttonElement.style.background = "#ff6000"; // 恢复 1688 主题橙色
        }, 1500);
    }

    // 将数据发送到 Google Sheet
    function sendToGoogleSheet(buttonElement, remarkText) {
        if (!scriptUrl) {
            alert("请先在设置面板中配置 部署 URL");
            return;
        }
        if (!sheetId) {
            alert("请先在设置面板中配置 Sheet ID");
            return;
        }

        const originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = "插入中...";
        buttonElement.disabled = true;

        const payload = {
            sheetId: sheetId,
            company: extractedData.company,
            product: extractedData.product,
            url: extractedData.url,
            remark: remarkText
        };

        GM_xmlhttpRequest({
            method: "POST",
            url: scriptUrl,
            headers: {
                "Content-Type": "application/json"
            },
            data: JSON.stringify(payload),
            onload: function (response) {
                // Apps Script 返回的重定向可能会有不同状态码
                if (response.status === 200 || response.status === 302) {
                    buttonElement.innerHTML = "插入成功 ✓";
                    buttonElement.style.background = "#4CAF50";
                } else {
                    buttonElement.innerHTML = "插入失败 ✗";
                    buttonElement.style.background = "#f44336";
                    console.error("插入 Google Sheet 失败:", response.responseText);
                }
                setTimeout(() => {
                    buttonElement.innerHTML = originalText;
                    buttonElement.style.background = "#0088cc";
                    buttonElement.disabled = false;
                }, 2000);
            },
            onerror: function (err) {
                buttonElement.innerHTML = "请求出错 ✗";
                buttonElement.style.background = "#f44336";
                console.error("GM_xmlhttpRequest 出错:", err);
                setTimeout(() => {
                    buttonElement.innerHTML = originalText;
                    buttonElement.style.background = "#0088cc";
                    buttonElement.disabled = false;
                }, 2000);
            }
        });
    }

    // 创建右下角悬浮 UI
    function createFloatingUI() {
        if (document.getElementById('gm-1688-minimal-ui')) return;

        // 面板容器
        const container = document.createElement('div');
        container.id = 'gm-1688-minimal-ui';
        container.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            padding: 15px;
            background: #ffffff;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            z-index: 9999999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            width: 220px;
            transition: all 0.2s ease-in-out;
        `;

        // 头部区域：标题与设置图标
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        const title = document.createElement('div');
        title.innerHTML = "📦 1688 助手";
        title.style.cssText = "font-weight: 600; font-size: 14px; color: #333;";
        const settingsBtn = document.createElement('div');
        settingsBtn.innerHTML = "⚙️";
        settingsBtn.style.cssText = "cursor: pointer; font-size: 16px; transition: transform 0.2s;";
        settingsBtn.onmouseover = () => { settingsBtn.style.transform = "rotate(45deg)"; };
        settingsBtn.onmouseout = () => { settingsBtn.style.transform = "rotate(0deg)"; };
        header.appendChild(title);
        header.appendChild(settingsBtn);
        container.appendChild(header);

        // 信息显示区域
        const infoDisplay = document.createElement('div');
        infoDisplay.style.cssText = `
            font-size: 12px;
            color: #666;
            background: #f9f9f9;
            padding: 8px;
            border-radius: 6px;
            border: 1px dashed #ccc;
            display: flex;
            flex-direction: column;
            gap: 4px;
        `;
        const companyDisplay = document.createElement('div');
        companyDisplay.innerHTML = `🏢 <span id="gm-company-text">获取中...</span>`;
        const productDisplay = document.createElement('div');
        productDisplay.innerHTML = `🏷️ <span id="gm-product-text">获取中...</span>`;
        infoDisplay.appendChild(companyDisplay);
        infoDisplay.appendChild(productDisplay);
        container.appendChild(infoDisplay);

        // 设置面板 (默认隐藏)
        const settingsPanel = document.createElement('div');
        settingsPanel.style.cssText = `
            display: none;
            flex-direction: column;
            gap: 8px;
            padding: 10px;
            background: #f5f5f5;
            border-radius: 6px;
            border: 1px solid #ddd;
            margin-bottom: 5px;
        `;
        
        // 部署 URL 输入框
        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.placeholder = '在此填入 部署 URL';
        urlInput.value = scriptUrl;
        urlInput.style.cssText = `
            width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 12px; outline: none;
        `;
        urlInput.oninput = (e) => {
            scriptUrl = e.target.value.trim();
            GM_setValue("scriptUrl", scriptUrl);
        };
        settingsPanel.appendChild(urlInput);

        // Sheet ID 输入框
        const idInput = document.createElement('input');
        idInput.type = 'text';
        idInput.placeholder = '在此填入 Sheet ID';
        idInput.value = sheetId;
        idInput.style.cssText = `
            width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 12px; outline: none;
        `;
        idInput.oninput = (e) => {
            sheetId = e.target.value.trim();
            GM_setValue("sheetId", sheetId);
        };
        settingsPanel.appendChild(idInput);
        container.appendChild(settingsPanel);

        // 点击设置图标切换显示设置面板
        settingsBtn.onclick = () => {
            settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'flex' : 'none';
        };

        // 备注输入框
        const remarkInput = document.createElement('input');
        remarkInput.type = 'text';
        remarkInput.placeholder = '在此输入备注...';
        remarkInput.style.cssText = `
            width: 100%;
            padding: 8px 10px;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-sizing: border-box;
            font-size: 13px;
            outline: none;
            transition: border-color 0.2s;
        `;
        remarkInput.onfocus = () => { remarkInput.style.borderColor = '#ff6000'; };
        remarkInput.onblur = () => { remarkInput.style.borderColor = '#ccc'; };
        container.appendChild(remarkInput);

        // 快捷备注按钮
        const quickRemarkContainer = document.createElement('div');
        quickRemarkContainer.style.cssText = `
            display: flex;
            gap: 8px;
            width: 100%;
        `;
        
        const quickBtnA = document.createElement('button');
        quickBtnA.innerHTML = "无法提供SDK";
        quickBtnA.title = "快捷输入：无法提供 SDK";
        quickBtnA.style.cssText = `
            flex: 1;
            padding: 5px 0;
            background: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            color: #555;
            transition: all 0.2s;
        `;
        quickBtnA.onmouseover = () => { quickBtnA.style.borderColor = '#ff6000'; quickBtnA.style.color = '#ff6000'; };
        quickBtnA.onmouseout = () => { quickBtnA.style.borderColor = '#ddd'; quickBtnA.style.color = '#555'; };
        quickBtnA.onclick = () => { 
            remarkInput.value = remarkInput.value ? remarkInput.value + " 无法提供 SDK" : "无法提供 SDK"; 
        };

        const quickBtnB = document.createElement('button');
        quickBtnB.innerHTML = "等待回复";
        quickBtnB.title = "快捷输入：等待回复";
        quickBtnB.style.cssText = `
            flex: 1;
            padding: 5px 0;
            background: #f5f5f5;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            color: #555;
            transition: all 0.2s;
        `;
        quickBtnB.onmouseover = () => { quickBtnB.style.borderColor = '#ff6000'; quickBtnB.style.color = '#ff6000'; };
        quickBtnB.onmouseout = () => { quickBtnB.style.borderColor = '#ddd'; quickBtnB.style.color = '#555'; };
        quickBtnB.onclick = () => { 
            remarkInput.value = remarkInput.value ? remarkInput.value + " 等待回复" : "等待回复"; 
        };

        quickRemarkContainer.appendChild(quickBtnA);
        quickRemarkContainer.appendChild(quickBtnB);
        container.appendChild(quickRemarkContainer);

        // 插入 Google Sheet 按钮
        const sheetBtn = document.createElement('button');
        sheetBtn.innerHTML = "☁️ 一键插入 Sheet";
        sheetBtn.style.cssText = `
            width: 100%;
            padding: 10px;
            background: #0088cc;
            color: #ffffff;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.2s;
        `;
        sheetBtn.onmouseover = () => { sheetBtn.style.opacity = "0.9"; };
        sheetBtn.onmouseout = () => { sheetBtn.style.opacity = "1"; };
        sheetBtn.onclick = () => {
            sendToGoogleSheet(sheetBtn, remarkInput.value);
        };
        container.appendChild(sheetBtn);

        // 复制按钮
        const copyBtn = document.createElement('button');
        copyBtn.innerHTML = "📊 仅复制表格内容";
        copyBtn.style.cssText = `
            width: 100%;
            padding: 10px;
            background: #ff6000;
            color: #ffffff;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.2s;
        `;
        copyBtn.onmouseover = () => { copyBtn.style.opacity = "0.9"; };
        copyBtn.onmouseout = () => { copyBtn.style.opacity = "1"; };
        copyBtn.onclick = () => {
            const rowData = `${extractedData.company}\t${extractedData.product}\t${extractedData.url}\t${remarkInput.value}`;
            copyToClipboard(rowData, copyBtn);
        };
        container.appendChild(copyBtn);

        document.body.appendChild(container);

        // 建立定时器轮询，应对动态加载的元素
        let retryCount = 0;
        const maxRetries = 30; // 轮询 15 秒

        const fetchTimer = setInterval(() => {
            retryCount++;

            const fetchedCompany = getTextByXPath(XPATH_COMPANY);
            const fetchedProduct = getTextByXPath(XPATH_PRODUCT);

            if (fetchedCompany && extractedData.company === "获取中...") {
                extractedData.company = fetchedCompany;
                const el = document.getElementById('gm-company-text');
                if (el) el.innerText = formatName(fetchedCompany);
            }
            if (fetchedProduct && extractedData.product === "获取中...") {
                extractedData.product = fetchedProduct;
                const el = document.getElementById('gm-product-text');
                if (el) el.innerText = formatName(fetchedProduct);
            }

            // 如果两者都获取到了，或者超时，则停止后台轮询
            if ((fetchedCompany && fetchedProduct) || retryCount >= maxRetries) {
                clearInterval(fetchTimer);
                if (extractedData.company === "获取中...") {
                    extractedData.company = "未获取到公司名称";
                    const el = document.getElementById('gm-company-text');
                    if (el) el.innerText = "未获取到公司名称";
                }
                if (extractedData.product === "获取中...") {
                    extractedData.product = "未获取到商品名称";
                    const el = document.getElementById('gm-product-text');
                    if (el) el.innerText = "未获取到商品名称";
                }
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createFloatingUI);
    } else {
        createFloatingUI();
    }

})();
