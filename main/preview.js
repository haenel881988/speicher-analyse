const fs = require('fs');
const readline = require('readline');

async function readFilePreview(filePath, maxLines = 500) {
    return new Promise((resolve) => {
        const lines = [];
        let totalLines = 0;
        let truncated = false;

        try {
            const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 });
            const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

            rl.on('line', (line) => {
                totalLines++;
                if (lines.length < maxLines) {
                    lines.push(line);
                } else if (!truncated) {
                    truncated = true;
                    rl.close();
                    stream.destroy();
                }
            });

            rl.on('close', () => {
                resolve({
                    content: lines.join('\n'),
                    totalLines,
                    truncated,
                    encoding: 'utf8',
                });
            });

            rl.on('error', (err) => {
                resolve({ content: '', error: err.message, totalLines: 0, truncated: false });
            });

            stream.on('error', (err) => {
                resolve({ content: '', error: err.message, totalLines: 0, truncated: false });
            });
        } catch (err) {
            resolve({ content: '', error: err.message, totalLines: 0, truncated: false });
        }
    });
}

module.exports = { readFilePreview };
