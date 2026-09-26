// ==UserScript==
// @name         Refus automatique des cookies
// @namespace    https://github.com/tampermonkey-scripts
// @version      1.0.0
// @description  Refuse les cookies non nécessaires et masque les bandeaux de consentement persistants.
// @author       Tim257
// @match        *://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const ROOT_SELECTOR = [
        '#onetrust-banner-sdk', '#onetrust-consent-sdk', '#didomi-host',
        '#CybotCookiebotDialog', '#cookiebanner', '#cookie-banner',
        '[id*="cookie" i][class*="banner" i]', '[class*="cookie" i][class*="banner" i]',
        '[id*="consent" i][class*="banner" i]', '[class*="consent" i][class*="banner" i]',
        '[role="dialog"][aria-label*="cookie" i]', '[role="dialog"][aria-label*="consent" i]'
    ].join(',');
    const CONTROL_SELECTOR = 'button, [role="button"], input[type="button"], input[type="submit"], a';
    const REJECT_LABEL = /\btout\s+(?:refuser|rejeter|decliner)\b|\b(?:reject|refuse|decline)\b.*\b(?:all|cookies?|consent|optional|tracking)\b|\b(?:reject|refuse|decline)\s+all\b|\b(?:only|just)\s+(?:strictly\s+)?necessary\b|\bnecessary\s+only\b|\b(?:refuser|rejeter|decliner)\b.*\b(?:tout|cookies?|consentement|optionnels?)\b|\buniquement\s+(?:les\s+)?(?:cookies?\s+)?necessaires\b|\bcontinuer\s+sans\s+accepter\b/;
    const PREFERENCES_LABEL = /\b(?:manage|customi[sz]e|settings?|preferences?)\b.*\b(?:cookies?|privacy|consent)\b|\b(?:cookies?|privacy|consent)\b.*\b(?:settings?|preferences?)\b|\b(?:parametrer|personnaliser|reglages?)\b.*\b(?:cookies?|consentement)?\b|\bgerer\s+(?:(?:mes\s+)?cookies?|mes\s+choix)\b/;
    const state = { clicked: new WeakSet(), openedPreferences: false, scheduled: false, fallbackTimer: null };

    function normalize(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    }

    function labelOf(element) {
        return normalize([
            element.innerText,
            element.getAttribute('aria-label'),
            element.getAttribute('title'),
            element.value
        ].filter(Boolean).join(' '));
    }

    function isVisible(element) {
        if (!element.isConnected || !element.getClientRects().length) return false;
        const style = getComputedStyle(element);
        return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0;
    }

    function hasConsentContext(element) {
        let current = element;
        for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
            const identifiers = `${current.id || ''} ${typeof current.className === 'string' ? current.className : ''} ${current.getAttribute('aria-label') || ''}`;
            if (/cookie|consent|privacy|didomi|onetrust|cookiebot|axeptio/i.test(identifiers)) return true;
            if (current.matches('[role="dialog"], [aria-modal="true"]')) {
                return /cookies?|consent|privacy|confidentialite/i.test(current.innerText || '');
            }
        }
        return false;
    }

    function findControl(pattern) {
        return [...document.querySelectorAll(CONTROL_SELECTOR)].find((element) =>
            !state.clicked.has(element) && isVisible(element) &&
            pattern.test(labelOf(element)) && hasConsentContext(element)
        );
    }

    function clickControl(element) {
        state.clicked.add(element);
        element.click();
    }

    function hideKnownBanners() {
        document.querySelectorAll(ROOT_SELECTOR).forEach((element) => {
            if (isVisible(element)) {
                element.style.setProperty('display', 'none', 'important');
                element.setAttribute('data-cookie-banner-hidden-by-userscript', 'true');
            }
        });
    }

    function scan() {
        state.scheduled = false;

        const reject = findControl(REJECT_LABEL);
        if (reject) {
            clickControl(reject);
            return;
        }

        if (!state.openedPreferences) {
            const preferences = findControl(PREFERENCES_LABEL);
            if (preferences) {
                state.openedPreferences = true;
                clickControl(preferences);
                return;
            }
        }

        if (document.querySelector(ROOT_SELECTOR) && !state.fallbackTimer) {
            state.fallbackTimer = window.setTimeout(hideKnownBanners, 1800);
        }
    }

    function scheduleScan() {
        if (state.scheduled) return;
        state.scheduled = true;
        window.setTimeout(scan, 150);
    }

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    scheduleScan();
})();