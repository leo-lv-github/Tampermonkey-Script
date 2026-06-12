// ==UserScript==
// @name         1688 商品信息极简提取助手
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  极简版：仅在右下角悬浮一个按钮，一键提取1688商品页面的 URL、公司名称、商品名称，并导出无表头表格格式。
// @author       SHENZHEN_LEO
// @match        *://detail.1688.com/offer/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=1688.com
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    // 预设的 XPath (XML Path Language, 可扩展标记语言路径语言)
    const XPATH_COMPANY = "/html/body/div[4]/div[2]/div[1]/div[1]/div/a/div[1]/a[1]/h1";
    const XPATH_PRODUCT = "/html/body/div[4]/div[2]/div[2]/div/div[1]/div/div[3]/div/div[1]/h1";

    // 用于在后台存储抓取到的数据
    const extractedData = {
        company: "获取中...",
        product: "获取中...",
        url: window.location.origin + window.location.pathname // 自动清理了 URL (Uniform Resource Locator, 统一资源定位系统) 中的追踪参数
    };

    // 根据 XPath 获取 DOM (Document Object Model, 文档对象模型) 节点文本的辅助函数
    function getTextByXPath(xpath) {
        try {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            return result.singleNodeValue ? result.singleNodeValue.textContent.trim() : "";
        } catch (e) {
            console.error("XPath 解析错误:", e);
            return "";
        }
    }

    // 调用油猴 API (Application Programming Interface, 应用程序编程接口) 进行复制
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

    // 创建右下角悬浮按钮 UI (User Interface, 用户界面)
    function createFloatingButton() {
        if (document.getElementById('gm-1688-minimal-btn')) return;

        const copyBtn = document.createElement('button');
        copyBtn.id = 'gm-1688-minimal-btn';
        copyBtn.innerHTML = "📊 一键复制表格";

        // 设置样式，固定在最右下角
        copyBtn.style.cssText = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            padding: 12px 20px;
            background: #ff6000;
            color: #ffffff;
            border: none;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(255, 96, 0, 0.4);
            cursor: pointer;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-weight: 600;
            font-size: 14px;
            z-index: 9999999;
            transition: all 0.2s ease-in-out;
        `;

        // 增加鼠标悬停效果
        copyBtn.onmouseover = () => { copyBtn.style.transform = "scale(1.05)"; };
        copyBtn.onmouseout = () => { copyBtn.style.transform = "scale(1)"; };

        // 点击复制逻辑（TSV 格式无表头排列）
        copyBtn.onclick = () => {
            const rowData = `${extractedData.company}\t${extractedData.product}\t${extractedData.url}`;
            copyToClipboard(rowData, copyBtn);
        };

        document.body.appendChild(copyBtn);

        // 建立定时器轮询，应对动态加载的元素
        let retryCount = 0;
        const maxRetries = 30; // 轮询 15 秒

        const fetchTimer = setInterval(() => {
            retryCount++;

            const fetchedCompany = getTextByXPath(XPATH_COMPANY);
            const fetchedProduct = getTextByXPath(XPATH_PRODUCT);

            if (fetchedCompany && extractedData.company === "获取中...") {
                extractedData.company = fetchedCompany;
            }
            if (fetchedProduct && extractedData.product === "获取中...") {
                extractedData.product = fetchedProduct;
            }

            // 如果两者都获取到了，或者超时，则停止后台轮询
            if ((fetchedCompany && fetchedProduct) || retryCount >= maxRetries) {
                clearInterval(fetchTimer);
                if (extractedData.company === "获取中...") extractedData.company = "未获取到公司名称";
                if (extractedData.product === "获取中...") extractedData.product = "未获取到商品名称";
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createFloatingButton);
    } else {
        createFloatingButton();
    }

})();
