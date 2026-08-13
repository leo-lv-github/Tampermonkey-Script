// ==UserScript==
// @name         网页备忘录同步助手 (Webpage Memo Syncer)
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  在所有网页右下角提供备忘录按钮，针对当前网址记录专属备忘录，重新打开网页时自动提醒，内容中的URL支持直接点击跳转，并与 Google Sheet 实时双向同步。
// @author       SHENZHEN_LEO
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // ⚙️ 【基础固定配置】请在此处填入你的 Google Apps Script URL 与 Sheet ID
    // =========================================================================
    const DEFAULT_CONFIG = {
        // 1. Google Apps Script 部署后的 Web 应用 URL (以 /exec 结尾)
        SCRIPT_URL: "https://script.google.com/macros/s/AKfycbznVjzsQeo2up5tmiBo9Q_1uiXE9IEm2i0pZlGJJm-v9RXwvMaD7qw-v_nt73T_2h4X/exec",

        // 2. Google Sheet 表格 ID (浏览器打开表格时 /d/ 和 /edit 之间的字符)
        // https://docs.google.com/spreadsheets/d/17LfjALyCqRLHCC1hlyB2aww1Rq1My-4nY0pZIrtOuF4/edit?usp=sharing
        SHEET_ID: "17LfjALyCqRLHCC1hlyB2aww1Rq1My-4nY0pZIrtOuF4",

        // 3. 重新打开已存有备忘录的网页时，是否自动在右下角弹出备忘录提示卡片
        AUTO_NOTIFY_ON_LOAD: true,

        // 4. 自动提示卡片停留时间（秒），设为 0 则不自动关闭
        AUTO_NOTIFY_DURATION: 6,

        // 5. 匹配网址时是否去除 #hash（例如 #section-1，推荐 true）
        STRIP_HASH: true,

        // 6. 匹配网址时是否去除常见推广追踪参数（例如 utm_*, spm, from 等，推荐 true）
        CLEAN_TRACKING_PARAMS: true,
    };

    // 读取持久化配置（优先使用用户在设置面板中填写的配置，未设置则使用上方代码固定默认值）
    function getConfig() {
        return {
            SCRIPT_URL: GM_getValue("memo_script_url", DEFAULT_CONFIG.SCRIPT_URL).trim(),
            SHEET_ID: GM_getValue("memo_sheet_id", DEFAULT_CONFIG.SHEET_ID).trim(),
            AUTO_NOTIFY_ON_LOAD: GM_getValue("memo_auto_notify", DEFAULT_CONFIG.AUTO_NOTIFY_ON_LOAD),
            AUTO_NOTIFY_DURATION: GM_getValue("memo_notify_duration", DEFAULT_CONFIG.AUTO_NOTIFY_DURATION),
            STRIP_HASH: GM_getValue("memo_strip_hash", DEFAULT_CONFIG.STRIP_HASH),
            CLEAN_TRACKING_PARAMS: GM_getValue("memo_clean_tracking", DEFAULT_CONFIG.CLEAN_TRACKING_PARAMS)
        };
    }

    // =========================================================================
    // 🛠️ 【URL 规范化与处理】
    // =========================================================================
    function getNormalizedUrl() {
        try {
            const parsed = new URL(window.location.href);
            const config = getConfig();

            if (config.STRIP_HASH) {
                parsed.hash = "";
            }

            if (config.CLEAN_TRACKING_PARAMS && parsed.search) {
                const trackingKeys = [
                    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
                    'spm', 'spm_id_from', 'from', 'ref', 'source', 'fbclid', 'gclid', '_ga',
                    'scm', 'pvid', 'trackInfo', 'clickid'
                ];
                trackingKeys.forEach(k => parsed.searchParams.delete(k));
            }

            let finalUrl = parsed.toString();
            if (finalUrl.endsWith('?')) {
                finalUrl = finalUrl.slice(0, -1);
            }
            return finalUrl;
        } catch (e) {
            return window.location.href;
        }
    }

    const CURRENT_URL = getNormalizedUrl();
    const CURRENT_DOMAIN = (() => {
        try { return new URL(CURRENT_URL).hostname; } catch (e) { return ""; }
    })();
    const IS_MAC = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const HOTKEY_LABEL = IS_MAC ? '⌘ + ↵' : 'Ctrl + ↵';
    const CACHE_PREFIX = "tm_memo_";

    function getCacheKey(url = CURRENT_URL) {
        return CACHE_PREFIX + encodeURIComponent(url);
    }

    function getLocalMemo(url = CURRENT_URL) {
        return GM_getValue(getCacheKey(url), null);
    }

    function setLocalMemo(data, url = CURRENT_URL) {
        if (!data) {
            GM_deleteValue(getCacheKey(url));
        } else {
            GM_setValue(getCacheKey(url), data);
        }
    }

    // =========================================================================
    // 🔗 【URL 自动超链接解析转换】
    // =========================================================================
    function escapeHtml(text) {
        if (!text) return "";
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function linkifyText(text) {
        if (!text || !text.trim()) {
            return '<span class="tm-memo-empty-tip">暂无日志内容，点击下方切换到「编辑」即可输入...</span>';
        }

        const escaped = escapeHtml(text);
        // 匹配 http://、https:// 或 www. 开头的网址
        const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s])/gi;

        return escaped.replace(urlRegex, (matchedUrl) => {
            let href = matchedUrl;
            if (!href.startsWith('http://') && !href.startsWith('https://')) {
                href = 'https://' + href;
            }
            return `<a class="tm-memo-content-link" href="${href}" target="_blank" rel="noopener noreferrer" title="直接在新标签页中打开: ${href}">${matchedUrl} <svg class="tm-memo-link-icon" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
        });
    }

    // =========================================================================
    // 🎨 【精美矢量 SVG 图标集】
    // =========================================================================
    const ICONS = {
        memo: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
        cloudCheck: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/><polyline points="9 12 11.5 14.5 15.5 10.5"/></svg>`,
        sync: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`,
        settings: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
        trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
        save: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
        spinner: `<svg class="tm-memo-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-linecap="round"/></svg>`,
        check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
        link: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
        lightbulb: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
        eye: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
        edit: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`
    };

    // =========================================================================
    // 🌐 【Google Sheet (GAS) 网络交互】
    // =========================================================================

    function isConfigValid() {
        const config = getConfig();
        return (
            config.SCRIPT_URL &&
            config.SHEET_ID &&
            !config.SCRIPT_URL.includes("YOUR_GAS_DEPLOYMENT_ID") &&
            !config.SHEET_ID.includes("YOUR_GOOGLE_SHEET_ID")
        );
    }

    function fetchCloudMemo(url, callback) {
        const config = getConfig();
        if (!isConfigValid()) {
            callback({ status: "unconfigured", message: "尚未配置 Google Script URL 或 Sheet ID" });
            return;
        }

        const requestUrl = `${config.SCRIPT_URL}?action=get&sheetId=${encodeURIComponent(config.SHEET_ID)}&url=${encodeURIComponent(url)}&_t=${Date.now()}`;

        GM_xmlhttpRequest({
            method: "GET",
            url: requestUrl,
            headers: { "Accept": "application/json" },
            timeout: 15000,
            onload: function (response) {
                try {
                    const result = JSON.parse(response.responseText);
                    if (result.status === "success") {
                        callback({ status: "success", data: result.data });
                    } else {
                        callback({ status: "error", message: result.message || "请求失败" });
                    }
                } catch (e) {
                    callback({ status: "error", message: "解析响应失败: " + e.message });
                }
            },
            ontimeout: function () {
                callback({ status: "error", message: "网络连接超时" });
            },
            onerror: function () {
                callback({ status: "error", message: "网络请求错误" });
            }
        });
    }

    function saveCloudMemo(memoData, callback) {
        const config = getConfig();
        if (!isConfigValid()) {
            callback({ status: "unconfigured", message: "尚未配置 Google Script URL 或 Sheet ID" });
            return;
        }

        const payload = {
            sheetId: config.SHEET_ID,
            action: "save",
            url: memoData.url,
            title: memoData.title,
            memo: memoData.memo,
            tags: "" // 默认留空，保持后端 Sheet 列兼容
        };

        GM_xmlhttpRequest({
            method: "POST",
            url: config.SCRIPT_URL,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            timeout: 15000,
            onload: function (response) {
                try {
                    const result = JSON.parse(response.responseText);
                    if (result.status === "success") {
                        callback({ status: "success", data: result.data, action: result.action });
                    } else {
                        callback({ status: "error", message: result.message || "保存失败" });
                    }
                } catch (e) {
                    callback({ status: "error", message: "解析响应失败: " + e.message });
                }
            },
            ontimeout: function () {
                callback({ status: "error", message: "网络连接超时" });
            },
            onerror: function () {
                callback({ status: "error", message: "网络请求错误" });
            }
        });
    }

    function deleteCloudMemo(url, callback) {
        const config = getConfig();
        if (!isConfigValid()) {
            callback({ status: "unconfigured", message: "尚未配置 Google Script URL 或 Sheet ID" });
            return;
        }

        const payload = {
            sheetId: config.SHEET_ID,
            action: "delete",
            url: url
        };

        GM_xmlhttpRequest({
            method: "POST",
            url: config.SCRIPT_URL,
            headers: { "Content-Type": "application/json" },
            data: JSON.stringify(payload),
            timeout: 15000,
            onload: function (response) {
                try {
                    const result = JSON.parse(response.responseText);
                    if (result.status === "success") {
                        callback({ status: "success", action: result.action });
                    } else {
                        callback({ status: "error", message: result.message || "删除失败" });
                    }
                } catch (e) {
                    callback({ status: "error", message: "解析响应失败: " + e.message });
                }
            },
            ontimeout: function () {
                callback({ status: "error", message: "网络连接超时" });
            },
            onerror: function () {
                callback({ status: "error", message: "网络请求错误" });
            }
        });
    }

    // =========================================================================
    // 🎨 【现代化极致 UI 样式注入（边距加大、支持链接直达）】
    // =========================================================================
    function injectStyles() {
        const css = `
            /* 根容器隔离与设计变量 */
            #tm-memo-root {
                --tm-primary: #4f46e5;
                --tm-primary-hover: #4338ca;
                --tm-primary-light: #eef2ff;
                --tm-primary-border: #c7d2fe;
                --tm-text-main: #0f172a;
                --tm-text-muted: #64748b;
                --tm-text-sub: #94a3b8;
                --tm-bg-card: #ffffff;
                --tm-bg-subtle: #f8fafc;
                --tm-bg-input: #ffffff;
                --tm-border-color: #e2e8f0;
                --tm-border-focus: #818cf8;
                --tm-shadow-card: 0 24px 38px -10px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.08);
                --tm-shadow-fab: 0 12px 28px -4px rgba(79, 70, 229, 0.4), 0 4px 8px -2px rgba(0, 0, 0, 0.06);
                --tm-radius-md: 12px;
                --tm-radius-lg: 20px;
                
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
                font-size: 13px;
                line-height: 1.5;
                color: var(--tm-text-main);
                z-index: 2147483640;
                position: fixed;
                bottom: 32px; /* 增加底部边距 */
                right: 32px;  /* 增加右侧边距 */
                box-sizing: border-box;
                direction: ltr;
                text-align: left;
                -webkit-font-smoothing: antialiased;
            }
            #tm-memo-root * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            .tm-memo-spin {
                animation: tm-spin 1s linear infinite;
            }
            @keyframes tm-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            /* 右下角悬浮按钮 (FAB) */
            .tm-memo-fab {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
                color: #ffffff;
                box-shadow: var(--tm-shadow-fab);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease;
                position: relative;
                user-select: none;
            }
            .tm-memo-fab:hover {
                transform: translateY(-3px) scale(1.06);
                box-shadow: 0 16px 32px -4px rgba(79, 70, 229, 0.5), 0 0 0 3px rgba(199, 210, 254, 0.6);
            }
            .tm-memo-fab:active {
                transform: translateY(0) scale(0.96);
            }
            .tm-memo-fab-icon {
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s ease;
            }
            .tm-memo-fab:hover .tm-memo-fab-icon {
                transform: rotate(-8deg);
            }

            /* 存有备忘录时的呼吸光环 */
            .tm-memo-badge {
                position: absolute;
                top: -1px;
                right: -1px;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: #10b981;
                border: 2.5px solid #ffffff;
                display: none;
            }
            .tm-memo-fab.has-memo .tm-memo-badge {
                display: block;
                animation: tm-pulse-emerald 2.2s infinite;
            }
            @keyframes tm-pulse-emerald {
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.8); }
                70% { transform: scale(1.05); box-shadow: 0 0 0 7px rgba(16, 185, 129, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }

            /* 主卡片面板 (边距与内衬均更宽裕) */
            .tm-memo-panel {
                position: fixed;
                bottom: 96px;
                right: 32px;
                width: 420px;
                max-width: calc(100vw - 48px);
                max-height: calc(100vh - 130px);
                background: var(--tm-bg-card);
                border-radius: var(--tm-radius-lg);
                box-shadow: var(--tm-shadow-card);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                opacity: 0;
                transform: translateY(18px) scale(0.96);
                pointer-events: none;
                transition: opacity 0.24s cubic-bezier(0.16, 1, 0.3, 1), transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
                z-index: 2147483641;
            }
            .tm-memo-panel.active {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: auto;
            }

            /* 面板顶部 Header */
            .tm-memo-header {
                padding: 16px 22px;
                background: var(--tm-bg-subtle);
                border-bottom: 1px solid var(--tm-border-color);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .tm-memo-title-area {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .tm-memo-brand-icon {
                width: 30px;
                height: 30px;
                border-radius: 8px;
                background: var(--tm-primary-light);
                color: var(--tm-primary);
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .tm-memo-heading {
                font-weight: 700;
                font-size: 14.5px;
                color: var(--tm-text-main);
                letter-spacing: -0.2px;
            }
            .tm-memo-status-pill {
                font-size: 11px;
                padding: 2px 8px;
                border-radius: 999px;
                background: #f1f5f9;
                color: var(--tm-text-muted);
                font-weight: 500;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                transition: all 0.2s ease;
            }
            .tm-memo-status-pill.synced {
                background: #ecfdf5;
                color: #047857;
                border: 1px solid #a7f3d0;
            }
            .tm-memo-status-pill.syncing {
                background: #fffbeb;
                color: #b45309;
                border: 1px solid #fde68a;
            }
            .tm-memo-status-pill.local {
                background: #eff6ff;
                color: #1d4ed8;
                border: 1px solid #bfdbfe;
            }
            .tm-memo-status-pill.error {
                background: #fef2f2;
                color: #b91c1c;
                border: 1px solid #fecaca;
            }

            .tm-memo-header-actions {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .tm-memo-icon-btn {
                background: transparent;
                border: none;
                width: 32px;
                height: 32px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--tm-text-muted);
                transition: background 0.15s, color 0.15s, transform 0.1s;
            }
            .tm-memo-icon-btn:hover {
                background: #e2e8f0;
                color: var(--tm-text-main);
            }
            .tm-memo-icon-btn:active {
                transform: scale(0.92);
            }

            /* 面板 Body */
            .tm-memo-body {
                padding: 20px 22px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 16px;
                max-height: 520px;
            }
            .tm-memo-body::-webkit-scrollbar {
                width: 6px;
            }
            .tm-memo-body::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 4px;
            }

            /* 网址展示卡片 */
            .tm-memo-url-card {
                background: var(--tm-bg-subtle);
                border: 1px solid var(--tm-border-color);
                border-radius: var(--tm-radius-md);
                padding: 10px 14px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 12px;
                gap: 10px;
            }
            .tm-memo-domain-badge {
                font-size: 11px;
                font-weight: 600;
                color: var(--tm-primary);
                background: var(--tm-primary-light);
                padding: 2px 7px;
                border-radius: 5px;
                white-space: nowrap;
            }
            .tm-memo-url-text {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                flex: 1;
                color: var(--tm-text-muted);
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            }
            .tm-memo-copy-btn {
                background: #ffffff;
                border: 1px solid var(--tm-border-color);
                cursor: pointer;
                font-size: 11px;
                color: var(--tm-text-muted);
                padding: 3px 8px;
                border-radius: 6px;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                transition: all 0.15s;
                white-space: nowrap;
            }
            .tm-memo-copy-btn:hover {
                color: var(--tm-primary);
                border-color: var(--tm-primary-border);
                background: var(--tm-primary-light);
            }

            /* 表单元素 */
            .tm-memo-form-group {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .tm-memo-form-label-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .tm-memo-label {
                font-size: 11.5px;
                font-weight: 600;
                color: var(--tm-text-muted);
                letter-spacing: 0.3px;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .tm-memo-char-count {
                font-size: 10.5px;
                color: var(--tm-text-sub);
            }
            .tm-memo-input {
                width: 100%;
                padding: 9px 12px;
                border: 1px solid var(--tm-border-color);
                border-radius: var(--tm-radius-md);
                font-size: 13px;
                color: var(--tm-text-main);
                outline: none;
                transition: border-color 0.15s, box-shadow 0.15s;
                background: var(--tm-bg-input);
            }
            .tm-memo-input:focus {
                border-color: var(--tm-border-focus);
                box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
            }

            /* 模式切换 (阅读模式 / 编辑模式) */
            .tm-memo-mode-switcher {
                display: inline-flex;
                background: #e2e8f0;
                padding: 2px;
                border-radius: 8px;
                gap: 2px;
            }
            .tm-memo-mode-btn {
                background: transparent;
                border: none;
                padding: 3px 8px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 600;
                color: #64748b;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                transition: all 0.15s ease;
            }
            .tm-memo-mode-btn.active {
                background: #ffffff;
                color: var(--tm-primary);
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
            }

            /* 备忘录文本域 (编辑模式) */
            .tm-memo-textarea {
                width: 100%;
                min-height: 140px;
                max-height: 260px;
                padding: 12px 14px;
                border: 1px solid var(--tm-border-color);
                border-radius: var(--tm-radius-md);
                font-size: 13px;
                line-height: 1.7;
                color: var(--tm-text-main);
                resize: vertical;
                outline: none;
                transition: border-color 0.15s, box-shadow 0.15s;
                font-family: inherit;
                background: var(--tm-bg-input);
            }
            .tm-memo-textarea:focus {
                border-color: var(--tm-border-focus);
                box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
            }
            .tm-memo-textarea::placeholder {
                color: #cbd5e1;
            }

            /* 备忘录阅读卡片 (查看模式，支持URL直接点击) */
            .tm-memo-view-box {
                width: 100%;
                min-height: 140px;
                max-height: 260px;
                padding: 12px 14px;
                border: 1px solid var(--tm-border-color);
                border-radius: var(--tm-radius-md);
                background: var(--tm-bg-subtle);
                overflow-y: auto;
                font-size: 13px;
                line-height: 1.7;
                color: var(--tm-text-main);
                white-space: pre-wrap;
                word-break: break-word;
            }
            .tm-memo-empty-tip {
                color: var(--tm-text-sub);
                font-style: italic;
                user-select: none;
            }

            /* 备忘录内容中的可点击链接 */
            .tm-memo-content-link {
                color: #2563eb;
                text-decoration: none;
                background: #eff6ff;
                border-radius: 4px;
                padding: 1px 5px;
                display: inline-flex;
                align-items: center;
                gap: 2px;
                margin: 0 1px;
                font-weight: 500;
                transition: all 0.15s ease;
                border-bottom: 1px solid #bfdbfe;
                cursor: pointer;
            }
            .tm-memo-content-link:hover {
                color: #1d4ed8;
                background: #dbeafe;
                border-bottom-color: #3b82f6;
                text-decoration: none;
            }
            .tm-memo-link-icon {
                width: 11px;
                height: 11px;
                stroke: currentColor;
                stroke-width: 2.5;
                fill: none;
                stroke-linecap: round;
                stroke-linejoin: round;
                display: inline-block;
                vertical-align: middle;
            }

            /* 时间戳元信息 */
            .tm-memo-meta-info {
                font-size: 11px;
                color: var(--tm-text-sub);
                display: flex;
                justify-content: space-between;
                padding: 0 4px;
            }

            /* 面板底部 Footer */
            .tm-memo-footer {
                padding: 16px 22px;
                background: var(--tm-bg-subtle);
                border-top: 1px solid var(--tm-border-color);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }
            .tm-memo-btn-group {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .tm-memo-btn {
                padding: 8px 16px;
                border-radius: var(--tm-radius-md);
                font-size: 12.5px;
                font-weight: 600;
                cursor: pointer;
                border: 1px solid transparent;
                transition: all 0.15s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                line-height: 1.4;
                user-select: none;
            }
            .tm-memo-btn:active {
                transform: scale(0.97);
            }
            .tm-memo-btn-primary {
                background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
                color: #ffffff;
                box-shadow: 0 2px 4px rgba(79, 70, 229, 0.25);
            }
            .tm-memo-btn-primary:hover {
                background: linear-gradient(135deg, #4338ca 0%, #4f46e5 100%);
                box-shadow: 0 4px 10px rgba(79, 70, 229, 0.35);
            }
            .tm-memo-btn-primary:disabled {
                opacity: 0.65;
                cursor: not-allowed;
                transform: none;
            }
            .tm-memo-btn-secondary {
                background: #ffffff;
                color: var(--tm-text-muted);
                border-color: var(--tm-border-color);
            }
            .tm-memo-btn-secondary:hover {
                background: #f1f5f9;
                color: var(--tm-text-main);
            }
            .tm-memo-btn-danger {
                background: transparent;
                color: #ef4444;
                padding: 8px 12px;
            }
            .tm-memo-btn-danger:hover {
                background: #fef2f2;
                color: #dc2626;
            }
            .tm-memo-hotkey-badge {
                font-size: 10px;
                opacity: 0.85;
                background: rgba(255, 255, 255, 0.22);
                padding: 1px 5px;
                border-radius: 4px;
                margin-left: 2px;
            }

            /* 打开网页时的轻量提醒浮窗 Toast */
            .tm-memo-toast {
                position: fixed;
                bottom: 96px;
                right: 32px;
                width: 340px;
                background: rgba(255, 255, 255, 0.98);
                backdrop-filter: blur(14px);
                border-radius: 14px;
                box-shadow: 0 18px 36px -4px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(15, 23, 42, 0.08);
                border-left: 4px solid var(--tm-primary);
                padding: 15px 18px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                transform: translateX(120%);
                opacity: 0;
                transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
                z-index: 2147483639;
                pointer-events: none;
            }
            .tm-memo-toast.show {
                transform: translateX(0);
                opacity: 1;
                pointer-events: auto;
            }
            .tm-memo-toast-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-weight: 700;
                font-size: 13px;
                color: var(--tm-text-main);
            }
            .tm-memo-toast-title {
                display: flex;
                align-items: center;
                gap: 6px;
                color: var(--tm-primary);
            }
            .tm-memo-toast-body {
                font-size: 12.5px;
                color: #334155;
                line-height: 1.6;
                max-height: 80px;
                overflow-y: auto;
                background: #f8fafc;
                padding: 8px 10px;
                border-radius: 8px;
                white-space: pre-wrap;
                word-break: break-word;
            }
            .tm-memo-toast-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            }
            .tm-memo-toast-btn {
                padding: 5px 12px;
                font-size: 11.5px;
                font-weight: 500;
                border-radius: 6px;
                border: 1px solid var(--tm-border-color);
                background: #ffffff;
                color: var(--tm-text-muted);
                cursor: pointer;
                transition: all 0.15s;
            }
            .tm-memo-toast-btn:hover {
                background: #f1f5f9;
                color: var(--tm-text-main);
            }
            .tm-memo-toast-btn-primary {
                background: var(--tm-primary);
                color: #ffffff;
                border-color: var(--tm-primary);
            }
            .tm-memo-toast-btn-primary:hover {
                background: var(--tm-primary-hover);
                color: #ffffff;
            }

            /* 设置对话框 Modal */
            .tm-memo-modal-mask {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(15, 23, 42, 0.45);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2147483647;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
            }
            .tm-memo-modal-mask.active {
                opacity: 1;
                pointer-events: auto;
            }
            .tm-memo-modal {
                width: 480px;
                max-width: 92vw;
                background: #ffffff;
                border-radius: var(--tm-radius-lg);
                box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.3), 0 0 0 1px rgba(15, 23, 42, 0.08);
                overflow: hidden;
                transform: scale(0.96);
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .tm-memo-modal-mask.active .tm-memo-modal {
                transform: scale(1);
            }
            .tm-memo-modal-header {
                padding: 18px 24px;
                background: var(--tm-bg-subtle);
                border-bottom: 1px solid var(--tm-border-color);
                font-weight: 700;
                font-size: 15px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .tm-memo-modal-body {
                padding: 22px 24px;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .tm-memo-tip-box {
                background: var(--tm-primary-light);
                border: 1px solid var(--tm-primary-border);
                border-radius: var(--tm-radius-md);
                padding: 12px 14px;
                font-size: 12px;
                color: #3730a3;
                line-height: 1.55;
                display: flex;
                align-items: flex-start;
                gap: 8px;
            }
            .tm-memo-toggle-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 4px 0;
            }
            .tm-memo-toggle-switch {
                position: relative;
                display: inline-block;
                width: 42px;
                height: 24px;
            }
            .tm-memo-toggle-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .tm-memo-toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0; left: 0; right: 0; bottom: 0;
                background-color: #cbd5e1;
                transition: .25s;
                border-radius: 24px;
            }
            .tm-memo-toggle-slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .25s;
                border-radius: 50%;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            }
            .tm-memo-toggle-switch input:checked + .tm-memo-toggle-slider {
                background-color: var(--tm-primary);
            }
            .tm-memo-toggle-switch input:checked + .tm-memo-toggle-slider:before {
                transform: translateX(18px);
            }
        `;
        GM_addStyle(css);
    }

    // =========================================================================
    // 🧱 【DOM 结构构建与状态管理】
    // =========================================================================

    let currentMemoData = null;
    let isPanelOpen = false;
    let currentMode = 'view'; // 'view' (可点击链接) | 'edit' (输入编辑)
    let toastTimer = null;
    let deleteConfirmTimer = null;

    function buildUI() {
        const root = document.createElement('div');
        root.id = 'tm-memo-root';

        // 1. 悬浮按钮 (FAB)
        const fab = document.createElement('div');
        fab.className = 'tm-memo-fab';
        fab.id = 'tm-memo-fab';
        fab.title = '网页备忘录 (点击打开)';
        fab.innerHTML = `
            <span class="tm-memo-fab-icon">${ICONS.memo}</span>
            <span class="tm-memo-badge" id="tm-memo-badge"></span>
        `;
        root.appendChild(fab);

        // 2. 备忘录主面板 (Panel)
        const panel = document.createElement('div');
        panel.className = 'tm-memo-panel';
        panel.id = 'tm-memo-panel';
        panel.innerHTML = `
            <div class="tm-memo-header">
                <div class="tm-memo-title-area">
                    <div class="tm-memo-brand-icon">${ICONS.memo}</div>
                    <div class="tm-memo-heading">网页备忘录</div>
                    <span class="tm-memo-status-pill" id="tm-memo-status-pill">就绪</span>
                </div>
                <div class="tm-memo-header-actions">
                    <button class="tm-memo-icon-btn" id="tm-memo-btn-refresh" title="从 Google Sheet 重新同步">${ICONS.sync}</button>
                    <button class="tm-memo-icon-btn" id="tm-memo-btn-sheet-link" title="在 Google Sheet 中打开表格">${ICONS.link}</button>
                    <button class="tm-memo-icon-btn" id="tm-memo-btn-settings" title="配置同步参数">${ICONS.settings}</button>
                    <button class="tm-memo-icon-btn" id="tm-memo-btn-close" title="关闭面板">${ICONS.close}</button>
                </div>
            </div>
            <div class="tm-memo-body">
                <div class="tm-memo-url-card">
                    <span class="tm-memo-domain-badge">${CURRENT_DOMAIN || '页面'}</span>
                    <span class="tm-memo-url-text" id="tm-memo-url-display" title="${CURRENT_URL}">${CURRENT_URL}</span>
                    <button class="tm-memo-copy-btn" id="tm-memo-btn-copy-url">
                        ${ICONS.copy}
                        <span id="tm-memo-copy-text">复制</span>
                    </button>
                </div>
                <div class="tm-memo-form-group">
                    <div class="tm-memo-form-label-row">
                        <label class="tm-memo-label">页面标题</label>
                    </div>
                    <input type="text" class="tm-memo-input" id="tm-memo-input-title" placeholder="页面标题" />
                </div>
                <div class="tm-memo-form-group">
                    <div class="tm-memo-form-label-row">
                        <label class="tm-memo-label">备忘日志内容</label>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span class="tm-memo-char-count" id="tm-memo-char-count">0 字</span>
                            <div class="tm-memo-mode-switcher">
                                <button type="button" class="tm-memo-mode-btn active" id="tm-memo-btn-view-mode">${ICONS.eye} 链接直达</button>
                                <button type="button" class="tm-memo-mode-btn" id="tm-memo-btn-edit-mode">${ICONS.edit} 编辑</button>
                            </div>
                        </div>
                    </div>

                    <!-- 1. 阅读/链接跳转模式 -->
                    <div class="tm-memo-view-box" id="tm-memo-view-box"></div>

                    <!-- 2. 编辑输入模式 -->
                    <textarea class="tm-memo-textarea" id="tm-memo-input-content" style="display:none;" placeholder="输入要记录的日志内容... 支持输入 URL 链接，切换到阅读模式即可直接点击跳转 (快捷键 ${HOTKEY_LABEL} 保存)"></textarea>
                </div>
                <div class="tm-memo-meta-info" id="tm-memo-meta-info">
                    <span id="tm-memo-created-at"></span>
                    <span id="tm-memo-updated-at"></span>
                </div>
            </div>
            <div class="tm-memo-footer">
                <button class="tm-memo-btn tm-memo-btn-danger" id="tm-memo-btn-delete" style="display: none;">${ICONS.trash} <span>删除</span></button>
                <div style="flex: 1;"></div>
                <div class="tm-memo-btn-group">
                    <button class="tm-memo-btn tm-memo-btn-secondary" id="tm-memo-btn-cancel">关闭</button>
                    <button class="tm-memo-btn tm-memo-btn-primary" id="tm-memo-btn-save">
                        ${ICONS.save}
                        <span>保存同步</span>
                        <span class="tm-memo-hotkey-badge">${HOTKEY_LABEL}</span>
                    </button>
                </div>
            </div>
        `;
        root.appendChild(panel);

        // 3. 打开页面提醒浮窗 Toast
        const toast = document.createElement('div');
        toast.className = 'tm-memo-toast';
        toast.id = 'tm-memo-toast';
        toast.innerHTML = `
            <div class="tm-memo-toast-header">
                <div class="tm-memo-toast-title">
                    ${ICONS.lightbulb}
                    <span>网页备忘录提醒</span>
                </div>
                <button class="tm-memo-icon-btn" id="tm-memo-toast-close" style="width:24px;height:24px;">${ICONS.close}</button>
            </div>
            <div class="tm-memo-toast-body" id="tm-memo-toast-content"></div>
            <div class="tm-memo-toast-actions">
                <button class="tm-memo-toast-btn" id="tm-memo-toast-dismiss">忽略</button>
                <button class="tm-memo-toast-btn tm-memo-toast-btn-primary" id="tm-memo-toast-view">查看详情</button>
            </div>
        `;
        root.appendChild(toast);

        // 4. 配置对话框 Modal
        const modalMask = document.createElement('div');
        modalMask.className = 'tm-memo-modal-mask';
        modalMask.id = 'tm-memo-modal-mask';
        modalMask.innerHTML = `
            <div class="tm-memo-modal">
                <div class="tm-memo-modal-header">
                    <div style="display:flex;align-items:center;gap:8px;">
                        ${ICONS.settings}
                        <span>Google Sheet 同步配置</span>
                    </div>
                    <button class="tm-memo-icon-btn" id="tm-memo-modal-close">${ICONS.close}</button>
                </div>
                <div class="tm-memo-modal-body">
                    <div class="tm-memo-tip-box">
                        ${ICONS.lightbulb}
                        <span>配置将保存在油猴本地存储中。备忘录将自动与你的专属 Google 表格实时双向同步。</span>
                    </div>
                    <div class="tm-memo-form-group">
                        <label class="tm-memo-label">Google Apps Script Web 应用 URL</label>
                        <input type="text" class="tm-memo-input" id="tm-memo-cfg-script-url" placeholder="https://script.google.com/macros/s/.../exec" />
                    </div>
                    <div class="tm-memo-form-group">
                        <label class="tm-memo-label">Google Sheet 表格 ID</label>
                        <input type="text" class="tm-memo-input" id="tm-memo-cfg-sheet-id" placeholder="例如 17LfjALyCqRLHCC1hlyB2aww1Rq1My-4nY0pZIrtOuF4" />
                    </div>
                    <div class="tm-memo-toggle-row">
                        <label class="tm-memo-label" style="font-size:12px;color:var(--tm-text-main);">打开带备忘录的网页时自动弹窗提醒</label>
                        <label class="tm-memo-toggle-switch">
                            <input type="checkbox" id="tm-memo-cfg-auto-notify" />
                            <span class="tm-memo-toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="tm-memo-footer">
                    <button class="tm-memo-btn tm-memo-btn-secondary" id="tm-memo-btn-test-conn">${ICONS.sync} 测试连接</button>
                    <div style="flex:1;"></div>
                    <div class="tm-memo-btn-group">
                        <button class="tm-memo-btn tm-memo-btn-secondary" id="tm-memo-modal-cancel">取消</button>
                        <button class="tm-memo-btn tm-memo-btn-primary" id="tm-memo-modal-save">${ICONS.check} 保存配置</button>
                    </div>
                </div>
            </div>
        `;
        root.appendChild(modalMask);

        document.body.appendChild(root);

        bindEvents();
    }

    // =========================================================================
    // 🕹️ 【事件绑定与交互逻辑】
    // =========================================================================
    function bindEvents() {
        const fab = document.getElementById('tm-memo-fab');
        const btnClose = document.getElementById('tm-memo-btn-close');
        const btnCancel = document.getElementById('tm-memo-btn-cancel');
        const btnSave = document.getElementById('tm-memo-btn-save');
        const btnDelete = document.getElementById('tm-memo-btn-delete');
        const btnRefresh = document.getElementById('tm-memo-btn-refresh');
        const btnSheetLink = document.getElementById('tm-memo-btn-sheet-link');
        const btnSettings = document.getElementById('tm-memo-btn-settings');
        const btnCopyUrl = document.getElementById('tm-memo-btn-copy-url');
        const copyText = document.getElementById('tm-memo-copy-text');
        const inputContent = document.getElementById('tm-memo-input-content');
        const charCount = document.getElementById('tm-memo-char-count');
        const btnViewMode = document.getElementById('tm-memo-btn-view-mode');
        const btnEditMode = document.getElementById('tm-memo-btn-edit-mode');
        const viewBox = document.getElementById('tm-memo-view-box');

        // Toast 按钮
        const toastClose = document.getElementById('tm-memo-toast-close');
        const toastDismiss = document.getElementById('tm-memo-toast-dismiss');
        const toastView = document.getElementById('tm-memo-toast-view');

        // Modal 按钮
        const modalMask = document.getElementById('tm-memo-modal-mask');
        const modalClose = document.getElementById('tm-memo-modal-close');
        const modalCancel = document.getElementById('tm-memo-modal-cancel');
        const modalSave = document.getElementById('tm-memo-modal-save');
        const btnTestConn = document.getElementById('tm-memo-btn-test-conn');

        // 切换面板
        fab.addEventListener('click', () => togglePanel());
        btnClose.addEventListener('click', () => closePanel());
        btnCancel.addEventListener('click', () => closePanel());

        // 复制网址
        btnCopyUrl.addEventListener('click', () => {
            GM_setClipboard(CURRENT_URL);
            copyText.textContent = "已复制";
            setTimeout(() => { copyText.textContent = "复制"; }, 1500);
        });

        // 打开外部表格
        btnSheetLink.addEventListener('click', () => {
            const config = getConfig();
            if (config.SHEET_ID && !config.SHEET_ID.includes("YOUR_GOOGLE_SHEET_ID")) {
                window.open(`https://docs.google.com/spreadsheets/d/${config.SHEET_ID}/edit`, '_blank');
            } else {
                alert("尚未配置 Google Sheet ID，请在设置中填入。");
            }
        });

        // 模式切换
        btnViewMode.addEventListener('click', () => setMode('view'));
        btnEditMode.addEventListener('click', () => setMode('edit'));

        // 字符统计与快捷键
        inputContent.addEventListener('input', () => {
            charCount.textContent = `${inputContent.value.length} 字`;
            viewBox.innerHTML = linkifyText(inputContent.value);
        });
        inputContent.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSave();
            }
        });

        // 保存备忘录
        btnSave.addEventListener('click', handleSave);

        // 删除备忘录 (二次确认机制)
        btnDelete.addEventListener('click', handleDelete);

        // 刷新同步
        btnRefresh.addEventListener('click', handleRefresh);

        // 设置
        btnSettings.addEventListener('click', openSettingsModal);
        modalClose.addEventListener('click', closeSettingsModal);
        modalCancel.addEventListener('click', closeSettingsModal);
        modalSave.addEventListener('click', saveSettingsModal);
        btnTestConn.addEventListener('click', handleTestConnection);

        // Toast 交互
        const hideToast = () => {
            const toast = document.getElementById('tm-memo-toast');
            if (toast) toast.classList.remove('show');
            if (toastTimer) clearTimeout(toastTimer);
        };
        toastClose.addEventListener('click', hideToast);
        toastDismiss.addEventListener('click', hideToast);
        toastView.addEventListener('click', () => {
            hideToast();
            openPanel();
        });
    }

    // =========================================================================
    // 💡 【界面模式与状态更新】
    // =========================================================================

    function setMode(mode) {
        currentMode = mode;
        const btnViewMode = document.getElementById('tm-memo-btn-view-mode');
        const btnEditMode = document.getElementById('tm-memo-btn-edit-mode');
        const viewBox = document.getElementById('tm-memo-view-box');
        const textarea = document.getElementById('tm-memo-input-content');

        if (mode === 'view') {
            btnViewMode.classList.add('active');
            btnEditMode.classList.remove('active');
            viewBox.style.display = 'block';
            textarea.style.display = 'none';
            viewBox.innerHTML = linkifyText(textarea.value);
        } else {
            btnEditMode.classList.add('active');
            btnViewMode.classList.remove('active');
            viewBox.style.display = 'none';
            textarea.style.display = 'block';
            textarea.focus();
        }
    }

    function updateFabBadge(hasMemo) {
        const fab = document.getElementById('tm-memo-fab');
        if (!fab) return;
        if (hasMemo) {
            fab.classList.add('has-memo');
            fab.title = '📝 当前网页有备忘录 (点击查看/编辑)';
        } else {
            fab.classList.remove('has-memo');
            fab.title = '📝 网页备忘录 (点击添加)';
        }
    }

    function updateStatusPill(text, type = "default") {
        const pill = document.getElementById('tm-memo-status-pill');
        if (!pill) return;
        let iconHtml = '';
        if (type === 'synced') iconHtml = ICONS.cloudCheck;
        else if (type === 'syncing') iconHtml = ICONS.spinner;

        pill.innerHTML = `${iconHtml} <span>${text}</span>`;
        pill.className = 'tm-memo-status-pill ' + type;
    }

    function populateForm(data) {
        const inputTitle = document.getElementById('tm-memo-input-title');
        const inputContent = document.getElementById('tm-memo-input-content');
        const viewBox = document.getElementById('tm-memo-view-box');
        const btnDelete = document.getElementById('tm-memo-btn-delete');
        const createdAtSpan = document.getElementById('tm-memo-created-at');
        const updatedAtSpan = document.getElementById('tm-memo-updated-at');
        const charCount = document.getElementById('tm-memo-char-count');

        if (data && (data.memo || data.title)) {
            inputTitle.value = data.title || document.title;
            inputContent.value = data.memo || "";
            viewBox.innerHTML = linkifyText(data.memo || "");
            btnDelete.style.display = 'inline-flex';
            createdAtSpan.textContent = data.createdAt ? `创建: ${data.createdAt}` : "";
            updatedAtSpan.textContent = data.updatedAt ? `更新: ${data.updatedAt}` : "";
            charCount.textContent = `${(data.memo || "").length} 字`;
            updateStatusPill("已同步", "synced");

            // 有备忘录时，默认打开为【链接直达阅读模式】
            setMode('view');
        } else {
            inputTitle.value = document.title;
            inputContent.value = "";
            viewBox.innerHTML = linkifyText("");
            btnDelete.style.display = 'none';
            createdAtSpan.textContent = "";
            updatedAtSpan.textContent = "";
            charCount.textContent = "0 字";
            updateStatusPill("新建备忘", "default");

            // 无备忘录时，默认打开为【编辑模式】方便直接输入
            setMode('edit');
        }
    }

    function openPanel() {
        const panel = document.getElementById('tm-memo-panel');
        if (!panel) return;
        panel.classList.add('active');
        isPanelOpen = true;

        populateForm(currentMemoData);
    }

    function closePanel() {
        const panel = document.getElementById('tm-memo-panel');
        if (!panel) return;
        panel.classList.remove('active');
        isPanelOpen = false;
        resetDeleteButton();
    }

    function togglePanel() {
        if (isPanelOpen) {
            closePanel();
        } else {
            openPanel();
        }
    }

    function showToast(content) {
        const config = getConfig();
        if (!config.AUTO_NOTIFY_ON_LOAD) return;

        const toast = document.getElementById('tm-memo-toast');
        const toastContent = document.getElementById('tm-memo-toast-content');
        if (!toast || !toastContent) return;

        // Toast 里的链接也自动转为可直接点击
        toastContent.innerHTML = linkifyText(content);
        toast.classList.add('show');

        if (toastTimer) clearTimeout(toastTimer);
        const duration = parseInt(config.AUTO_NOTIFY_DURATION, 10);
        if (duration > 0) {
            toastTimer = setTimeout(() => {
                toast.classList.remove('show');
            }, duration * 1000);
        }
    }

    function resetDeleteButton() {
        const btnDelete = document.getElementById('tm-memo-btn-delete');
        if (btnDelete) {
            btnDelete.innerHTML = `${ICONS.trash} <span>删除</span>`;
            btnDelete.setAttribute('data-confirming', '0');
        }
        if (deleteConfirmTimer) clearTimeout(deleteConfirmTimer);
    }

    // =========================================================================
    // 💾 【保存 / 删除 / 同步 操作】
    // =========================================================================

    function handleSave() {
        const inputTitle = document.getElementById('tm-memo-input-title');
        const inputContent = document.getElementById('tm-memo-input-content');
        const btnSave = document.getElementById('tm-memo-btn-save');

        const memoText = inputContent.value.trim();
        const titleText = inputTitle.value.trim() || document.title;

        if (!memoText) {
            alert("请输入备忘录内容后再保存。");
            setMode('edit');
            inputContent.focus();
            return;
        }

        const now = new Date();
        const pad = (n) => (n < 10 ? "0" + n : n);
        const nowStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        const memoData = {
            url: CURRENT_URL,
            title: titleText,
            memo: memoText,
            tags: "",
            createdAt: (currentMemoData && currentMemoData.createdAt) ? currentMemoData.createdAt : nowStr,
            updatedAt: nowStr
        };

        // 1. 本地缓存秒级响应
        setLocalMemo(memoData);
        currentMemoData = memoData;
        updateFabBadge(true);
        updateStatusPill("同步中...", "syncing");
        btnSave.disabled = true;
        btnSave.innerHTML = `${ICONS.spinner} <span>正在同步...</span>`;

        // 切换回链接直达视图
        setMode('view');

        // 2. 异步同步 Google Sheet
        saveCloudMemo(memoData, (res) => {
            btnSave.disabled = false;
            btnSave.innerHTML = `${ICONS.save} <span>保存同步</span> <span class="tm-memo-hotkey-badge">${HOTKEY_LABEL}</span>`;

            if (res.status === "success") {
                updateStatusPill("已同步", "synced");
                if (res.data) {
                    currentMemoData = res.data;
                    setLocalMemo(res.data);
                    populateForm(res.data);
                }
            } else if (res.status === "unconfigured") {
                updateStatusPill("本地已保存", "local");
            } else {
                updateStatusPill("同步失败", "error");
                alert("云端同步失败: " + res.message);
            }
        });
    }

    function handleDelete() {
        const btnDelete = document.getElementById('tm-memo-btn-delete');
        const isConfirming = btnDelete.getAttribute('data-confirming') === '1';

        if (!isConfirming) {
            btnDelete.innerHTML = `${ICONS.trash} <span>确认删除?</span>`;
            btnDelete.setAttribute('data-confirming', '1');
            deleteConfirmTimer = setTimeout(() => {
                resetDeleteButton();
            }, 3500);
            return;
        }

        resetDeleteButton();
        updateStatusPill("正在删除...", "syncing");
        btnDelete.disabled = true;

        // 1. 清除本地
        setLocalMemo(null);
        currentMemoData = null;
        updateFabBadge(false);

        // 2. 清除云端
        deleteCloudMemo(CURRENT_URL, (res) => {
            btnDelete.disabled = false;
            closePanel();
            if (res.status === "success") {
                // 成功删除
            } else if (res.status === "unconfigured") {
                // 未配置
            } else {
                alert("本地已删除，但云端删除失败: " + res.message);
            }
        });
    }

    function handleRefresh() {
        const btnRefresh = document.getElementById('tm-memo-btn-refresh');
        btnRefresh.innerHTML = ICONS.spinner;
        updateStatusPill("同步中...", "syncing");

        fetchCloudMemo(CURRENT_URL, (res) => {
            btnRefresh.innerHTML = ICONS.sync;
            if (res.status === "success") {
                if (res.data && res.data.memo) {
                    currentMemoData = res.data;
                    setLocalMemo(res.data);
                    updateFabBadge(true);
                    populateForm(res.data);
                    updateStatusPill("已同步", "synced");
                } else {
                    currentMemoData = null;
                    setLocalMemo(null);
                    updateFabBadge(false);
                    populateForm(null);
                    updateStatusPill("无云端记录", "default");
                }
            } else if (res.status === "unconfigured") {
                updateStatusPill("未配置云端", "local");
            } else {
                updateStatusPill("拉取失败", "error");
            }
        });
    }

    // =========================================================================
    // ⚙️ 【设置与连接测试逻辑】
    // =========================================================================

    function openSettingsModal() {
        const modalMask = document.getElementById('tm-memo-modal-mask');
        const scriptInput = document.getElementById('tm-memo-cfg-script-url');
        const sheetInput = document.getElementById('tm-memo-cfg-sheet-id');
        const autoNotifyInput = document.getElementById('tm-memo-cfg-auto-notify');

        const cfg = getConfig();
        scriptInput.value = cfg.SCRIPT_URL;
        sheetInput.value = cfg.SHEET_ID;
        autoNotifyInput.checked = cfg.AUTO_NOTIFY_ON_LOAD;

        modalMask.classList.add('active');
    }

    function closeSettingsModal() {
        const modalMask = document.getElementById('tm-memo-modal-mask');
        modalMask.classList.remove('active');
    }

    function saveSettingsModal() {
        const scriptInput = document.getElementById('tm-memo-cfg-script-url');
        const sheetInput = document.getElementById('tm-memo-cfg-sheet-id');
        const autoNotifyInput = document.getElementById('tm-memo-cfg-auto-notify');

        const newScriptUrl = scriptInput.value.trim();
        const newSheetId = sheetInput.value.trim();
        const newAutoNotify = autoNotifyInput.checked;

        GM_setValue("memo_script_url", newScriptUrl);
        GM_setValue("memo_sheet_id", newSheetId);
        GM_setValue("memo_auto_notify", newAutoNotify);

        closeSettingsModal();
        handleRefresh();
    }

    function handleTestConnection() {
        const scriptInput = document.getElementById('tm-memo-cfg-script-url');
        const sheetInput = document.getElementById('tm-memo-cfg-sheet-id');
        const btnTest = document.getElementById('tm-memo-btn-test-conn');

        const scriptUrl = scriptInput.value.trim();
        const sheetId = sheetInput.value.trim();

        if (!scriptUrl || !sheetId) {
            alert("请先完整填写 Web 应用 URL 和 Sheet ID 后再测试。");
            return;
        }

        btnTest.disabled = true;
        btnTest.innerHTML = `${ICONS.spinner} 测试中...`;

        const testUrl = `${scriptUrl}?action=get&sheetId=${encodeURIComponent(sheetId)}&url=__test__&_t=${Date.now()}`;

        GM_xmlhttpRequest({
            method: "GET",
            url: testUrl,
            headers: { "Accept": "application/json" },
            timeout: 15000,
            onload: function (response) {
                btnTest.disabled = false;
                btnTest.innerHTML = `${ICONS.sync} 测试连接`;
                try {
                    const result = JSON.parse(response.responseText);
                    if (result.status === "success") {
                        alert("🎉 连接成功！Google Sheet 通信正常。");
                    } else {
                        alert("❌ 连接返回异常: " + (result.message || "未知错误"));
                    }
                } catch (e) {
                    alert("❌ 无法解析返回数据，请检查 Web 应用部署权限是否设为【任何人】。\n错误: " + e.message);
                }
            },
            ontimeout: function () {
                btnTest.disabled = false;
                btnTest.innerHTML = `${ICONS.sync} 测试连接`;
                alert("❌ 连接超时，请检查网络或 URL 是否正确。");
            },
            onerror: function () {
                btnTest.disabled = false;
                btnTest.innerHTML = `${ICONS.sync} 测试连接`;
                alert("❌ 网络请求失败，请检查 URL 是否有效。");
            }
        });
    }

    // 油猴原生菜单注册
    if (typeof GM_registerMenuCommand !== "undefined") {
        GM_registerMenuCommand("📝 打开网页备忘录", () => openPanel());
        GM_registerMenuCommand("⚙️ 备忘录设置 (Google Sheet)", () => openSettingsModal());
    }

    // =========================================================================
    // 🚀 【初始化流程】
    // =========================================================================

    function init() {
        injectStyles();
        buildUI();

        // 1. 本地缓存秒级渲染
        const cached = getLocalMemo();
        if (cached && cached.memo) {
            currentMemoData = cached;
            updateFabBadge(true);
            showToast(cached.memo);
        } else {
            updateFabBadge(false);
        }

        // 2. 静默拉取云端数据
        if (isConfigValid()) {
            fetchCloudMemo(CURRENT_URL, (res) => {
                if (res.status === "success" && res.data && res.data.memo) {
                    currentMemoData = res.data;
                    setLocalMemo(res.data);
                    updateFabBadge(true);
                    if (isPanelOpen) {
                        populateForm(res.data);
                    } else if (!cached || cached.memo !== res.data.memo) {
                        showToast(res.data.memo);
                    }
                }
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
