// ==UserScript==
// @name         1688公司名称精准高亮助手
// @namespace    http://tampermonkey.net/
<<<<<<< HEAD
// @version      1.0
// @description  在1688搜索结果页面通过粘贴列表高亮比对公司名称
// @author       SHENZHEN_LEO
// @match        *://s.1688.com/selloffer/*
// @grant        none
=======
// @version      2.0
// @description  在1688搜索结果页面通过粘贴列表高亮比对公司名称，也可一键从 Google Sheet 获取公司列表并自动高亮。
// @author       SHENZHEN_LEO
// @match        *://s.1688.com/selloffer/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      script.google.com
// @connect      script.googleusercontent.com
>>>>>>> 5e41f1d21b46b558804c9aebbe223010dc9d4eef
// ==/UserScript==

(function () {
    'use strict';

    // ================= 动态配置 =================
    let scriptUrl = GM_getValue("scriptUrl", "");
    let sheetId = GM_getValue("sheetId", "");
    // ===========================================

    // 1. 创建悬浮 UI 面板
    const panel = document.createElement('div');
    panel.style.position = 'fixed';
    panel.style.bottom = '30px';
    panel.style.right = '30px';
    panel.style.zIndex = '999999';
    panel.style.backgroundColor = '#ffffff';
    panel.style.border = '1px solid #e0e0e0';
    panel.style.padding = '15px';
    panel.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15)';
    panel.style.borderRadius = '12px';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '10px';
    panel.style.width = '260px';

    // 头部区域：标题与设置图标
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    const title = document.createElement('div');
    title.innerHTML = "🎯 1688 高亮助手";
    title.style.cssText = "font-weight: 600; font-size: 14px; color: #333;";
    const settingsBtn = document.createElement('div');
    settingsBtn.innerHTML = "⚙️";
    settingsBtn.style.cssText = "cursor: pointer; font-size: 16px; transition: transform 0.2s;";
    settingsBtn.onmouseover = () => { settingsBtn.style.transform = "rotate(45deg)"; };
    settingsBtn.onmouseout = () => { settingsBtn.style.transform = "rotate(0deg)"; };
    header.appendChild(title);
    header.appendChild(settingsBtn);
    panel.appendChild(header);

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
    panel.appendChild(settingsPanel);

    // 点击设置图标切换显示设置面板
    settingsBtn.onclick = () => {
        settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'flex' : 'none';
    };

    // 输入框
    const textArea = document.createElement('textarea');
    textArea.placeholder = '手动输入/获取结果将显示在这里\n每行一个公司名称';
    textArea.style.width = '100%';
    textArea.style.height = '150px';
    textArea.style.resize = 'vertical';
    textArea.style.padding = '8px';
    textArea.style.border = '1px solid #ccc';
    textArea.style.borderRadius = '6px';
    textArea.style.fontSize = '12px';
    textArea.style.boxSizing = 'border-box';
    panel.appendChild(textArea);

    // 一键获取并高亮按钮
    const fetchHighlightBtn = document.createElement('button');
    fetchHighlightBtn.innerHTML = '☁️ 从 Google Sheet 获取并高亮';
    fetchHighlightBtn.style.padding = '8px 12px';
    fetchHighlightBtn.style.cursor = 'pointer';
    fetchHighlightBtn.style.backgroundColor = '#0088cc';
    fetchHighlightBtn.style.color = '#fff';
    fetchHighlightBtn.style.border = 'none';
    fetchHighlightBtn.style.borderRadius = '6px';
    fetchHighlightBtn.style.fontWeight = 'bold';
    fetchHighlightBtn.style.fontSize = '12px';
    fetchHighlightBtn.style.transition = 'opacity 0.2s';
    fetchHighlightBtn.onmouseover = () => { fetchHighlightBtn.style.opacity = "0.9"; };
    fetchHighlightBtn.onmouseout = () => { fetchHighlightBtn.style.opacity = "1"; };
    panel.appendChild(fetchHighlightBtn);

    // 手动高亮操作按钮
    const highlightBtn = document.createElement('button');
    highlightBtn.textContent = '🔍 仅高亮当前输入框内容';
    highlightBtn.style.padding = '8px 12px';
    highlightBtn.style.cursor = 'pointer';
    highlightBtn.style.backgroundColor = '#ff6000'; // 1688 品牌色
    highlightBtn.style.color = '#fff';
    highlightBtn.style.border = 'none';
    highlightBtn.style.borderRadius = '6px';
    highlightBtn.style.fontWeight = 'bold';
    highlightBtn.style.fontSize = '12px';
    highlightBtn.style.transition = 'opacity 0.2s';
    highlightBtn.onmouseover = () => { highlightBtn.style.opacity = "0.9"; };
    highlightBtn.onmouseout = () => { highlightBtn.style.opacity = "1"; };
    
    // 最小化按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '隐藏';
    toggleBtn.style.padding = '8px 12px';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.border = '1px solid #ccc';
    toggleBtn.style.backgroundColor = '#f8f8f8';
    toggleBtn.style.borderRadius = '6px';
    toggleBtn.style.fontSize = '12px';

    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.justifyContent = 'space-between';
    btnContainer.style.gap = '8px';
    
    // 给手动高亮加 flex: 1，占满剩余空间
    highlightBtn.style.flex = '1';
    
    btnContainer.appendChild(highlightBtn);
    btnContainer.appendChild(toggleBtn);
    panel.appendChild(btnContainer);

    document.body.appendChild(panel);

    // 隐藏/显示面板逻辑
    let isMinimized = false;
    toggleBtn.onclick = () => {
        isMinimized = !isMinimized;
        textArea.style.display = isMinimized ? 'none' : 'block';
        fetchHighlightBtn.style.display = isMinimized ? 'none' : 'block';
        highlightBtn.style.display = isMinimized ? 'none' : 'block';
        settingsPanel.style.display = 'none';
        header.style.display = isMinimized ? 'none' : 'flex';
        toggleBtn.textContent = isMinimized ? '展开面板' : '隐藏';
        panel.style.width = isMinimized ? 'auto' : '260px';
    };

    // 核心比对与高亮逻辑
    function doHighlight() {
        const input = textArea.value;
        const targetCompanies = input.split('\n')
            .map(name => name.trim())
            .filter(name => name.length > 0);

        if (targetCompanies.length === 0) {
            alert('没有可用于比对的公司名称！');
            return;
        }

        let matchCount = 0;
        const allDivs = document.querySelectorAll('div');

        allDivs.forEach(div => {
            const text = div.innerText ? div.innerText.trim() : '';

            if (targetCompanies.includes(text)) {
                if (div.clientHeight > 0 && div.clientHeight < 50) {
                    div.style.color = 'red';
                    div.style.fontWeight = 'bold';
                    div.style.fontSize = '14px';
                    div.style.backgroundColor = '#ffe6e6';
                    matchCount++;
                }
            }
        });

        return matchCount;
    }

    highlightBtn.onclick = () => {
        const matchCount = doHighlight();
        if (matchCount !== undefined) {
            highlightBtn.textContent = `命中 ${matchCount} 个目标!`;
            setTimeout(() => {
                highlightBtn.textContent = '🔍 仅高亮当前输入框内容';
            }, 2500);
        }
    };

    fetchHighlightBtn.onclick = () => {
        if (!scriptUrl) {
            alert("请先点击右上角 ⚙️ 配置 部署 URL");
            return;
        }
        if (!sheetId) {
            alert("请先点击右上角 ⚙️ 配置 Sheet ID");
            return;
        }

        const originalText = fetchHighlightBtn.innerHTML;
        fetchHighlightBtn.innerHTML = '☁️ 获取中...';
        fetchHighlightBtn.disabled = true;

        const requestUrl = `${scriptUrl}?sheetId=${encodeURIComponent(sheetId)}`;

        GM_xmlhttpRequest({
            method: "GET",
            url: requestUrl,
            onload: function(response) {
                try {
                    // 解析 Apps Script 返回的 JSON
                    const res = JSON.parse(response.responseText);
                    if (res.status === 'success' && res.data) {
                        const companies = res.data;
                        if (companies.length === 0) {
                            alert("表格中没有找到公司数据");
                        } else {
                            textArea.value = companies.join('\n');
                            const matchCount = doHighlight();
                            fetchHighlightBtn.innerHTML = `获取成功，高亮 ${matchCount} 个`;
                            fetchHighlightBtn.style.backgroundColor = '#4CAF50';
                        }
                    } else {
                        alert("获取数据失败: " + (res.message || "未知错误"));
                    }
                } catch (e) {
                    console.error("解析响应失败", e, response.responseText);
                    alert("解析响应失败，请检查 Apps Script 是否正确部署并且配置了所有人可访问");
                }
                setTimeout(() => {
                    fetchHighlightBtn.innerHTML = originalText;
                    fetchHighlightBtn.style.backgroundColor = '#0088cc';
                    fetchHighlightBtn.disabled = false;
                }, 3000);
            },
            onerror: function(err) {
                console.error("请求失败", err);
                alert("请求 Google Sheet 失败！请检查网络或配置");
                fetchHighlightBtn.innerHTML = originalText;
                fetchHighlightBtn.disabled = false;
            }
        });
    };
})();
