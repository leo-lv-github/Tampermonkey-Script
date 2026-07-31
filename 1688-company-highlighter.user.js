// ==UserScript==
// @name         1688公司名称精准高亮助手
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在1688搜索结果页面通过粘贴列表高亮比对公司名称
// @author       SHENZHEN_LEO
// @match        *://s.1688.com/selloffer/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

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

    // 输入框
    const textArea = document.createElement('textarea');
    textArea.placeholder = '请在此粘贴公司名称，每行一个（回车换行）\n例如：\n深圳市爱都科技有限公司\n深圳市智亿元科技有限公司';
    textArea.style.width = '260px';
    textArea.style.height = '180px';
    textArea.style.resize = 'vertical';
    textArea.style.padding = '8px';
    textArea.style.border = '1px solid #ccc';
    textArea.style.borderRadius = '6px';
    textArea.style.fontSize = '12px';

    // 按钮容器
    const btnContainer = document.createElement('div');
    btnContainer.style.display = 'flex';
    btnContainer.style.justifyContent = 'space-between';

    // 高亮操作按钮
    const highlightBtn = document.createElement('button');
    highlightBtn.textContent = '开始比对并高亮';
    highlightBtn.style.padding = '8px 12px';
    highlightBtn.style.cursor = 'pointer';
    highlightBtn.style.backgroundColor = '#ff6000'; // 1688 品牌色
    highlightBtn.style.color = '#fff';
    highlightBtn.style.border = 'none';
    highlightBtn.style.borderRadius = '6px';
    highlightBtn.style.fontWeight = 'bold';

    // 最小化按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '隐藏';
    toggleBtn.style.padding = '8px 12px';
    toggleBtn.style.cursor = 'pointer';
    toggleBtn.style.border = '1px solid #ccc';
    toggleBtn.style.backgroundColor = '#f8f8f8';
    toggleBtn.style.borderRadius = '6px';

    btnContainer.appendChild(highlightBtn);
    btnContainer.appendChild(toggleBtn);

    panel.appendChild(textArea);
    panel.appendChild(btnContainer);
    document.body.appendChild(panel);

    // 隐藏/显示面板逻辑
    let isMinimized = false;
    toggleBtn.onclick = () => {
        isMinimized = !isMinimized;
        textArea.style.display = isMinimized ? 'none' : 'block';
        toggleBtn.textContent = isMinimized ? '展开面板' : '隐藏';
        panel.style.width = isMinimized ? 'auto' : '260px';
    };

    // 2. 核心比对与高亮逻辑
    highlightBtn.onclick = () => {
        const input = textArea.value;
        // 获取并清理公司名称数组（去除前后空格及空行）
        const targetCompanies = input.split('\n')
            .map(name => name.trim())
            .filter(name => name.length > 0);

        if (targetCompanies.length === 0) {
            alert('请输入至少一个公司名称！');
            return;
        }

        let matchCount = 0;

        // 方案：放弃使用脆弱的绝对 XPATH，直接获取页面上所有的 div 元素（类似于遍历所有的 UIView）
        // 1688 的公司名称通常包裹在一个单独的 div 中
        const allDivs = document.querySelectorAll('div');

        allDivs.forEach(div => {
            // 获取该视图及其子视图包含的所有纯文本
            const text = div.innerText ? div.innerText.trim() : '';

            if (targetCompanies.includes(text)) {
                // 为了防止把包含该文字的外层大父容器（比如整个商品卡片）也加粗标红
                // 我们限制只操作高度较小的叶子节点（通常公司名字段的高度不会超过 50px）
                if (div.clientHeight > 0 && div.clientHeight < 50) {
                    div.style.color = 'red';
                    div.style.fontWeight = 'bold';
                    div.style.fontSize = '14px'; // 稍微放大一点
                    div.style.backgroundColor = '#ffe6e6'; // 加个浅红底色，视觉更明显

                    matchCount++;
                }
            }
        });

        // 按钮状态反馈
        highlightBtn.textContent = `命中 ${matchCount} 个目标!`;
        setTimeout(() => {
            highlightBtn.textContent = '开始比对并高亮';
        }, 2500);
    };
})();
