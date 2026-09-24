// ==UserScript==
// @name         🧠 Explain this
// @namespace    https://github.com/tampermonkey-scripts
// @version      1.0.0
// @description  Sélectionnez un passage compliqué pour obtenir une explication simplifiée.
// @author       Tim257
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      api.openai.com
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-end
// ==/UserScript==

(function () {
	'use strict';

	const CONFIG_KEY = '__explain_this_config__';
	const UI_ID = '__explain_this_ui__';
	const defaultConfig = {
		endpoint: 'https://api.openai.com/v1/chat/completions',
		model: 'gpt-4o-mini',
		apiKey: ''
	};
	const state = { selection: '', range: null, button: null, panel: null };

	const config = loadConfig();

	function loadConfig() {
		try {
			return { ...defaultConfig, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') };
		} catch {
			return { ...defaultConfig };
		}
	}

	function saveConfig() {
		localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
	}

	function escapeHtml(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function installStyles() {
		if (document.getElementById(`${UI_ID}_style`)) return;
		const style = document.createElement('style');
		style.id = `${UI_ID}_style`;
		style.textContent = `
			#${UI_ID}_button, #${UI_ID}_panel { all: initial; box-sizing: border-box; z-index: 2147483647; font-family: ui-sans-serif, system-ui, sans-serif; }
			#${UI_ID}_button { position: fixed; display: none; padding: 8px 12px; border: 1px solid #83c9ff; border-radius: 8px; background: #172333; color: #fff; box-shadow: 0 8px 24px #0006; cursor: pointer; font-size: 13px; font-weight: 700; }
			#${UI_ID}_button:hover { background: #24405d; }
			#${UI_ID}_panel { position: fixed; display: none; top: 18px; right: 18px; width: min(520px, calc(100vw - 36px)); max-height: calc(100vh - 36px); overflow: auto; padding: 18px; border: 1px solid #394b60; border-radius: 12px; background: #111820; color: #edf4fb; box-shadow: 0 18px 60px #0008; font-size: 14px; line-height: 1.55; }
			#${UI_ID}_panel h2 { margin: 0 0 12px; color: #9bd7ff; font-size: 17px; }
			#${UI_ID}_panel .explain-selection { margin: 0 0 14px; padding: 10px; border-left: 3px solid #83c9ff; background: #1a2734; color: #b9c6d3; font-size: 12px; }
			#${UI_ID}_panel .explain-answer { white-space: pre-wrap; }
			#${UI_ID}_panel .explain-muted { color: #9daab8; }
			#${UI_ID}_panel .explain-error { color: #ffabab; }
			#${UI_ID}_panel button { margin-top: 16px; padding: 7px 10px; border: 1px solid #50657d; border-radius: 6px; background: #1e2c3b; color: #edf4fb; cursor: pointer; }
			#${UI_ID}_panel button:hover { background: #2a3e53; }
		`;
		document.head.appendChild(style);
	}

	function createUi() {
		installStyles();
		const button = document.createElement('button');
		button.id = `${UI_ID}_button`;
		button.type = 'button';
		button.textContent = '🧠 Explain this';
		button.addEventListener('mousedown', (event) => event.preventDefault());
		button.addEventListener('click', explainSelection);
		document.body.appendChild(button);
		state.button = button;

		const panel = document.createElement('section');
		panel.id = `${UI_ID}_panel`;
		document.body.appendChild(panel);
		state.panel = panel;
	}

	function selectedText() {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) return '';
		return selection.toString().trim().replace(/\s+/g, ' ');
	}

	function showButton() {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || !selectedText()) return;
		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		state.selection = selectedText();
		state.range = range.cloneRange();
		state.button.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 170))}px`;
		state.button.style.top = `${Math.max(8, rect.bottom + 8)}px`;
		state.button.style.display = 'block';
	}

	function hideButton() {
		state.button.style.display = 'none';
	}

	function showPanel(content, className = 'explain-answer') {
		state.panel.innerHTML = `
			<h2>🧠 Explication simplifiée</h2>
			<div class="explain-selection">${escapeHtml(state.selection)}</div>
			<div class="${className}">${content}</div>
			<button type="button" data-action="close">Fermer</button>
		`;
		state.panel.style.display = 'block';
		state.panel.querySelector('[data-action="close"]').addEventListener('click', () => {
			state.panel.style.display = 'none';
		});
	}

	function askForApiKey() {
		const apiKey = window.prompt('Collez votre clé API OpenAI. Elle sera conservée uniquement dans ce navigateur :');
		if (!apiKey) return false;
		config.apiKey = apiKey.trim();
		saveConfig();
		return Boolean(config.apiKey);
	}

	function explainSelection() {
		hideButton();
		if (!config.apiKey && !askForApiKey()) {
			showPanel('<span class="explain-error">Aucune clé API configurée. Cliquez à nouveau sur le bouton pour réessayer.</span>', 'explain-error');
			return;
		}

		showPanel('<span class="explain-muted">Analyse du passage en cours...</span>');
		const prompt = `Explique le passage suivant en français simple.\n\nRègles : commence par l\'idée principale en une phrase, puis donne 2 à 4 points courts. Définis les termes techniques indispensables. Ne prétends pas connaître un contexte absent.\n\nPassage :\n${state.selection}`;

		GM_xmlhttpRequest({
			method: 'POST',
			url: config.endpoint,
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
			data: JSON.stringify({
				model: config.model,
				messages: [{ role: 'user', content: prompt }],
				temperature: 0.2
			}),
			onload(response) {
				try {
					const data = JSON.parse(response.responseText);
					if (response.status < 200 || response.status >= 300) throw new Error(data.error?.message || `Erreur HTTP ${response.status}`);
					const answer = data.choices?.[0]?.message?.content;
					if (!answer) throw new Error('La réponse ne contient aucune explication.');
					showPanel(escapeHtml(answer));
				} catch (error) {
					showPanel(`<span class="explain-error">${escapeHtml(error.message)}</span>`, 'explain-error');
				}
			},
			onerror() {
				showPanel('<span class="explain-error">Impossible de joindre le service d’explication. Vérifiez votre connexion et votre configuration.</span>', 'explain-error');
			}
		});
	}

	createUi();
	document.addEventListener('mouseup', () => window.setTimeout(showButton, 0), true);
	document.addEventListener('keyup', (event) => {
		if (event.key === 'Escape') {
			hideButton();
			state.panel.style.display = 'none';
		}
	}, true);
	document.addEventListener('mousedown', (event) => {
		if (event.target !== state.button && !state.panel.contains(event.target)) hideButton();
	}, true);
})();
