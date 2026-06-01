require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // Build a sample text document EXACTLY like the controller does
  const testDoc = {
    patientPersonId: new mongoose.Types.ObjectId(),
    reportedAt: new Date(),
    inputType: "text",
    textDescription: "test",
    location: { type: "Point", coordinates: [36.2765, 33.5138] },
    aiRiskLevel: "critical",
    aiAssessment: "test",
    aiFirstAid: ["step 1", "step 2"],
    aiConfidence: 0.85,
    aiModelVersion: "test",
    aiProcessedAt: new Date(),
    aiRawResponse: "{}",
    voiceTranscript: "",
    recommendAmbulance: true,
    ambulanceStatus: "not_called",
    status: "active",
  };

  console.log("Attempting insert with the exact shape the controller uses...");
  console.log("");

  try {
    await db.collection("emergency_reports").insertOne(testDoc);
    console.log("✅ INSERT SUCCEEDED — schema accepts this shape!");
  } catch (err) {
    console.log("❌ INSERT FAILED — here is the EXACT rejection reason:");
    console.log("");
    console.log(JSON.stringify(err.errInfo, null, 2));
  }

  // Cleanup the test doc
  await db.collection("emergency_reports").deleteMany({ aiAssessment: "test" });
  await mongoose.disconnect();
})();
