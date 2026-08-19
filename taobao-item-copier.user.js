// ==UserScript==
// @name         淘宝商品信息一键复制助手
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  一键提取淘宝/天猫商品页面的链接、规格、价格、名称等信息，支持可视化拖拽排序字段与勾选导出项，并持久化记忆排序配置。
// @author       SHENZHEN_LEO
// @match        *://item.taobao.com/item.htm*
// @match        *://detail.tmall.com/item.htm*
// @match        *://detail.tmall.hk/item.htm*
// @match        *://chaoshi.detail.tmall.com/item.htm*
// @match        *://*.taobao.com/item.htm*
// @match        *://*.tmall.com/item.htm*
// @icon         https://www.taobao.com/favicon.ico
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    // ================= 1. 默认字段与 XPath 配置 =================
    const DEFAULT_FIELDS = [
        { id: 'url', name: '商品链接', enabled: true },
        { id: 'spec', name: '规格名称', enabled: true },
        { id: 'price', name: '优惠前原价', enabled: true },
        { id: 'title', name: '商品名称', enabled: false }
    ];

    const XPATH_CONFIG = {
        // 商品标题
        title: [
            '/html/body/div[1]/div[1]/div[1]/div[1]/div[2]/div[1]/div[2]/div[2]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[2]/div[1]/div[1]/div[1]/span[1]',
            '//div[contains(@class, "ItemHeader--mainTitle")]//span',
            '//h1[contains(@class, "mainTitle")]',
            '//h1[contains(@class, "tb-main-title")]',
            '//div[contains(@class, "tb-detail-hd")]//h1'
        ],
        // 优惠前原价
        originalPrice: [
            '/html/body/div[1]/div[1]/div[1]/div[1]/div[2]/div[1]/div[2]/div[2]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[3]/div[1]/div[1]/div[1]/div[2]/div[1]/span[3]',
            '//span[contains(@class, "Price--originPrice")]',
            '//div[contains(@class, "Price--priceWrap")]//span[contains(@class, "originPrice")]',
            '//div[contains(@class, "tb-property")]//span[contains(@class, "tb-rmb-num")]',
            '//span[contains(@class, "origin-price-wrap")]//span'
        ],
        // 备用规格 XPath
        spec: [
            '/html/body/div[1]/div[1]/div[1]/div[1]/div[2]/div[1]/div[2]/div[2]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[6]/div[1]/div[1]/div[1]/div[1]/div[2]/div[1]/div[1]/div[7]/span[1]'
        ]
    };

    // ================= 2. 字段配置与持久化存储 =================

    function getSavedFieldConfig() {
        try {
            const saved = GM_getValue('tb_field_config_v2', null);
            if (saved && Array.isArray(saved) && saved.length > 0) {
                const savedIds = saved.map(item => item.id);
                const merged = [...saved];
                DEFAULT_FIELDS.forEach(df => {
                    if (!savedIds.includes(df.id)) {
                        merged.push(df);
                    }
                });
                return merged;
            }
        } catch (e) {
            console.error('读取排序配置失败:', e);
        }
        return JSON.parse(JSON.stringify(DEFAULT_FIELDS));
    }

    function saveFieldConfig(config) {
        GM_setValue('tb_field_config_v2', config);
    }

    // ================= 3. 数据提取逻辑 =================

    function getElementByXPath(xpath) {
        try {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            return result.singleNodeValue;
        } catch (e) {
            return null;
        }
    }

    function getTextByXPathList(xpathList) {
        for (const xpath of xpathList) {
            const el = getElementByXPath(xpath);
            if (el) {
                const text = el.textContent ? el.textContent.trim() : '';
                if (text) return text;
            }
        }
        return '';
    }

    // 提取当前选中的规格
    function extractSelectedSpec() {
        const selectedElements = document.querySelectorAll('div[class*="valueItem"][class*="isSelected"], div[class*="isSelected--"]');
        if (selectedElements && selectedElements.length > 0) {
            const specList = [];
            selectedElements.forEach(item => {
                const textSpan = item.querySelector('span[class*="valueItemText"]') || item.querySelector('span');
                if (textSpan) {
                    const text = (textSpan.getAttribute('title') || textSpan.textContent || '').trim();
                    if (text && !specList.includes(text)) {
                        specList.push(text);
                    }
                }
            });
            if (specList.length > 0) {
                return specList.join(' ; ');
            }
        }

        const xpathSpec = getTextByXPathList(XPATH_CONFIG.spec);
        if (xpathSpec) return xpathSpec;

        const legacyItems = document.querySelectorAll('li.tb-selected a span, li.tb-selected span, .skuItem.selected span');
        if (legacyItems && legacyItems.length > 0) {
            const specList = [];
            legacyItems.forEach(item => {
                const text = (item.getAttribute('title') || item.textContent || '').trim();
                if (text && !specList.includes(text)) {
                    specList.push(text);
                }
            });
            if (specList.length > 0) return specList.join(' ; ');
        }

        return '未选定或未识别到规格';
    }

    // 提取商品标题/名称
    function extractTitle() {
        const titleEl = document.querySelector('h1[class*="mainTitle"], div[class*="ItemHeader--mainTitle"] span, h1.tb-main-title, div.tb-detail-hd h1');
        if (titleEl && titleEl.textContent.trim()) {
            return titleEl.textContent.trim();
        }
        const xpathTitle = getTextByXPathList(XPATH_CONFIG.title);
        if (xpathTitle) return xpathTitle;

        return document.title.replace(/-(淘宝网|天猫Tmall\.com|手机淘宝网).*/, '').trim() || '未获取到标题';
    }

    // 提取优惠前原价
    function extractOriginalPrice() {
        const priceEl = document.querySelector('span[class*="Price--originPrice"], span[class*="originPrice"], span.tb-rmb-num');
        if (priceEl && priceEl.textContent.trim()) {
            return priceEl.textContent.trim();
        }
        const xpathPrice = getTextByXPathList(XPATH_CONFIG.originalPrice);
        if (xpathPrice) return xpathPrice;

        return '未识别到原价';
    }

    // 获取并精简商品 URL
    function getCleanUrl() {
        try {
            const urlObj = new URL(window.location.href);
            const searchParams = urlObj.searchParams;
            const id = searchParams.get('id');
            const skuId = searchParams.get('skuId');

            if (id) {
                let clean = `${urlObj.origin}${urlObj.pathname}?id=${id}`;
                if (skuId) {
                    clean += `&skuId=${skuId}`;
                }
                return clean;
            }
        } catch (e) {}
        return window.location.href;
    }

    // 提取当前页面全部信息
    function extractProductInfo() {
        return {
            title: extractTitle(),
            spec: extractSelectedSpec(),
            price: extractOriginalPrice(),
            url: getCleanUrl()
        };
    }

    // ================= 4. UI 交互与反馈 =================

    function showToast(message) {
        const existing = document.getElementById('tb-copier-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'tb-copier-toast';
        toast.textContent = message;
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '90px',
            right: '25px',
            backgroundColor: 'rgba(0, 0, 0, 0.84)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 'bold',
            zIndex: '9999999',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            transition: 'opacity 0.25s ease, transform 0.25s ease',
            opacity: '0',
            transform: 'translateY(10px)',
            pointerEvents: 'none'
        });

        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 250);
        }, 1600);
    }

    function copyText(text, btnElement, successMsg = '已复制 ✓') {
        GM_setClipboard(text, 'text');
        showToast(successMsg);

        if (btnElement) {
            const originalBg = btnElement.style.backgroundColor;
            const originalText = btnElement.textContent;
            btnElement.textContent = '已复制 ✓';
            btnElement.style.backgroundColor = '#52c41a';

            setTimeout(() => {
                btnElement.textContent = originalText;
                btnElement.style.backgroundColor = originalBg;
            }, 1200);
        }
    }

    function debounce(fn, delay = 300) {
        let timer = null;
        return function (...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                fn.apply(this, args);
            }, delay);
        };
    }

    // ================= 5. 创建悬浮面板 UI =================

    function createFloatingPanel() {
        if (document.getElementById('tb-copier-container')) return;

        let fieldConfig = getSavedFieldConfig();

        const container = document.createElement('div');
        container.id = 'tb-copier-container';

        Object.assign(container.style, {
            position: 'fixed',
            bottom: '25px',
            right: '25px',
            width: '330px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            boxShadow: '0 8px 26px rgba(0, 0, 0, 0.16)',
            border: '1px solid #f0f0f0',
            zIndex: '999998',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
            overflow: 'hidden',
            transition: 'box-shadow 0.3s ease'
        });

        container.innerHTML = `
            <div id="tb-copier-header" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: linear-gradient(135deg, #ff5000 0%, #ff8400 100%); color: #fff; cursor: move; user-select: none;">
                <div style="font-weight: bold; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                    <span>🛍️ 淘宝信息提取器</span>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span id="tb-copier-settings-btn" title="自定义字段顺序与勾选" style="cursor: pointer; font-size: 14px;">⚙️</span>
                    <span id="tb-copier-refresh" title="刷新数据" style="cursor: pointer; font-size: 14px;">🔄</span>
                    <span id="tb-copier-toggle" title="收起/展开" style="cursor: pointer; font-size: 14px;">➖</span>
                </div>
            </div>

            <div id="tb-copier-body" style="padding: 12px 14px; font-size: 12px; color: #333;">
                
                <!-- 拖拽排序与勾选设置面板 (可折叠) -->
                <div id="tb-settings-panel" style="display: none; margin-bottom: 12px; padding: 10px; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 600; font-size: 12px; color: #495057;">⠿ 拖拽调整顺序 / 勾选导出</span>
                        <span id="tb-reset-order-btn" style="font-size: 11px; color: #ff5000; cursor: pointer;">恢复默认</span>
                    </div>
                    <div id="tb-drag-list" style="display: flex; flex-direction: column; gap: 5px;"></div>
                    <div style="font-size: 11px; color: #868e96; margin-top: 6px; text-align: center;">按住左侧 ⠿ 可上下拖拽调整顺序</div>
                </div>

                <!-- 当前排序序列预览 -->
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 10px; padding: 5px 8px; background: #fff7e6; border-radius: 6px; border: 1px solid #ffe58f; font-size: 11px; color: #d46b08;">
                    <span style="font-weight: 600; white-space: nowrap;">当前顺序:</span>
                    <span id="tb-order-preview-text" style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></span>
                </div>

                <!-- 数据预览区域 -->
                <div id="tb-data-preview-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
                    <div id="preview-row-url">
                        <div style="display: flex; justify-content: space-between; color: #8c8c8c; margin-bottom: 2px;">
                            <span>商品链接</span>
                            <span id="copy-url-btn-mini" style="color: #ff5000; cursor: pointer;">复制</span>
                        </div>
                        <div id="tb-preview-url" style="font-size: 11px; color: #1890ff; word-break: break-all; max-height: 32px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;" title="点击复制纯净链接">获取中...</div>
                    </div>

                    <div id="preview-row-spec">
                        <div style="display: flex; justify-content: space-between; color: #8c8c8c; margin-bottom: 2px;">
                            <span>规格名称</span>
                            <span id="copy-spec-btn" style="color: #ff5000; cursor: pointer;">复制</span>
                        </div>
                        <div id="tb-preview-spec" style="font-weight: 500; color: #ff5000; word-break: break-all;">获取中...</div>
                    </div>

                    <div id="preview-row-price">
                        <div style="display: flex; justify-content: space-between; color: #8c8c8c; margin-bottom: 2px;">
                            <span>优惠前原价</span>
                            <span id="copy-price-btn" style="color: #ff5000; cursor: pointer;">复制</span>
                        </div>
                        <div id="tb-preview-price" style="font-size: 14px; font-weight: bold; color: #ff0036;">获取中...</div>
                    </div>

                    <div id="preview-row-title">
                        <div style="display: flex; justify-content: space-between; color: #8c8c8c; margin-bottom: 2px;">
                            <span>商品名称</span>
                            <span id="copy-title-btn" style="color: #ff5000; cursor: pointer;">复制</span>
                        </div>
                        <div id="tb-preview-title" style="font-weight: 500; line-height: 1.4; max-height: 36px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">获取中...</div>
                    </div>
                </div>

                <!-- 复制操作按钮 -->
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <button id="tb-copy-tsv-btn" style="width: 100%; padding: 8px 0; background-color: #ff5000; color: #ffffff; border: none; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 6px rgba(255, 80, 0, 0.3); transition: background-color 0.2s;" title="以 Tab 分隔，可直接粘贴至 Excel / Google 表格">
                        📊 复制表格行 (自定义顺序)
                    </button>
                    <div style="display: flex; gap: 6px;">
                        <button id="tb-copy-all-btn" style="flex: 1; padding: 6px 0; background-color: #f5f5f5; color: #333; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 11px; cursor: pointer; transition: all 0.2s;">
                            📋 复制多行文本
                        </button>
                        <button id="tb-copy-url-btn" style="flex: 1; padding: 6px 0; background-color: #f5f5f5; color: #333; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 11px; cursor: pointer; transition: all 0.2s;">
                            🔗 复制纯净链接
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(container);

        // ================= 6. 元素引用与动态渲染 =================

        const urlEl = container.querySelector('#tb-preview-url');
        const specEl = container.querySelector('#tb-preview-spec');
        const priceEl = container.querySelector('#tb-preview-price');
        const titleEl = container.querySelector('#tb-preview-title');
        const bodyEl = container.querySelector('#tb-copier-body');
        const toggleBtn = container.querySelector('#tb-copier-toggle');
        const refreshBtn = container.querySelector('#tb-copier-refresh');
        const settingsBtn = container.querySelector('#tb-copier-settings-btn');
        const settingsPanel = container.querySelector('#tb-settings-panel');
        const dragListContainer = container.querySelector('#tb-drag-list');
        const orderPreviewText = container.querySelector('#tb-order-preview-text');
        const resetOrderBtn = container.querySelector('#tb-reset-order-btn');

        let currentData = { title: '', spec: '', price: '', url: '' };

        // 渲染顶部顺序预览标签
        function renderOrderPreview() {
            const enabledNames = fieldConfig.filter(f => f.enabled).map(f => f.name);
            if (enabledNames.length > 0) {
                orderPreviewText.textContent = enabledNames.join(' ➔ ');
            } else {
                orderPreviewText.textContent = '（未勾选任何字段）';
            }
        }

        // 渲染拖拽排序列表
        function renderDragList() {
            dragListContainer.innerHTML = '';

            fieldConfig.forEach((item, index) => {
                const row = document.createElement('div');
                row.className = 'tb-drag-row';
                row.setAttribute('draggable', 'true');
                row.dataset.index = index;

                Object.assign(row.style, {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #dee2e6',
                    borderRadius: '6px',
                    cursor: 'grab',
                    fontSize: '12px',
                    userSelect: 'none',
                    transition: 'transform 0.15s, background-color 0.15s, border-color 0.15s'
                });

                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="tb-drag-handle" style="cursor: grab; color: #adb5bd; font-size: 13px; font-weight: bold;">⠿</span>
                        <span style="font-weight: 500; color: #333;">${item.name}</span>
                    </div>
                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; margin: 0; font-size: 11px; color: ${item.enabled ? '#ff5000' : '#888'};">
                        <input type="checkbox" class="tb-field-checkbox" data-id="${item.id}" ${item.enabled ? 'checked' : ''} style="cursor: pointer; accent-color: #ff5000;">
                        <span>${item.enabled ? '已启用' : '已停用'}</span>
                    </label>
                `;

                // 勾选事件
                const checkbox = row.querySelector('.tb-field-checkbox');
                checkbox.addEventListener('change', (e) => {
                    const id = e.target.dataset.id;
                    const targetField = fieldConfig.find(f => f.id === id);
                    if (targetField) {
                        targetField.enabled = e.target.checked;
                        saveFieldConfig(fieldConfig);
                        renderOrderPreview();
                        renderDragList();
                    }
                });

                // 拖拽事件 (HTML5 Drag and Drop)
                row.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', index);
                    e.dataTransfer.effectAllowed = 'move';
                    row.style.opacity = '0.4';
                    row.style.borderColor = '#ff5000';
                });

                row.addEventListener('dragend', () => {
                    row.style.opacity = '1';
                    row.style.borderColor = '#dee2e6';
                    document.querySelectorAll('.tb-drag-row').forEach(r => {
                        r.style.borderTop = '1px solid #dee2e6';
                        r.style.borderBottom = '1px solid #dee2e6';
                    });
                });

                row.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    row.style.borderTop = '2px solid #ff5000';
                });

                row.addEventListener('dragleave', () => {
                    row.style.borderTop = '1px solid #dee2e6';
                });

                row.addEventListener('drop', (e) => {
                    e.preventDefault();
                    row.style.borderTop = '1px solid #dee2e6';
                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                    const toIndex = index;

                    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
                        const movedItem = fieldConfig.splice(fromIndex, 1)[0];
                        fieldConfig.splice(toIndex, 0, movedItem);

                        // 持久化存储用户排序
                        saveFieldConfig(fieldConfig);
                        renderDragList();
                        renderOrderPreview();
                        showToast(`已更新排序：${movedItem.name} ➔ 第 ${toIndex + 1} 位`);
                    }
                });

                dragListContainer.appendChild(row);
            });

            renderOrderPreview();
        }

        // 初始化渲染设置面板与顺序
        renderDragList();

        // 恢复默认设置
        resetOrderBtn.addEventListener('click', () => {
            fieldConfig = JSON.parse(JSON.stringify(DEFAULT_FIELDS));
            saveFieldConfig(fieldConfig);
            renderDragList();
            showToast('已恢复默认排序 (链接 ➔ 规格 ➔ 价格)');
        });

        // 打开/关闭设置面板
        let isSettingsOpen = false;
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isSettingsOpen = !isSettingsOpen;
            settingsPanel.style.display = isSettingsOpen ? 'block' : 'none';
            settingsBtn.style.color = isSettingsOpen ? '#ff5000' : '#fff';
        });

        function updateUI() {
            currentData = extractProductInfo();
            const formattedPrice = currentData.price ? (currentData.price.startsWith('¥') || currentData.price.startsWith('￥') ? currentData.price : `¥${currentData.price}`) : '未获取到原价';

            if (urlEl.textContent !== currentData.url) {
                urlEl.textContent = currentData.url || '';
                urlEl.title = currentData.url || '';
            }
            if (specEl.textContent !== currentData.spec) {
                specEl.textContent = currentData.spec || '未选定或未识别到规格';
            }
            if (priceEl.textContent !== formattedPrice) {
                priceEl.textContent = formattedPrice;
            }
            if (titleEl.textContent !== currentData.title) {
                titleEl.textContent = currentData.title || '未获取到标题';
                titleEl.title = currentData.title || '';
            }
        }

        // 初始更新
        updateUI();

        // 页面初始化时轮询（最多 8 次，每次 800ms）
        let retryCount = 0;
        const initTimer = setInterval(() => {
            retryCount++;
            updateUI();
            if (retryCount >= 8 || (currentData.title !== '未获取到标题' && currentData.spec !== '未选定或未识别到规格' && currentData.price !== '未识别到原价')) {
                clearInterval(initTimer);
            }
        }, 800);

        // 刷新按钮
        refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            updateUI();
            showToast('已刷新页面数据');
        });

        // 展开 / 收起
        let isCollapsed = false;
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isCollapsed = !isCollapsed;
            if (isCollapsed) {
                bodyEl.style.display = 'none';
                toggleBtn.textContent = '➕';
                container.style.width = '180px';
            } else {
                bodyEl.style.display = 'block';
                toggleBtn.textContent = '➖';
                container.style.width = '330px';
            }
        });

        // 📊 复制为 TSV 表格格式（按照用户自定义排序和勾选）
        container.querySelector('#tb-copy-tsv-btn').addEventListener('click', function () {
            const data = extractProductInfo();
            const cleanPrice = data.price.replace(/^[¥￥]\s*/, '').trim();

            const fieldValueMap = {
                url: data.url,
                spec: data.spec,
                price: cleanPrice,
                title: data.title
            };

            const activeFields = fieldConfig.filter(f => f.enabled);
            if (activeFields.length === 0) {
                showToast('⚠️ 未勾选任何导出字段，请在设置中勾选');
                return;
            }

            const rowValues = activeFields.map(f => fieldValueMap[f.id] || '');
            const tsvRow = rowValues.join('\t');
            copyText(tsvRow, this, `✅ 已按顺序复制 ${activeFields.length} 列数据！`);
        });

        // 📋 复制多行文本（按照用户自定义排序和勾选）
        container.querySelector('#tb-copy-all-btn').addEventListener('click', function () {
            const data = extractProductInfo();
            const fieldLabelValueMap = {
                url: `商品链接：${data.url}`,
                spec: `规格名称：${data.spec}`,
                price: `优惠前原价：${data.price}`,
                title: `商品名称：${data.title}`
            };

            const activeFields = fieldConfig.filter(f => f.enabled);
            if (activeFields.length === 0) {
                showToast('⚠️ 未勾选任何导出字段，请在设置中勾选');
                return;
            }

            const lines = activeFields.map(f => fieldLabelValueMap[f.id]);
            copyText(lines.join('\n'), this, '✅ 多行文本已复制！');
        });

        // 🔗 复制纯净链接
        container.querySelector('#tb-copy-url-btn').addEventListener('click', function () {
            const data = extractProductInfo();
            copyText(data.url, this, '✅ 纯净链接已复制！');
        });
        container.querySelector('#copy-url-btn-mini').addEventListener('click', () => {
            const data = extractProductInfo();
            copyText(data.url, null, '链接已复制');
        });

        // 单项复制
        container.querySelector('#copy-spec-btn').addEventListener('click', () => {
            const data = extractProductInfo();
            copyText(data.spec, null, '规格已复制');
        });
        container.querySelector('#copy-price-btn').addEventListener('click', () => {
            const data = extractProductInfo();
            copyText(data.price, null, '原价已复制');
        });
        container.querySelector('#copy-title-btn').addEventListener('click', () => {
            const data = extractProductInfo();
            copyText(data.title, null, '商品名称已复制');
        });

        // ================= 7. 支持拖拽悬浮窗位置 =================
        const header = container.querySelector('#tb-copier-header');
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('#tb-copier-toggle') || e.target.closest('#tb-copier-refresh') || e.target.closest('#tb-copier-settings-btn')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = container.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            container.style.bottom = 'auto';
            container.style.right = 'auto';
            container.style.left = `${initialLeft}px`;
            container.style.top = `${initialTop}px`;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            container.style.left = `${initialLeft + dx}px`;
            container.style.top = `${initialTop + dy}px`;
        }

        function onMouseUp() {
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }

        // ================= 8. 用户点击页面切换规格时防抖更新 =================
        const debouncedUpdate = debounce(updateUI, 300);
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                debouncedUpdate();
            }
        });
    }

    // 页面加载完成后注入面板
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(createFloatingPanel, 800);
        });
    } else {
        setTimeout(createFloatingPanel, 800);
    }
})();
