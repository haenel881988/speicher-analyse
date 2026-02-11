'use strict';

/**
 * System Score - Calculates overall system health score (0-100).
 * Aggregates results from multiple analysis modules.
 */

/**
 * Calculate overall system health score from various module results.
 * @param {Object} results - Results from different modules
 * @param {Object} results.privacy - { score: number }
 * @param {Object[]} results.disks - Array of disk objects with healthScore
 * @param {Object} results.registry - { totalIssues: number }
 * @param {Object} results.optimizer - { appliedCount: number, totalCount: number }
 * @param {Object} results.updates - { pendingCount: number }
 * @param {Object} results.audit - { orphanedCount: number, totalPrograms: number }
 * @param {Object} results.security - { score: number, available: boolean } (from security-audit)
 * @returns {{ score: number, grade: string, categories: Object[], riskLevel: string }}
 */
function calculateSystemScore(results = {}) {
    const categories = [];

    // Security-Audit verfügbar? Gewichtungen anpassen
    const hasSecurity = results.security?.available === true;
    // Mit Security: 20% Security + 80% Rest (proportional skaliert)
    // Ohne Security: Gewichtungen wie bisher (100%)
    const scale = hasSecurity ? 0.8 : 1.0;

    // 1. Privacy (20% → 16% mit Security)
    const privacyScore = results.privacy?.score ?? 50;
    categories.push({
        id: 'privacy',
        name: 'Datenschutz',
        score: Math.round(privacyScore),
        weight: Math.round(20 * scale),
        icon: 'shield',
        description: privacyScore >= 80 ? 'Guter Datenschutz' :
            privacyScore >= 50 ? 'Datenschutz verbessern' : 'Datenschutz kritisch',
    });

    // 2. Disk Health (20% → 16% mit Security)
    let diskScore = 100;
    if (results.disks && results.disks.length > 0) {
        diskScore = Math.round(results.disks.reduce((sum, d) => sum + (d.healthScore || 100), 0) / results.disks.length);
    }
    categories.push({
        id: 'disk',
        name: 'Festplatten',
        score: diskScore,
        weight: Math.round(20 * scale),
        icon: 'hdd',
        description: diskScore >= 80 ? 'Festplatten gesund' :
            diskScore >= 50 ? 'Festplatten-Warnung' : 'Festplatten-Probleme',
    });

    // 3. Registry Health (15% → 12% mit Security)
    const regIssues = results.registry?.totalIssues ?? 0;
    const regScore = Math.max(0, 100 - regIssues * 2); // -2 per issue
    categories.push({
        id: 'registry',
        name: 'Registry',
        score: Math.round(regScore),
        weight: Math.round(15 * scale),
        icon: 'database',
        description: regIssues === 0 ? 'Registry sauber' :
            regIssues < 20 ? `${regIssues} Probleme gefunden` : `${regIssues} Probleme - Bereinigung empfohlen`,
    });

    // 4. System Optimization (15% → 12% mit Security)
    let optScore = 100;
    if (results.optimizer?.totalCount > 0) {
        optScore = Math.round((results.optimizer.appliedCount / results.optimizer.totalCount) * 100);
    }
    categories.push({
        id: 'optimizer',
        name: 'Optimierung',
        score: optScore,
        weight: Math.round(15 * scale),
        icon: 'zap',
        description: optScore >= 80 ? 'System optimiert' :
            optScore >= 50 ? 'Optimierungen verfügbar' : 'Viele Optimierungen ausstehend',
    });

    // 5. Updates (15% → 12% mit Security)
    const pendingUpdates = results.updates?.pendingCount ?? 0;
    const updateScore = Math.max(0, 100 - pendingUpdates * 10); // -10 per pending update
    categories.push({
        id: 'updates',
        name: 'Updates',
        score: Math.round(updateScore),
        weight: Math.round(15 * scale),
        icon: 'download',
        description: pendingUpdates === 0 ? 'Alles aktuell' :
            `${pendingUpdates} Update${pendingUpdates !== 1 ? 's' : ''} ausstehend`,
    });

    // 6. Software Health (15% → 12% mit Security)
    let softwareScore = 100;
    if (results.audit?.totalPrograms > 0) {
        const orphanRatio = (results.audit.orphanedCount || 0) / results.audit.totalPrograms;
        softwareScore = Math.round(Math.max(0, 100 - orphanRatio * 200)); // -2 per % orphaned
    }
    categories.push({
        id: 'software',
        name: 'Software',
        score: softwareScore,
        weight: Math.round(15 * scale),
        icon: 'package',
        description: softwareScore >= 80 ? 'Software sauber' :
            softwareScore >= 50 ? 'Verwaiste Einträge gefunden' : 'Viele Software-Reste',
    });

    // 7. Security (20% — nur wenn Audit verfügbar)
    if (hasSecurity) {
        const secScore = Math.max(0, Math.min(100, results.security.score));
        categories.push({
            id: 'security',
            name: 'Sicherheit',
            score: secScore,
            weight: 20,
            icon: 'lock',
            description: secScore >= 80 ? 'System gut geschützt' :
                secScore >= 50 ? 'Sicherheitsprobleme gefunden' : 'Kritische Sicherheitsmängel',
        });
    }

    // Calculate weighted total
    const totalWeight = categories.reduce((s, c) => s + c.weight, 0);
    const weightedScore = categories.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight;
    const score = Math.round(Math.max(0, Math.min(100, weightedScore)));

    // Grade
    let grade;
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 50) grade = 'D';
    else grade = 'F';

    // Risk level
    let riskLevel;
    if (score >= 70) riskLevel = 'safe';
    else if (score >= 40) riskLevel = 'moderate';
    else riskLevel = 'high';

    return { score, grade, categories, riskLevel };
}

module.exports = { calculateSystemScore };
