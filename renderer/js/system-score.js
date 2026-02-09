/**
 * System Score View - Overall system health dashboard with category breakdown.
 */

export class SystemScoreView {
    constructor(container) {
        this.container = container;
        this.scoreData = null;
        this._loaded = false;
    }

    async init() {
        if (this._loaded) return;
        this._loaded = true;
    }

    update(scoreData) {
        this.scoreData = scoreData;
        this.render();
    }

    render() {
        if (!this.scoreData) {
            this.container.innerHTML = '<div class="loading-state">System-Score wird berechnet...</div>';
            return;
        }

        const { score, grade, categories, riskLevel } = this.scoreData;
        const scoreClass = riskLevel === 'safe' ? 'score-good' : riskLevel === 'moderate' ? 'score-warn' : 'score-bad';

        this.container.innerHTML = `
            <div class="score-page">
                <div class="score-header">
                    <div class="score-ring-large ${scoreClass}">
                        <span class="score-number">${score}</span>
                        <span class="score-grade">${grade}</span>
                    </div>
                    <div class="score-header-info">
                        <h2>System-Gesundheit</h2>
                        <p class="score-summary">${this._getSummary(score)}</p>
                    </div>
                </div>
                <div class="score-categories">
                    ${categories.map(c => this._renderCategory(c)).join('')}
                </div>
            </div>`;
    }

    _renderCategory(cat) {
        const catClass = cat.score >= 70 ? 'score-good' : cat.score >= 40 ? 'score-warn' : 'score-bad';
        return `<div class="score-category-card">
            <div class="score-cat-header">
                <span class="score-cat-name">${cat.name}</span>
                <span class="score-cat-weight">${cat.weight}%</span>
            </div>
            <div class="score-cat-bar">
                <div class="score-cat-bar-fill ${catClass}" style="width:${cat.score}%"></div>
            </div>
            <div class="score-cat-footer">
                <span class="score-cat-value ${catClass}">${cat.score}</span>
                <span class="score-cat-desc">${cat.description}</span>
            </div>
        </div>`;
    }

    _getSummary(score) {
        if (score >= 90) return 'Ausgezeichnet! Dein System ist in einem sehr guten Zustand.';
        if (score >= 80) return 'Gut! Dein System ist gesund mit kleinen Verbesserungsmöglichkeiten.';
        if (score >= 70) return 'Befriedigend. Einige Bereiche könnten optimiert werden.';
        if (score >= 50) return 'Verbesserungsbedürftig. Mehrere Bereiche brauchen Aufmerksamkeit.';
        return 'Kritisch. Dein System braucht dringend Wartung.';
    }
}
