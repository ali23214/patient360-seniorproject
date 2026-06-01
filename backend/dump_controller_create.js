const fs = require("fs");
const path = require("path");

// Read the controller and extract the EmergencyReport.create({...}) block
const controllerPath = path.join(__dirname, "controllers", "emergencyController.js");
const code = fs.readFileSync(controllerPath, "utf8");

// Find the create block
const start = code.indexOf("EmergencyReport.create(");
if (start === -1) {
  console.log("Could not find EmergencyReport.create() in controller!");
  process.exit(1);
}

// Print 60 lines around it so we can see the entire payload
const lines = code.substring(0, start).split("\n").length;
const allLines = code.split("\n");
const slice = allLines.slice(lines - 5, lines + 30).join("\n");

console.log("═══ CONTROLLER LINES " + (lines - 5) + "–" + (lines + 30) + " ═══");
console.log(slice);
