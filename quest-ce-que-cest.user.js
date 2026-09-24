// ==UserScript==
// @name         Qu'est-ce que c'est ?
// @namespace    https://github.com/tampermonkey-scripts
// @version      1.0.0
// @description  Mini DevTools : maintenez Alt et survolez un élément pour l'inspecter.
// @author       Tim257
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const ACTIVATION_KEY = 'Alt';
    const PANEL_ID = '__quest_ce_que_c_est_panel__';
    const STYLE_ID = '__quest_ce_que_c_est_style__';
    const state = {
        active: false,
        hoveredElement: null,
        panel: null,
        highlight: null
    };

    const trackedEvents = new WeakMap();
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

    EventTarget.prototype.addEventListener = function (type, listener, options) {
        if (this instanceof Element && typeof type === 'string') {
            let events = trackedEvents.get(this);
            if (!events) {
                events = new Map();
                trackedEvents.set(this, events);
            }
            events.set(type, (events.get(type) || 0) + 1);
        }
        return originalAddEventListener.call(this, type, listener, options);
    };

    EventTarget.prototype.removeEventListener = function (type, listener, options) {
        if (this instanceof Element && typeof type === 'string') {
            const events = trackedEvents.get(this);
            const count = events && events.get(type);
            if (count === 1) {
                events.delete(type);
            } else if (count > 1) {
                events.set(type, count - 1);
            }
        }
        return originalRemoveEventListener.call(this, type, listener, options);
    };

    const escapeHtml = (value) => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const valueOrEmpty = (value) => value ? escapeHtml(value) : '<span class="qcc-muted">Aucun</span>';

    function installStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${PANEL_ID} {
                all: initial;
                box-sizing: border-box;
                position: fixed;
                z-index: 2147483647;
                top: 16px;
                right: 16px;
                width: min(360px, calc(100vw - 32px));
                max-height: calc(100vh - 32px);
                overflow: auto;
                padding: 16px;
                border: 1px solid rgba(255,255,255,.14);
                border-radius: 12px;
                background: #15171c;
                color: #f4f5f7;
                box-shadow: 0 16px 50px rgba(0,0,0,.38);
                font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                pointer-events: none;
            }
            #${PANEL_ID}[hidden] { display: none; }
            #${PANEL_ID} * { box-sizing: border-box; font: inherit; }
            #${PANEL_ID} .qcc-title {
                display: flex; justify-content: space-between; gap: 12px;
                margin-bottom: 12px; color: #8ee6c5; font-size: 14px; font-weight: 700;
            }
            #${PANEL_ID} .qcc-key {
                padding: 2px 6px; border: 1px solid #46505c; border-radius: 4px;
                color: #d8dee7; font-size: 11px;
            }
            #${PANEL_ID} .qcc-row {
                display: grid; grid-template-columns: 108px 1fr; gap: 10px;
                padding: 7px 0; border-top: 1px solid rgba(255,255,255,.08);
                overflow-wrap: anywhere;
            }
            #${PANEL_ID} .qcc-label { color: #929aa8; }
            #${PANEL_ID} .qcc-value { color: #f4f5f7; }
            #${PANEL_ID} .qcc-tag, #${PANEL_ID} .qcc-event {
                display: inline-block; margin: 0 4px 4px 0; padding: 2px 5px;
                border-radius: 4px; background: #263a38; color: #9bf0cf;
            }
            #${PANEL_ID} .qcc-event { background: #312b45; color: #d1bcff; }
            #${PANEL_ID} .qcc-muted { color: #777f8d; }
            #${PANEL_ID} .qcc-hint { color: #aeb5c0; font-size: 11px; }
            #${PANEL_ID} a { color: #83c9ff; }
            #${PANEL_ID} .qcc-error { color: #ff9e9e; }
            .qcc-highlight {
                position: fixed; z-index: 2147483646; pointer-events: none;
                border: 2px solid #59d7b0; background: rgba(89,215,176,.12);
                box-shadow: 0 0 0 1px rgba(0,0,0,.35);
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function ensurePanel() {
        if (state.panel) return state.panel;
        installStyles();
        state.panel = document.createElement('aside');
        state.panel.id = PANEL_ID;
        state.panel.hidden = true;
        (document.body || document.documentElement).appendChild(state.panel);
        return state.panel;
    }

    function getEvents(element) {
        const events = new Set();
        const tracked = trackedEvents.get(element);
        if (tracked) tracked.forEach((count, type) => { if (count > 0) events.add(type); });

        for (const attribute of element.attributes) {
            if (attribute.name.toLowerCase().startsWith('on')) {
                events.add(attribute.name.slice(2));
            }
        }

        for (const key of Object.keys(element)) {
            if (key.startsWith('on') && typeof element[key] === 'function') {
                events.add(key.slice(2));
            }
        }
        return [...events].sort();
    }

    function render(element) {
        const panel = ensurePanel();
        const rect = element.getBoundingClientRect();
        const link = element.closest('a[href]');
        const events = getEvents(element);
        const classes = [...element.classList];
        const eventMarkup = events.length
            ? events.map((event) => `<span class="qcc-event">${escapeHtml(event)}</span>`).join('')
            : '<span class="qcc-muted">Aucun détecté</span>';
        const linkValue = link ? `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener">${escapeHtml(link.href)}</a>` : '';

        panel.innerHTML = `
            <div class="qcc-title"><span>Qu'est-ce que c'est ?</span><span class="qcc-key">${ACTIVATION_KEY}</span></div>
            <div class="qcc-row"><span class="qcc-label">Élément</span><strong class="qcc-value">&lt;${escapeHtml(element.tagName.toLowerCase())}&gt;</strong></div>
            <div class="qcc-row"><span class="qcc-label">Classe</span><span class="qcc-value">${classes.length ? classes.map((item) => `<span class="qcc-tag">.${escapeHtml(item)}</span>`).join('') : '<span class="qcc-muted">Aucune</span>'}</span></div>
            <div class="qcc-row"><span class="qcc-label">ID</span><span class="qcc-value">${valueOrEmpty(element.id ? `#${element.id}` : '')}</span></div>
            <div class="qcc-row"><span class="qcc-label">Lien</span><span class="qcc-value">${linkValue || '<span class="qcc-muted">Aucun</span>'}</span></div>
            <div class="qcc-row"><span class="qcc-label">Dimensions</span><span class="qcc-value">${Math.round(rect.width)} x ${Math.round(rect.height)} px<br><span class="qcc-hint">position : ${Math.round(rect.left)}, ${Math.round(rect.top)}</span></span></div>
            <div class="qcc-row"><span class="qcc-label">Événements</span><span class="qcc-value">${eventMarkup}</span></div>
            <div class="qcc-hint" style="margin-top:10px">Détection : événements enregistrés depuis le chargement du script et attributs HTML visibles.</div>
        `;
        panel.hidden = false;
        state.hoveredElement = element;
        updateHighlight(element, rect);
    }

    function updateHighlight(element, rect) {
        if (!state.highlight) {
            state.highlight = document.createElement('div');
            state.highlight.className = 'qcc-highlight';
            document.documentElement.appendChild(state.highlight);
        }
        state.highlight.style.left = `${rect.left}px`;
        state.highlight.style.top = `${rect.top}px`;
        state.highlight.style.width = `${rect.width}px`;
        state.highlight.style.height = `${rect.height}px`;
        state.highlight.dataset.element = element.tagName;
    }

    function hideInspector() {
        if (state.panel) state.panel.hidden = true;
        if (state.highlight) state.highlight.remove();
        state.highlight = null;
        state.hoveredElement = null;
    }

    document.addEventListener('keydown', (event) => {
        if (event.key !== ACTIVATION_KEY || event.repeat) return;
        state.active = true;
        if (state.hoveredElement) render(state.hoveredElement);
    }, true);

    document.addEventListener('keyup', (event) => {
        if (event.key !== ACTIVATION_KEY) return;
        state.active = false;
        hideInspector();
    }, true);

    document.addEventListener('pointerover', (event) => {
        if (!state.active || !(event.target instanceof Element)) return;
        if (event.target.closest(`#${PANEL_ID}`) || event.target.closest('.qcc-highlight')) return;
        render(event.target);
    }, true);

    window.addEventListener('scroll', () => {
        if (state.active && state.hoveredElement?.isConnected) {
            render(state.hoveredElement);
        }
    }, true);

    window.addEventListener('blur', () => {
        state.active = false;
        hideInspector();
    });
})();
