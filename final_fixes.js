const fs = require('fs');

// Fix app.js
let appJs = fs.readFileSync('app.js', 'utf8');
// Use a more relaxed regex for isNative
appJs = appJs.replace(/isNative: !!window\.ReactNativeWebView.*/g, "  get isNative() {\n    return !!window.ReactNativeWebView || !!window.Capacitor || window.location.protocol === 'capacitor:';\n  },");
fs.writeFileSync('app.js', appJs, 'utf8');
console.log('Updated app.js isNative check');

// Fix styles.css
let stylesCss = fs.readFileSync('styles.css', 'utf8');
// Remove the negative margin and ensure centering
stylesCss = stylesCss.replace(/margin-top: -10px;/g, 'margin-top: 40px;');
stylesCss = stylesCss.replace(/align-items: flex-start;/g, 'align-items: center;');
fs.writeFileSync('styles.css', stylesCss, 'utf8');
console.log('Updated styles.css layout');
