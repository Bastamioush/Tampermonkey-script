// ==UserScript==
// @name         Super-Copie
// @namespace    https://github.com/tampermonkey-scripts
// @version      1.0.0
// @description  Télécharge la page actuelle et les pages qui redirigent, en ignorant les publicités.
// @author       Tim257
// @match        *://*/*
// @resource     logo file:///C:/Users/pc/Desktop/Code/Programmes/Tampermonkey-script/Logo.png
// @grant        GM_download
// @grant        GM_getResourceURL
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
	'use strict';

	const BUTTON_ID = '__super_copie_button__';
	const STATUS_ID = '__super_copie_status__';
	const MAX_REDIRECTS = 30;
	const AD_WORDS = /(^|[._/-])(ad|ads|advert|advertising|banner|click|doubleclick|popup|popunder|tracking|tracker|sponsor)([._/?=-]|$)/i;
	const AD_HOSTS = /(doubleclick\.net|googlesyndication\.com|googleadservices\.com|adnxs\.com|adsrvr\.org|adform\.net|amazon-adsystem\.com|facebook\.com\/tr|taboola\.com|outbrain\.com)/i;
	let isRunning = false;

	function addInterface() {
		const style = document.createElement('style');
		style.textContent = `
			#${BUTTON_ID} { display: inline-flex; align-items: center; gap: 9px; position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; padding: 7px 12px 7px 8px; border: 1px solid #79c8ff; border-radius: 8px; background: #162333; color: #f4f8fc; font: 600 13px system-ui, sans-serif; cursor: pointer; box-shadow: 0 8px 28px #0006; }
			#${BUTTON_ID}:hover { background: #24405b; }
			#${BUTTON_ID} img { width: 30px; height: 30px; border-radius: 5px; object-fit: cover; }
			#${STATUS_ID} { position: fixed; right: 18px; bottom: 68px; z-index: 2147483647; max-width: min(420px, calc(100vw - 36px)); padding: 9px 12px; border-radius: 7px; background: #111820; color: #c9d5e1; font: 12px/1.4 system-ui, sans-serif; box-shadow: 0 8px 25px #0006; }
			#${STATUS_ID}[hidden] { display: none; }
		`;
		document.head.appendChild(style);

		const button = document.createElement('button');
		button.id = BUTTON_ID;
		button.type = 'button';
		const logo = document.createElement('img');
		logo.alt = '';
		logo.src = GM_getResourceURL('logo');
		const label = document.createElement('span');
		label.textContent = 'Télécharger cette page';
		button.append(logo, label);
		button.dataset.label = 'Télécharger cette page';
		button.addEventListener('click', startCopy);
		document.body.appendChild(button);

		const status = document.createElement('div');
		status.id = STATUS_ID;
		status.hidden = true;
		document.body.appendChild(status);
	}

	function setStatus(message, visible = true) {
		const status = document.getElementById(STATUS_ID);
		status.textContent = message;
		status.hidden = !visible;
	}

	function safePart(value, fallback = 'page') {
		const cleaned = String(value || fallback)
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-zA-Z0-9._-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 100);
		return cleaned || fallback;
	}

	function pageFolder() {
		return `Page-${safePart(document.title, location.hostname)}`;
	}

	function fileName(url, fallback = 'page') {
		try {
			const parsed = new URL(url);
			const path = parsed.pathname.split('/').filter(Boolean).pop() || fallback;
			return safePart(path.replace(/\.[^.]+$/, '') || fallback) + '.html';
		} catch {
			return `${safePart(fallback)}.html`;
		}
	}

	function downloadText(text, name) {
		const blob = new Blob([text], { type: 'text/html;charset=utf-8' });
		const blobUrl = URL.createObjectURL(blob);
		return new Promise((resolve, reject) => {
			try {
				GM_download({
					url: blobUrl,
					name,
					saveAs: false,
					onerror(error) {
						URL.revokeObjectURL(blobUrl);
						console.warn('[Super-Copie] Téléchargement impossible', name, error);
						reject(new Error(`Téléchargement refusé pour ${name}`));
					},
					onload() {
						URL.revokeObjectURL(blobUrl);
						resolve();
					}
				});
			} catch (error) {
				URL.revokeObjectURL(blobUrl);
				reject(error);
			}
		});
	}

	function isAdvertisement(url, element) {
		if (AD_WORDS.test(url) || AD_HOSTS.test(url)) return true;
		if (!element) return false;
		const context = `${element.id || ''} ${element.className || ''}`;
		return /(^|[\s_-])(ad|ads|advert|banner|sponsor|tracking)([\s_-]|$)/i.test(context);
	}

	function collectLinks() {
		const links = new Map();
		document.querySelectorAll('a[href], iframe[src], area[href]').forEach((element) => {
			const rawUrl = element.href || element.src;
			if (!rawUrl || isAdvertisement(rawUrl, element)) return;
			try {
				const url = new URL(rawUrl, location.href);
				if (!/^https?:$/.test(url.protocol)) return;
				url.hash = '';
				if (url.href !== location.href) links.set(url.href, element);
			} catch {
				// URL invalide : on ignore ce lien.
			}
		});
		return [...links.entries()];
	}

	function requestPage(url) {
		return new Promise((resolve) => {
			GM_xmlhttpRequest({
				method: 'GET',
				url,
				timeout: 15000,
				onload(response) {
					resolve(response);
				},
				onerror() {
					resolve(null);
				},
				ontimeout() {
					resolve(null);
				}
			});
		});
	}

	async function startCopy() {
		if (isRunning) return;
		isRunning = true;
		const button = document.getElementById(BUTTON_ID);
		button.disabled = true;
		button.querySelector('span').textContent = 'Copie en cours...';

		const folder = pageFolder();
		try {
			await downloadText(`<!doctype html>\n${document.documentElement.outerHTML}`, `${folder}/index.html`);
		} catch (error) {
			setStatus(`Échec du téléchargement : ${error.message}`);
			button.disabled = false;
			button.querySelector('span').textContent = button.dataset.label;
			isRunning = false;
			return;
		}
		const candidates = collectLinks().slice(0, MAX_REDIRECTS);
		let redirects = 0;
		let ignored = collectLinks().length - candidates.length;

		setStatus(`Page enregistrée. Vérification de ${candidates.length} lien(s) pour trouver les redirections...`);
		for (const [url, element] of candidates) {
			const response = await requestPage(url);
			if (!response || response.status < 200 || response.status >= 400) {
				ignored += 1;
				continue;
			}
			const finalUrl = response.finalUrl || url;
			if (finalUrl === url || isAdvertisement(finalUrl, element)) {
				ignored += 1;
				continue;
			}
			const redirectedFolder = `${folder}/redirections`;
			try {
				await downloadText(`<!doctype html>\n${response.responseText}`, `${redirectedFolder}/${fileName(finalUrl, `redirect-${redirects + 1}`)}`);
				redirects += 1;
			} catch (error) {
				ignored += 1;
				console.warn('[Super-Copie] Redirection non téléchargée', finalUrl, error);
			}
			setStatus(`Page enregistrée. ${redirects} redirection(s) trouvée(s)...`);
		}

		setStatus(`Terminé : page dans « ${folder} », ${redirects} redirection(s) dans « ${folder}/redirections ». ${ignored} lien(s) ignoré(s).`);
		button.disabled = false;
		button.querySelector('span').textContent = button.dataset.label;
		isRunning = false;
	}

	addInterface();
})();
