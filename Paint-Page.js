// ==UserScript==
// @name         Paint Page
// @namespace    https://github.com/tampermonkey-scripts
// @version      1.0.0
// @description  Surlignez du texte et dessinez des formes sur une page, avec sauvegarde locale.
// @author       Tim257
// @match        *://*/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
	'use strict';

	const HOST_ID = '__paint_page_host__';
	const SVG_ID = '__paint_page_overlay__';
	const STORAGE_KEY = `__paint_page__:${location.origin}${location.pathname}`;
	const COLORS = ['#ffdf5d', '#ff8b7b', '#8ce0bd', '#83b9ff', '#d6a1ff', '#ffffff'];
	const state = {
		mode: 'highlight',
		color: COLORS[0],
		annotations: [],
		savedRange: null,
		drawing: null,
		host: null,
		panel: null,
		svg: null,
		layer: null,
		status: null
	};

	function loadAnnotations() {
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
			return Array.isArray(saved) ? saved.filter((item) => item && ['highlight', 'rect', 'ellipse', 'arrow', 'note', 'link'].includes(item.type)) : [];
		} catch (_) {
			return [];
		}
	}

	function saveAnnotations() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state.annotations));
		} catch (_) {
			setStatus('Sauvegarde indisponible sur ce site.');
		}
		renderAnnotations();
	}

	function setStatus(message) {
		if (state.status) state.status.textContent = message;
	}

	function pageText() {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				const parent = node.parentElement;
				if (!parent || parent.closest(`#${HOST_ID}, #${SVG_ID}, script, style, noscript, textarea, input, select, [contenteditable="true"]`)) {
					return NodeFilter.FILTER_REJECT;
				}
				return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
			}
		});
		const entries = [];
		let text = '';
		let node;
		while ((node = walker.nextNode())) {
			const start = text.length;
			text += node.nodeValue;
			entries.push({ node, start, end: text.length });
		}
		return { text, entries };
	}

	function offsetFor(entries, node, offset, isEnd) {
		const entry = entries.find((item) => item.node === node);
		if (entry) return entry.start + offset;
		const parent = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
		const candidates = entries.filter((item) => parent && parent.contains(item.node));
		if (!candidates.length) return null;
		return isEnd ? candidates[candidates.length - 1].end : candidates[0].start;
	}

	function captureSelection() {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed || !selection.rangeCount) return;
		const range = selection.getRangeAt(0);
		if (state.host.contains(range.commonAncestorContainer)) return;
		state.savedRange = range.cloneRange();
	}

	function createHighlight() {
		const range = state.savedRange;
		if (!range || !range.toString().trim() || !range.startContainer.isConnected) {
			setStatus('Sélectionnez d’abord un passage de texte.');
			return;
		}
		const { text, entries } = pageText();
		const start = offsetFor(entries, range.startContainer, range.startOffset, false);
		const end = offsetFor(entries, range.endContainer, range.endOffset, true);
		const quote = range.toString();
		if (start === null || end === null || end <= start) {
			setStatus('Impossible de retrouver cette sélection.');
			return;
		}
		state.annotations.push({
			type: 'highlight', color: state.color, quote,
			prefix: text.slice(Math.max(0, start - 48), start),
			suffix: text.slice(end, end + 48)
		});
		state.savedRange = null;
		window.getSelection().removeAllRanges();
		saveAnnotations();
		setStatus('Passage surligné et enregistré.');
	}

	function rangeFromOffsets(entries, start, end) {
		const startEntry = entries.find((item) => start >= item.start && start < item.end);
		const endEntry = entries.find((item) => end > item.start && end <= item.end);
		if (!startEntry || !endEntry) return null;
		const range = document.createRange();
		range.setStart(startEntry.node, start - startEntry.start);
		range.setEnd(endEntry.node, end - endEntry.start);
		return range;
	}

	function locateHighlight(annotation, text, entries) {
		let searchFrom = 0;
		let best = null;
		let bestScore = -1;
		while (annotation.quote && searchFrom < text.length) {
			const start = text.indexOf(annotation.quote, searchFrom);
			if (start < 0) break;
			const before = text.slice(Math.max(0, start - annotation.prefix.length), start);
			const after = text.slice(start + annotation.quote.length, start + annotation.quote.length + annotation.suffix.length);
			let score = 0;
			for (let i = 1; i <= Math.min(before.length, annotation.prefix.length); i += 1) {
				if (before[before.length - i] !== annotation.prefix[annotation.prefix.length - i]) break;
				score += 1;
			}
			for (let i = 0; i < Math.min(after.length, annotation.suffix.length); i += 1) {
				if (after[i] !== annotation.suffix[i]) break;
				score += 1;
			}
			if (score > bestScore) {
				best = rangeFromOffsets(entries, start, start + annotation.quote.length);
				bestScore = score;
			}
			searchFrom = start + annotation.quote.length;
		}
		return best;
	}

	function svgElement(name, attributes) {
		const element = document.createElementNS('http://www.w3.org/2000/svg', name);
		Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
		return element;
	}

	function renderAnnotations() {
		if (!state.svg) return;
		state.svg.replaceChildren();
		state.layer.replaceChildren();
		state.svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
		const hasHighlights = state.annotations.some((annotation) => annotation.type === 'highlight');
		const page = hasHighlights ? pageText() : null;
		const scrollX = window.scrollX;
		const scrollY = window.scrollY;

		state.annotations.forEach((annotation) => {
			if (annotation.type === 'highlight') {
				const range = locateHighlight(annotation, page.text, page.entries);
				if (!range) return;
				[...range.getClientRects()].forEach((rect) => {
					state.svg.append(svgElement('rect', {
						x: rect.left, y: rect.top, width: rect.width, height: rect.height,
						rx: 2, fill: annotation.color, 'fill-opacity': 0.46
					}));
				});
				return;
			}
			if (annotation.type === 'note' || annotation.type === 'link') {
				const item = annotation.type === 'note' ? document.createElement('div') : document.createElement('a');
				item.textContent = annotation.type === 'note' ? annotation.text : annotation.label;
				if (annotation.type === 'link') {
					const url = safeLink(annotation.href);
					if (!url) return;
					item.href = url.href;
					item.target = '_blank';
					item.rel = 'noopener noreferrer';
					item.title = url.href;
					item.style.pointerEvents = 'auto';
					item.style.textDecoration = 'underline';
				}
				item.style.cssText += `;position:fixed;left:${Number(annotation.x1) - scrollX}px;top:${Number(annotation.y1) - scrollY}px;max-width:260px;padding:5px 8px;border:1px solid ${annotation.color};border-radius:4px;background:${annotation.color};color:#17221d;font:600 13px/1.35 "Segoe UI",sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:0 2px 8px #0003;`;
				state.layer.append(item);
				return;
			}

			const x1 = Number(annotation.x1) - scrollX;
			const y1 = Number(annotation.y1) - scrollY;
			const x2 = Number(annotation.x2) - scrollX;
			const y2 = Number(annotation.y2) - scrollY;
			const left = Math.min(x1, x2);
			const top = Math.min(y1, y2);
			const width = Math.abs(x2 - x1);
			const height = Math.abs(y2 - y1);
			const style = { fill: 'none', stroke: annotation.color, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
			if (annotation.type === 'rect') state.svg.append(svgElement('rect', { ...style, x: left, y: top, width, height, rx: 2 }));
			if (annotation.type === 'ellipse') state.svg.append(svgElement('ellipse', { ...style, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, rx: width / 2, ry: height / 2 }));
			if (annotation.type === 'arrow') {
				const angle = Math.atan2(y2 - y1, x2 - x1);
				const head = 11;
				state.svg.append(svgElement('path', {
					...style,
					d: `M ${x1} ${y1} L ${x2} ${y2} M ${x2 - head * Math.cos(angle - Math.PI / 6)} ${y2 - head * Math.sin(angle - Math.PI / 6)} L ${x2} ${y2} L ${x2 - head * Math.cos(angle + Math.PI / 6)} ${y2 - head * Math.sin(angle + Math.PI / 6)}`
				}));
			}
		});
	}

	function setMode(mode) {
		state.mode = mode;
		state.panel.querySelectorAll('[data-mode]').forEach((button) => {
			button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
		});
		state.host.dataset.drawing = String(mode !== 'highlight');
		state.panel.querySelector('[data-placement]').hidden = !['note', 'link'].includes(mode);
		state.panel.querySelector('[data-note-fields]').hidden = mode !== 'note';
		state.panel.querySelector('[data-link-fields]').hidden = mode !== 'link';
		const messages = {
			highlight: 'Sélectionnez un passage, puis cliquez sur Surligner.',
			note: 'Saisissez votre note, puis cliquez à son emplacement.',
			link: 'Saisissez une URL, puis cliquez où placer le lien.'
		};
		setStatus(messages[mode] || 'Cliquez-glissez sur la page pour tracer.');
	}

	function safeLink(value) {
		try {
			const url = new URL(value);
			return ['http:', 'https:'].includes(url.protocol) ? url : null;
		} catch (_) {
			return null;
		}
	}

	function makeInterface() {
		state.host = document.createElement('div');
		state.host.id = HOST_ID;
		state.host.style.cssText = 'all:initial;position:fixed;z-index:2147483646;right:20px;bottom:20px;isolation:isolate;';
		const shadow = state.host.attachShadow({ mode: 'open' });
		shadow.innerHTML = `
			<style>
				:host { all: initial; }
				* { box-sizing: border-box; }
				.wrap { color: #f4f6f5; font: 13px/1.4 "Segoe UI", sans-serif; }
				.panel { width: 270px; padding: 14px; border: 1px solid #46514d; border-radius: 10px; background: #202724; box-shadow: 0 12px 36px #0006; }
				.panel[hidden] { display: none; }
				.head { display:flex; align-items:center; justify-content:space-between; margin-bottom: 12px; }
				.title { font-size: 15px; font-weight: 700; letter-spacing: 0; }
				button { font: inherit; color: inherit; cursor: pointer; }
				.close, .launcher { border: 0; color: #f4f6f5; background: transparent; }
				.close { width: 28px; height: 28px; border-radius: 6px; font-size: 18px; }
				.close:hover, .tool:hover, .action:hover { background: #39443f; }
				.label { display:block; margin: 10px 0 6px; color: #aebbb4; font-size: 11px; font-weight: 600; }
				.tools { display:grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
				.tool { min-height: 40px; border: 1px solid #46514d; border-radius: 6px; background: #29322e; font-size: 16px; }
				.tool[aria-pressed="true"] { border-color: #8ce0bd; color: #a8f0d2; background: #30473d; }
				.colors { display:flex; align-items:center; gap: 8px; }
				.swatch { width: 25px; height: 25px; padding: 0; border: 2px solid transparent; border-radius: 50%; background: var(--swatch); }
				.swatch[aria-pressed="true"] { outline: 2px solid #f4f6f5; outline-offset: 2px; }
				input[type="color"] { width: 30px; height: 30px; padding: 2px; border: 1px solid #66726c; border-radius: 6px; background: #29322e; cursor: pointer; }
				.placement[hidden], .placement-fields[hidden] { display:none; }
				.placement input { width:100%; min-height:34px; padding:6px 8px; border:1px solid #46514d; border-radius:5px; color:#f4f6f5; background:#29322e; font:inherit; }
				.placement input + input { margin-top:6px; }
				.actions { display:flex; gap: 7px; margin-top: 13px; }
				.action { flex: 1; min-height: 36px; border: 1px solid #46514d; border-radius: 6px; background: #29322e; }
				.primary { border-color: #83cdb0; color: #17251e; background: #8ce0bd; font-weight: 700; }
				.primary:hover { background: #a4ebcc; }
				.status { min-height: 18px; margin: 10px 0 0; color: #b6c1bb; font-size: 11px; }
				.launcher { width: 46px; height: 46px; border: 1px solid #8ce0bd; border-radius: 50%; background: #26342e; box-shadow: 0 5px 20px #0005; font-size: 21px; }
				.launcher:hover { background: #35483e; }
			</style>
			<div class="wrap">
				<section class="panel" aria-label="Outils de dessin" hidden>
					<div class="head"><span class="title">Paint Page</span><button class="close" type="button" aria-label="Fermer">×</button></div>
					<span class="label">Outil</span>
					<div class="tools" role="group" aria-label="Choisir un outil">
						<button class="tool" type="button" data-mode="highlight" aria-label="Surlignage" title="Surlignage" aria-pressed="true">T</button>
						<button class="tool" type="button" data-mode="rect" aria-label="Rectangle" title="Rectangle" aria-pressed="false">□</button>
						<button class="tool" type="button" data-mode="ellipse" aria-label="Ellipse" title="Ellipse" aria-pressed="false">○</button>
						<button class="tool" type="button" data-mode="arrow" aria-label="Flèche" title="Flèche" aria-pressed="false">↗</button>
						<button class="tool" type="button" data-mode="note" aria-label="Ajouter une annotation texte" title="Annotation texte" aria-pressed="false">Aa</button>
						<button class="tool" type="button" data-mode="link" aria-label="Ajouter un lien" title="Lien cliquable" aria-pressed="false">URL</button>
					</div>
					<div class="placement" data-placement hidden>
						<div class="placement-fields" data-note-fields hidden>
							<label class="label" for="paint-page-note">Annotation</label>
							<input id="paint-page-note" data-note-text maxlength="500" placeholder="Votre annotation">
						</div>
						<div class="placement-fields" data-link-fields hidden>
							<label class="label" for="paint-page-url">Adresse du lien</label>
							<input id="paint-page-url" data-link-url type="url" placeholder="https://exemple.fr">
							<label class="label" for="paint-page-link-label">Texte affiché</label>
							<input id="paint-page-link-label" data-link-label maxlength="120" placeholder="Ouvrir le lien">
						</div>
					</div>
					<span class="label">Couleur</span>
					<div class="colors" role="group" aria-label="Choisir une couleur"></div>
					<div class="actions">
						<button class="action primary" type="button" data-highlight>Surligner</button>
						<button class="action" type="button" data-undo title="Retirer la dernière annotation">Annuler</button>
					</div>
					<p class="status" aria-live="polite"></p>
				</section>
				<button class="launcher" type="button" aria-label="Ouvrir Paint Page" title="Paint Page">✎</button>
			</div>`;
		document.documentElement.append(state.host);
		state.panel = shadow.querySelector('.panel');
		state.status = shadow.querySelector('.status');
		const colors = shadow.querySelector('.colors');
		COLORS.forEach((color, index) => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'swatch';
			button.style.setProperty('--swatch', color);
			button.setAttribute('aria-label', `Couleur ${index + 1}`);
			button.setAttribute('aria-pressed', String(color === state.color));
			button.addEventListener('click', () => selectColor(color));
			colors.append(button);
		});
		const picker = document.createElement('input');
		picker.type = 'color';
		picker.value = state.color;
		picker.setAttribute('aria-label', 'Choisir une couleur personnalisée');
		picker.addEventListener('input', () => selectColor(picker.value));
		colors.append(picker);

		shadow.querySelector('.launcher').addEventListener('click', () => {
			state.panel.hidden = !state.panel.hidden;
			if (!state.panel.hidden) setMode(state.mode);
		});
		shadow.querySelector('.close').addEventListener('click', () => { state.panel.hidden = true; });
		shadow.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
		shadow.querySelector('[data-highlight]').addEventListener('click', createHighlight);
		shadow.querySelector('[data-undo]').addEventListener('click', () => {
			if (!state.annotations.length) return setStatus('Aucune annotation à retirer.');
			state.annotations.pop();
			saveAnnotations();
			setStatus('Dernière annotation retirée.');
		});
	}

	function selectColor(color) {
		state.color = color;
		state.panel.querySelectorAll('.swatch').forEach((button, index) => {
			button.setAttribute('aria-pressed', String(COLORS[index] === color));
		});
		const picker = state.panel.querySelector('input[type="color"]');
		if (picker.value !== color) picker.value = color;
	}

	function installDrawing() {
		state.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		state.svg.id = SVG_ID;
		state.svg.setAttribute('aria-hidden', 'true');
		state.svg.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;overflow:visible;pointer-events:none;z-index:2147483645;';
		document.documentElement.append(state.svg);
		state.layer = document.createElement('div');
		state.layer.id = `${HOST_ID}_items`;
		state.layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483645;';
		document.documentElement.append(state.layer);

		document.addEventListener('pointerdown', (event) => {
			if (state.mode === 'highlight' || event.button !== 0 || state.host.contains(event.target) || state.layer.contains(event.target)) return;
			state.drawing = { x1: event.pageX, y1: event.pageY, x2: event.pageX, y2: event.pageY, mode: state.mode };
			document.documentElement.style.setProperty('cursor', 'crosshair', 'important');
			event.preventDefault();
		}, true);
		document.addEventListener('pointermove', (event) => {
			if (!state.drawing || ['note', 'link'].includes(state.drawing.mode)) return;
			state.drawing.x2 = event.pageX;
			state.drawing.y2 = event.pageY;
			const preview = { ...state.drawing, type: state.mode, color: state.color };
			state.annotations.push(preview);
			renderAnnotations();
			state.annotations.pop();
		}, true);
		document.addEventListener('pointerup', (event) => {
			if (!state.drawing) return;
			const { x1, y1, mode } = state.drawing;
			if (mode === 'note' || mode === 'link') {
				state.drawing = null;
				document.documentElement.style.removeProperty('cursor');
				if (mode === 'note') {
					const text = state.panel.querySelector('[data-note-text]').value.trim();
					if (!text) return setStatus('Saisissez le texte de l’annotation avant de la placer.');
					state.annotations.push({ type: 'note', text, color: state.color, x1, y1 });
				} else {
					const url = safeLink(state.panel.querySelector('[data-link-url]').value.trim());
					if (!url) return setStatus('Saisissez une adresse HTTP ou HTTPS valide.');
					const label = state.panel.querySelector('[data-link-label]').value.trim() || 'Ouvrir le lien';
					state.annotations.push({ type: 'link', href: url.href, label, color: state.color, x1, y1 });
				}
				saveAnnotations();
				setStatus(mode === 'note' ? 'Annotation ajoutée et enregistrée.' : 'Lien ajouté et enregistré.');
				return;
			}
			state.drawing.x2 = event.pageX;
			state.drawing.y2 = event.pageY;
			document.documentElement.style.removeProperty('cursor');
			const { x2, y2 } = state.drawing;
			state.drawing = null;
			if (Math.hypot(x2 - x1, y2 - y1) < 4) return renderAnnotations();
			state.annotations.push({ type: state.mode, color: state.color, x1, y1, x2, y2 });
			saveAnnotations();
			setStatus('Forme enregistrée.');
		}, true);
		window.addEventListener('scroll', renderAnnotations, { passive: true });
		window.addEventListener('resize', renderAnnotations, { passive: true });
		document.addEventListener('selectionchange', captureSelection);
	}

	if (!document.body || document.getElementById(HOST_ID)) return;
	state.annotations = loadAnnotations();
	makeInterface();
	installDrawing();
	renderAnnotations();
})();
