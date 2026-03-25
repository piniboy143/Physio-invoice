const fs = require('fs');
const path = require('path');

const filePath = 'index.html';
const content = fs.readFileSync(filePath, 'utf8');

// The inline script starts after the last big library (XLSX) or similar
// From previous check, line 4677 is the comment "<!-- Local app.js -->"
// We want to delete everything from that comment to the end of the script block

const lines = content.split('\n');
const startIndex = lines.findIndex(line => line.includes('Local app.js'));

if (startIndex !== -1) {
    console.log(`Found app.js comment at line ${startIndex + 1}`);
    const newLines = lines.slice(0, startIndex);
    newLines.push('<script src="app.js"></script>');
    newLines.push('</body>');
    newLines.push('</html>');
    fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
    console.log('Successfully updated index.html');
} else {
    console.error('Could not find Local app.js comment');
}
