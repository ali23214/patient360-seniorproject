require("dotenv").config();
const mongoose = require("mongoose");
const EmergencyReport = require("./models/EmergencyReport");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // Build a doc through the actual Mongoose model (mirrors the controller)
  const doc = new EmergencyReport({
    patientPersonId: new mongoose.Types.ObjectId(),
    reportedAt: new Date(),
    inputType: "text",
    textDescription: "test",
    location: { type: "Point", coordinates: [36.2765, 33.5138] },
    aiRiskLevel: "critical",
    aiAssessment: "test",
    aiFirstAid: ["step 1"],
    aiConfidence: 0.85,
    aiModelVersion: "test",
    aiProcessedAt: new Date(),
    aiRawResponse: "{}",
    voiceTranscript: "",
    recommendAmbulance: true,
    ambulanceStatus: "not_called",
    status: "active",
  });

  console.log("═══ SHAPE MONGOOSE WILL SEND TO MONGODB ═══");
  console.log(JSON.stringify(doc.toObject(), null, 2));
  console.log("");

  console.log("═══ ATTEMPTING SAVE VIA MONGOOSE ═══");
  try {
    await doc.save();
    console.log("✅ Mongoose save() SUCCEEDED");
    await EmergencyReport.deleteOne({ _id: doc._id });
  } catch (err) {
    console.log("❌ Mongoose save() FAILED:");
    console.log(err.message);
    console.log("");
    if (err.errInfo) {
      console.log("MongoDB rejection details:");
      console.log(JSON.stringify(err.errInfo, null, 2));
    }
  }

  await mongoose.disconnect();
})();
