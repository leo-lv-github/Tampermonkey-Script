// ==UserScript==
// @name         一键提取并复制订阅链接
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  提取页面上的 V2RayN、Clash、Shadowrocket 等订阅链接，并提供一键复制功能。
// @author       SHENZHEN_LEO
// @match        https://fibacc.net/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    // 1. 创建一键复制按钮
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '一键复制所有订阅';

    // 设置按钮的 UI (User Interface，用户界面) 样式，使其悬浮在右下角
    Object.assign(copyBtn.style, {
        position: 'fixed',
        bottom: '30px',
        right: '30px',
        padding: '12px 24px',
        backgroundColor: '#007bff',
        color: '#ffffff',
        border: 'none',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 'bold',
        cursor: 'pointer',
        zIndex: '99999',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        transition: 'background-color 0.3s'
    });

    // 2. 绑定点击事件处理逻辑
    copyBtn.addEventListener('click', () => {
        // 查找所有带有 copy-text 且包含 data-clipboard-text 属性的按钮
        const buttons = document.querySelectorAll('.copy-text[data-clipboard-text]');
        let results = [];

        buttons.forEach(btn => {
            // 获取按钮内的纯文本（例如："复制 V2RayN 订阅"）
            let rawText = btn.textContent.trim();

            // 使用正则表达式提取核心名称，去掉前缀“复制”和后缀“订阅”及多余空格
            let name = rawText.replace(/复制\s*/, '').replace(/\s*订阅/, '').trim();

            // 获取真实的订阅链接
            let url = btn.getAttribute('data-clipboard-text');

            if (name && url) {
                results.push(`${name}: ${url}`);
            }
        });

        // 按要求用两个换行符拼接最终的字符串
        const finalString = results.join('\n\n');

        if (finalString) {
            // 使用油猴自带的 API (Application Programming Interface，应用程序编程接口) 复制到剪贴板
            GM_setClipboard(finalString, 'text');

            // 按钮状态反馈
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✅ 复制成功！';
            copyBtn.style.backgroundColor = '#28a745';

            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.backgroundColor = '#007bff';
            }, 2000);
        } else {
            alert('未在当前页面找到匹配的订阅链接。');
        }
    });

    // 3. 将按钮注入到页面主体中
    document.body.appendChild(copyBtn);
})();