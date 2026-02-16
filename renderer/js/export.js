export async function exportCSV(scanId) {
    try {
        const result = await window.api.exportCSV(scanId);
        if (result.success) {
            showToast('CSV exportiert: ' + result.path, 'success');
        }
    } catch (e) {
        showToast('CSV-Export fehlgeschlagen: ' + e.message, 'error');
    }
}

export async function exportPDF() {
    if (typeof html2pdf === 'undefined') {
        showToast('PDF-Bibliothek nicht geladen', 'error');
        return;
    }

    const content = document.getElementById('tab-content');
    const activeView = content.querySelector('.tab-view.active');
    if (!activeView) return;

    const clone = activeView.cloneNode(true);
    clone.style.display = 'block';
    clone.style.position = 'static';
    clone.style.overflow = 'visible';
    clone.style.maxHeight = 'none';
    clone.style.background = '#ffffff';
    clone.style.color = '#000000';
    clone.style.padding = '20px';

    const title = document.createElement('h2');
    title.textContent = 'Speicher Analyse - ' + new Date().toLocaleDateString('de-DE');
    title.style.marginBottom = '16px';
    title.style.color = '#000';
    clone.insertBefore(title, clone.firstChild);

    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.top = '-9999px';
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
        await html2pdf()
            .set({
                margin: 10,
                filename: `speicher-analyse-${Date.now()}.pdf`,
                image: { type: 'jpeg', quality: 0.95 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
            })
            .from(clone)
            .save();
        showToast('PDF exportiert', 'success');
    } catch (e) {
        showToast('PDF-Export fehlgeschlagen: ' + e.message, 'error');
    } finally {
        document.body.removeChild(wrapper);
    }
}

function showToast(message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '\u2705', error: '\u274C', info: '\u2139\uFE0F' };
    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.textContent = icons[type] || icons.info;
    const textSpan = document.createElement('span');
    textSpan.className = 'toast-text';
    textSpan.textContent = message;
    toast.appendChild(iconSpan);
    toast.appendChild(textSpan);
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'toastOut 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 4000);
}
