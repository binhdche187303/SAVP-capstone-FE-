// Tiện ích cho nội dung Rich Text (HTML) — sanitize theo whitelist, không phụ thuộc thư viện ngoài.
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'A', 'SPAN', 'BLOCKQUOTE']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE']);

const looksLikeHtml = (s) => /<\/?[a-z][\s\S]*>/i.test(s || '');

const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>');

export function sanitizeHtml(input) {
    if (!input) return '';
    // Mô tả cũ dạng plain text → escape và giữ xuống dòng
    if (!looksLikeHtml(input)) return escapeHtml(input);
    const doc = new DOMParser().parseFromString(`<div>${input}</div>`, 'text/html');
    const walk = (node) => {
        [...node.childNodes].forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) return;
            if (child.nodeType !== Node.ELEMENT_NODE || DROP_TAGS.has(child.tagName)) { child.remove(); return; }
            if (!ALLOWED_TAGS.has(child.tagName)) {
                walk(child);
                child.replaceWith(...child.childNodes);
                return;
            }
            const href = child.tagName === 'A' ? (child.getAttribute('href') || '').trim() : '';
            [...child.attributes].forEach((a) => child.removeAttribute(a.name));
            if (/^(https?:|mailto:)/i.test(href)) {
                child.setAttribute('href', href);
                child.setAttribute('target', '_blank');
                child.setAttribute('rel', 'noopener noreferrer');
            }
            walk(child);
        });
    };
    const root = doc.body.firstChild;
    walk(root);
    return root.innerHTML;
}

export function htmlToPlainText(input) {
    if (!input) return '';
    if (!looksLikeHtml(input)) return input;
    const withBreaks = input.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, (m) => `${m}\n`);
    const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
    return (doc.body.textContent || '').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
