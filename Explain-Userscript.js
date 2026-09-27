// ==UserScript==
// @name         🧠 Explain this
// @namespace    https://github.com/tampermonkey-scripts
// @version      1.1.0
// @description  Sélectionnez un passage compliqué pour obtenir une explication simplifiée.
// @author       Tim257
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @connect      api.openai.com
// @connect      *
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-end
// ==/UserScript==

(function () {
	'use strict';

	const CONFIG_KEY = '__explain_this_config__';
	const UI_ID = '__explain_this_ui__';
	const defaultConfig = {
		provider: 'openai-compatible',
		endpoint: 'https://api.openai.com/v1/chat/completions',
		model: 'gpt-4o-mini',
		apiKey: ''
	};
	const providerDefaults = {
		'openai-compatible': {
			endpoint: 'https://api.openai.com/v1/chat/completions',
			model: 'gpt-4o-mini'
		},
		anthropic: {
			endpoint: 'https://api.anthropic.com/v1/messages',
			model: 'claude-3-5-haiku-latest'
		},
		gemini: {
			endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
			model: 'gemini-2.0-flash'
		}
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
			#${UI_ID}_panel label { display: block; margin: 12px 0 5px; color: #b9c6d3; font-size: 12px; }
			#${UI_ID}_panel input, #${UI_ID}_panel select { box-sizing: border-box; width: 100%; padding: 8px; border: 1px solid #50657d; border-radius: 5px; background: #1a2734; color: #edf4fb; font: inherit; }
			#${UI_ID}_panel .explain-actions { display: flex; gap: 8px; flex-wrap: wrap; }
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
			<div class="explain-actions">
				<button type="button" data-action="settings">Configurer l’API</button>
				<button type="button" data-action="close">Fermer</button>
			</div>
		`;
		state.panel.style.display = 'block';
		state.panel.querySelector('[data-action="settings"]').addEventListener('click', showSettings);
		state.panel.querySelector('[data-action="close"]').addEventListener('click', () => {
			state.panel.style.display = 'none';
		});
	}

	function showSettings(message = '') {
		state.panel.innerHTML = `
			<h2>Configuration de l’API</h2>
			${message ? `<p class="explain-error">${escapeHtml(message)}</p>` : ''}
			<form data-action="config-form">
				<label for="explain-provider">Format de l’API</label>
				<select id="explain-provider" name="provider">
					<option value="openai-compatible">OpenAI-compatible (OpenAI, OpenRouter, Groq, Ollama…)</option>
					<option value="anthropic">Anthropic (Claude)</option>
					<option value="gemini">Google (Gemini)</option>
				</select>
				<label for="explain-endpoint">Endpoint</label>
				<input id="explain-endpoint" name="endpoint" type="url" required>
				<label for="explain-model">Modèle</label>
				<input id="explain-model" name="model" type="text" required>
				<label for="explain-api-key">Clé API</label>
				<input id="explain-api-key" name="apiKey" type="password" autocomplete="off" required>
				<div class="explain-actions">
					<button type="submit">Enregistrer</button>
					<button type="button" data-action="cancel">Annuler</button>
				</div>
			</form>
		`;
		state.panel.style.display = 'block';

		const form = state.panel.querySelector('[data-action="config-form"]');
		form.elements.provider.value = providerDefaults[config.provider] ? config.provider : 'openai-compatible';
		form.elements.endpoint.value = config.endpoint;
		form.elements.model.value = config.model;
		form.elements.apiKey.value = config.apiKey;
		form.elements.provider.addEventListener('change', () => {
			const defaults = providerDefaults[form.elements.provider.value];
			form.elements.endpoint.value = defaults.endpoint;
			form.elements.model.value = defaults.model;
		});
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			const values = new FormData(form);
			const endpoint = String(values.get('endpoint')).trim();
			try {
				const url = new URL(endpoint);
				if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
			} catch {
				showSettings('Endpoint invalide : utilisez une URL HTTP ou HTTPS.');
				return;
			}
			config.provider = String(values.get('provider'));
			config.endpoint = endpoint;
			config.model = String(values.get('model')).trim();
			config.apiKey = String(values.get('apiKey')).trim();
			if (!config.model || !config.apiKey) {
				showSettings('Le modèle et la clé API sont obligatoires.');
				return;
			}
			saveConfig();
			showPanel('<span class="explain-muted">Configuration enregistrée. Sélectionnez de nouveau le passage pour l’expliquer.</span>');
		});
		state.panel.querySelector('[data-action="cancel"]').addEventListener('click', () => {
			showPanel('<span class="explain-muted">Configuration inchangée.</span>');
		});
	}

	function explainSelection() {
		hideButton();
		if (!config.apiKey) {
			showSettings('Configurez votre fournisseur et votre clé API pour commencer.');
			return;
		}

		showPanel('<span class="explain-muted">Analyse du passage en cours...</span>');
		const prompt = `Explique le passage suivant en français simple.\n\nRègles : commence par l\'idée principale en une phrase, puis donne 2 à 4 points courts. Définis les termes techniques indispensables. Ne prétends pas connaître un contexte absent.\n\nPassage :\n${state.selection}`;

		const request = buildRequest(prompt);
		GM_xmlhttpRequest({
			method: 'POST',
			url: request.url,
			headers: request.headers,
			data: JSON.stringify(request.body),
			onload(response) {
				try {
					const data = JSON.parse(response.responseText);
					if (response.status < 200 || response.status >= 300) throw new Error(data.error?.message || data.error?.type || `Erreur HTTP ${response.status}`);
					const answer = getAnswer(data);
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

	function buildRequest(prompt) {
		if (config.provider === 'anthropic') {
			return {
				url: config.endpoint,
				headers: {
					'Content-Type': 'application/json',
					'x-api-key': config.apiKey,
					'anthropic-version': '2023-06-01',
					'anthropic-dangerous-direct-browser-access': 'true'
				},
				body: { model: config.model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }], temperature: 0.2 }
			};
		}
		if (config.provider === 'gemini') {
			const url = new URL(config.endpoint);
			url.searchParams.set('key', config.apiKey);
			return {
				url: url.toString(),
				headers: { 'Content-Type': 'application/json' },
				body: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }
			};
		}
		return {
			url: config.endpoint,
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
			body: { model: config.model, messages: [{ role: 'user', content: prompt }], temperature: 0.2 }
		};
	}

	function getAnswer(data) {
		if (config.provider === 'anthropic') {
			return data.content?.filter((item) => item.type === 'text').map((item) => item.text).join('\n').trim();
		}
		if (config.provider === 'gemini') {
			return data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
		}
		const content = data.choices?.[0]?.message?.content;
		return typeof content === 'string' ? content.trim() : content?.map((part) => part.text || '').join('').trim();
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
