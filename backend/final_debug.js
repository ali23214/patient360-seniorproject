require("dotenv").config();
const util = require("util");
const mongoose = require("mongoose");
const EmergencyReport = require("./models/EmergencyReport");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // Mirror EXACTLY what the controller sends for a text submission
  const realPayload = {
    patientPersonId: new mongoose.Types.ObjectId(),
    reportedAt: new Date(),
    inputType: "text",
    textDescription: "صدري يؤلمني بشدة",
    imageUrl: undefined,
    audioUrl: undefined,
    location: { type: "Point", coordinates: [36.2765, 33.5138] },
    locationAddress: undefined,
    governorate: undefined,
    aiRiskLevel: "critical",
    aiAssessment: "الحالة المحتملة: نزيف شديد (دقة 95.2%)",
    aiFirstAid: [
      "اضغط بقوة على مكان النزيف بقماشة نظيفة",
      "ارفع الجزء المصاب فوق مستوى القلب إن أمكن",
      "اتصل بالإسعاف ١١٢ فوراً"
    ],
    aiConfidence: 0.952,
    aiModelVersion: "redwan-fastapi-v1.0.0",
    aiProcessedAt: new Date(),
    aiRawResponse: '{"ambiguity_level":"confident","class":"Severe_Bleeding"}',
    voiceTranscript: "",
    recommendAmbulance: true,
    ambulanceStatus: "not_called",
    status: "active",
  };

  console.log("═══ TRYING TO INSERT EXACT CONTROLLER PAYLOAD ═══");

  try {
    const doc = await EmergencyReport.create(realPayload);
    console.log("✅ SAVE SUCCEEDED — _id:", doc._id);
    await EmergencyReport.deleteOne({ _id: doc._id });
    console.log("(Test doc cleaned up)");
  } catch (err) {
    console.log("❌ SAVE FAILED");
    console.log("Error name:", err.name);
    console.log("Error message:", err.message);
    console.log("");
    if (err.errInfo) {
      console.log("═══ FULL UNTRUNCATED errInfo ═══");
      // util.inspect with depth: null shows EVERYTHING, no truncation
      console.log(util.inspect(err.errInfo, { depth: null, colors: false }));
    }
  }

  await mongoose.disconnect();
})();
