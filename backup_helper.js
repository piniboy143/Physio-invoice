const fs = require('fs');
const path = require('path');

// This script can be run locally using 'node backup_helper.js'
// It creates a JSON backup of the localStorage if you paste the string here
// Or it can be used to synchronize files if needed.

function syncBackup() {
    console.log("Invoice Studio Local Sync Helper");
    console.log("--------------------------------");
    console.log("To manually backup your data to this folder:");
    console.log("1. Open the app in your browser.");
    console.log("2. Open the sidebar and click 'Export & Import'.");
    console.log("3. Save the downloaded .xlsx file to this folder.");
    console.log("\nThis ensures your data is safe on your local drive and can be synced via cloud storage.");
}

syncBackup();
